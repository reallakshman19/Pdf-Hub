# P0-T02 — Dependency drift report

**Task:** P0-T02 — Reconcile dependency drift exposed by the frozen install
**Result:** ESCALATED. `pnpm install --frozen-lockfile` itself succeeds with zero
lockfile changes — the lockfile already matches `frontend/package.json` exactly,
so there is no version drift for this task to reconcile. `pnpm-lock.yaml` and
`frontend/package.json` are therefore **not modified** by this task.

However, running the frozen install for the first time in a clean environment
(no pre-existing `node_modules`) exposes that `pnpm run typecheck` does not
pass against the exact versions the lockfile pins. Per the card's rule —
*"Do NOT change source files to make tests pass"* and *mayTouch* being limited
to `pnpm-lock.yaml`, `frontend/package.json`, `tasks/DRIFT-REPORT.md` — none of
the fixes below are in scope for this task. Recording them here instead, as
the card's own escalation path directs.

## What was run

```
$ cd frontend && pnpm install --frozen-lockfile
Done in 875ms using pnpm v10.33.0
(exit 0, no lockfile diff)

$ git diff --stat pnpm-lock.yaml
(no output — untouched)
```

## Finding 1 — `src/modules.d.ts` shadows pdfjs-dist's real types with a stale hand-written shim

`frontend/src/modules.d.ts:1` declares `declare module 'pdfjs-dist' { ... }` —
a small hand-written ambient module with 5 members (`GlobalWorkerOptions`,
`PDFDocumentProxy`, `PDFPageProxy`, `getDocument`, `version`). Because it's an
ambient `declare module` for a package that already ships its own types
(`pdfjs-dist`'s `package.json` points `types` at `types/src/pdf.d.ts`, which
does export `PageViewport`, `Util`, and a `RenderTask` whose `.cancel()`
render-task shape differs from the shim's `{ promise: Promise<void> }`), the
local shim **wins** name resolution and completely discards the real,
complete type surface.

Result — 11 typecheck errors in `src/adapters/pdf-renderer/PdfRendererAdapter.ts`
and its test file: `PageViewport`/`Util` "has no exported member," `.cancel()`
"does not exist" on the render task, and a few resulting `unknown`/implicit-`any`
errors that cascade from those.

This is **not** caused by any version move — `pdfjs-dist@5.6.205` is exactly
what both the lockfile and `package.json`'s `^5.6.205` range already agreed on
before this task ran. The shim has simply been stale relative to the real
package for some time, and nothing before this task ever ran a build that
would catch it (see Finding 3).

**Proposed fix (separate task, not this one):** delete `src/modules.d.ts`'s
`pdfjs-dist` shim entirely and let TypeScript resolve the package's own
`types/src/pdf.d.ts`; fix up the ~11 resulting call sites in
`PdfRendererAdapter.ts` (`.cancel()` on `RenderTask` needs the real
`RenderTask` type, `textContent` needs its real return type from
`getTextContent()`, etc.).

## Finding 2 — `vite.config.ts:29` uses a `workerExecArgs` vitest option that doesn't exist in the pinned vitest version

```
vite.config.ts(29,5): error TS2769: No overload matches this call.
  Object literal may only specify known properties, and 'workerExecArgs' does not exist in type 'InlineConfig'.
```

`vitest@4.1.4` (pinned, matches lockfile) has no `workerExecArgs` top-level
test option — the comment above it ("Increase heap for workers loading
pdfjs-dist + pdf-lib") suggests this was written against an older vitest
where the option existed under a different name/shape (modern vitest exposes
worker heap sizing under `poolOptions.threads`/`poolOptions.forks`, not a
top-level `workerExecArgs`). Same category as Finding 1: not a version move,
a config file that predates the currently-pinned vitest release.

**Proposed fix (separate task):** replace with the vitest 4.x equivalent
(`poolOptions.threads.execArgv` or `poolOptions.forks.execArgv`, whichever
matches `pool: 'threads'` set on the line above) — needs a human/task decision
on which pool option is intended, since the two have different semantics.

## Finding 3 — these breakages are invisible today because CI never runs a real install

Both findings above are only visible when `node_modules` is populated fresh
from the committed lockfile. Every workflow currently in this repo (before
P0-T01, this session) ran `pnpm install --no-frozen-lockfile`, which
re-resolves within each package's caret range on every run rather than using
the committed pins — so CI's actual installed tree has likely never matched
`pnpm-lock.yaml` exactly, and these two staleness bugs were never exercised by
CI's typecheck step in the pinned-version configuration. This is exactly the
C-2 audit finding ("a green build proves nothing about what ships") — findings
1 and 2 are concrete instances of it, not new problems.

## Unrelated pre-existing typecheck errors observed (not investigated further, listed for completeness)

These appeared in the same `pnpm run typecheck` run and look like ordinary
pre-existing lint/type issues unrelated to dependency versions — flagging so
they aren't lost, not fixing them here (out of scope for P0-T02):

- `src/components/sidebar/PsIsonoteSampleLoader.tsx:7,22` — `LucideIcon` imported as a value but used as a type/unused.
- `src/core/annotation-placement/index.ts`, `src/core/annotation-rendering/index.ts`, `src/core/annotation-typography/index.ts` — re-export several names (`PageLayoutOptions`, `LayoutSolution`, `LeaderPath`, `BoxModel`, `StyleProfile`, `formatIsonoteWithConfidence`) that their source modules no longer export.
- `src/core/macro/psIsonote/bm2_benchmark.test.ts:99` — unused `rotation` variable.

## Recommendation

- Do not merge P0-T03 (CI wiring) on the assumption that `pnpm run typecheck`
  is currently green — it is not, independent of anything this program has
  touched. Either fix Findings 1–2 in a dedicated task before P0-T03's CI
  gate goes live, or have P0-T03 land with typecheck allowed to be red and
  schedule the fix immediately after (human call — this is exactly the
  "requires a decision" escalation the card anticipates, just from an
  unexpected angle: not a major version bump, but a source-level shim that
  predates and disagrees with the already-pinned dependency version).
