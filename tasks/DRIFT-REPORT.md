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

## Resolution

All of Findings 1–2 and the "unrelated pre-existing" bullets above were fixed
in a follow-up commit, tracked as `tasks/P0-T02b.json` (its own scoped card,
since the fix touches 7 source files — outside P0-T02's mayTouch). Result:
`pnpm run typecheck` now exits 0. See P0-T02b.json for exactly what changed
and why each change was safe (each was independently verified to introduce
zero new errors before being applied).

## Finding 4 — `pnpm run lint` has 84 pre-existing errors, unrelated to any of the above

Running lint (not part of P0-T02's or P0-T02b's exit criteria, checked for
completeness) surfaces 84 errors across ~10 files — almost entirely
`@typescript-eslint/no-explicit-any` in test files under
`src/core/macro/psIsonote/professional/` and `src/core/macro/steps/`, plus a
`prefer-const` and six `no-console` violations in `rca.test.ts` (see Finding
5). This directly qualifies the audit's headline claim ("1 `as any` across
817 source files") — that count is accurate for hand-written `as any` casts
in application source, but does not cover `: any` type annotations in test
files, which lint catches separately and which are numerous. Not fixed here:
84 errors is far outside any task's file budget and needs its own scoped
card (proposed: one per directory, e.g. `professional/*.test.ts` and
`macro/steps/*.ts`).

## Finding 5 — Four pre-existing test:ci failures, unrelated to dependency drift

`pnpm run test:ci -- --reporter=verbose` fails on 4 of 1682 tests (295/299
files pass), all of them pre-existing (reproduced identically before and
after P0-T02b's changes):

1. **`rca.test.ts` — hardcoded absolute Windows path.** `rca.test.ts:8` reads
   `'D:/Code3/Tag to PDF/BM2/AML-88-PDFEED-MP-2343-00010-0315-001.pdf'` — a
   developer's local filesystem path. This reads as a debugging scratch file
   ("RCA" = root-cause analysis) accidentally committed as a real test; it
   cannot pass in any CI environment. Proposed fix: delete the file or gate
   it behind an environment variable / `it.skip` with a tracking note — a
   human call on which, since R-5 forbids silently skipping tests.
2. **Three tests share what looks like one root cause** — a PDF
   marker/callout verification pipeline that reports "missing"/`false` for
   content that should be found:
   - `output-verifier.test.ts` — "verifies callouts by acquiring document and
     parsing visible text and markers (AD-07)": `report.passed` expected
     `true`, got `false`.
   - `psIsonoteVerification.test.ts` — "verifies an output with matching
     hash, page count, and exactly one marker": same `false`-instead-of-`true`
     shape.
   - `psIsonoteVerification.test.ts:116` — "rejects duplicate markers…":
     expects `{status:'duplicate', foundCount:2}`, gets
     `{status:'missing', foundCount:0}` — the scanner isn't finding a marker
     that's present twice in the fixture, let alone flagging the duplicate.

   All three runs print `Warning: Please use the 'legacy' build in Node.js
   environments` from pdfjs-dist before failing, which suggests the shared
   cause is the PDF text-extraction path used by
   `verifyProfessionalCalloutOutput`/`verifyPsIsonoteOutput` in the
   jsdom/Node test environment — possibly the pinned pdfjs-dist@5.6.205
   behaving differently under Node than whatever version these
   marker-detection tests were originally written and passing against. This
   is plausibly a **real instance of C-2** (dependency version resolved
   differently than the code/tests assume) rather than an unrelated bug, but
   confirming that requires investigating `PdfRendererAdapter`'s document
   loading path and the verifier's marker-scanning logic together — deeper
   than this report should go without becoming an unplanned fix. Proposed:
   a dedicated task to (a) confirm whether switching to
   `pdfjs-dist/legacy/build/pdf.mjs` in the test environment changes the
   result, and (b) only then decide whether the verifier or the fixtures
   need to change.

None of the four are caused by the lockfile, by P0-T02b's changes, or by
anything else in this programme so far.

## Finding 6 — A second, weaker HTML sanitizer exists in the export path (found during P1-T04)

M-2's `change` list cites `content-ops.ts:268` and `exporter.ts:81` as
callers of `htmlSanitizer.ts`'s `sanitizeHtml`/`sanitizeHtmlWithReport`.
They aren't. Both actually call `sanitizeWriterHtml`, a **separate,
regex-based sanitizer defined locally in `exporter.ts`** (strips
`<script>`/`<style>`/`<iframe>`/`<object>`/`<embed>`/`<form>` tags and
`on*=`/`javascript:` via regex — no DOMParser, no allowlist, no node/depth
bounds, no href/image validation). It is unrelated to any of the fixes in
P1-T04 and does not benefit from them.

The real callers of `htmlSanitizer.ts` are `RichTextEditorPanel.tsx` and
`WriterElementNode.tsx` (5 call sites across the two files) — P1-T04
fixed truncation-surfacing there instead, since that's where the fixed
sanitizer is actually used.

`sanitizeWriterHtml`'s regex approach is a known-fragile pattern for HTML
sanitization (nested/malformed tags, encoded entities, and split
attributes can all defeat a single-pass regex in ways a DOMParser
reconstruction doesn't) and is used to build canvas-rendered export
output from Writer element content — the same untrusted-content surface
`htmlSanitizer.ts` was hardened for. Proposed: a dedicated task to
either route `exporter.ts`'s two call sites through `sanitizeHtml`
instead, or audit `sanitizeWriterHtml`'s regexes directly. Not attempted
here — replacing a whole sanitizer implementation is a materially
different, larger task than patching 5 defects in the one already
judged sound.

## Finding 7 — `check:static`'s no-console.log rule has a pre-existing failure (found during P2-T02)

P2-T02's exit criterion is `cd frontend && pnpm run check:all`, which
chains `test:ci` (Finding 5's 4 failures) and then `check:static`.
Verified `check:static` independently: it also fails on its own,
for a reason unrelated to both P2-T02 and Finding 5 —
`scripts/static-contract-checks.mjs`'s "no console.log in source" rule
flags 52 pre-existing `console.log(...)` calls in
`src/core/macro/psIsonote/bm2_benchmark.test.ts`, a debug/audit-logging
test file (`[BM2 Audit] ...` messages) that predates this programme.
Not fixed here — same reasoning as Findings 4/5: this task's actual
change (collapsing the certify:ocr-phase* scripts) is independently
verified working (`pnpm run certify:ocr`: 58/58 test files, 398/398
tests passing), and `check:all`/`check:static` were already unable to
exit 0 before this task touched anything. Needs its own task: either
silence the specific file (if the console output is intentional

## Finding 8 — `Content-Security-Policy-Report-Only` cannot be delivered via `<meta>`, and GitHub Pages can't set custom headers at all (found during P2-T04)

P2-T04's card asks for a `Content-Security-Policy-Report-Only` **meta**
tag in `frontend/index.html`. Implemented it, then verified with a
headless Chromium load (Playwright) before trusting it: the browser
prints *"The report-only Content Security Policy '...' was delivered
via a `<meta>` element, which is disallowed. The policy has been
ignored."* and does nothing with it. This isn't a bug in the policy
string — it's spec-defined (CSP3 §"Delivery"): only the **enforcing**
`Content-Security-Policy` header can be delivered via `<meta>`;
`-Report-Only` is HTTP-header-only, in every browser, by design (a meta
tag can't carry the out-of-band violation-reporting semantics the
Report-Only mode exists for). No amount of correct policy content fixes
this — a meta tag is architecturally the wrong delivery mechanism.

That would ordinarily just mean "use the header instead" — which is
exactly what `frontend/nginx.conf` now does (real, functional, for
anyone deploying via the Docker/nginx path in this repo). But the
actual **live** deployment (`https://reallaksh19.github.io/Pdf-Hub/`,
per `.github/workflows/deploy.yml`) is GitHub Pages, which serves
static files with no mechanism to set custom HTTP response headers at
all. So on the one URL this app is actually reachable at today, there
is currently no way to ship a working Report-Only CSP — not via meta
(browsers ignore it), not via a header (the host can't set one).

Did not ship the non-functional meta tag — a silently-ignored policy
gives false confidence that violations are being monitored when they
aren't, which is worse than shipping nothing. Left a comment in
`index.html` explaining why, pointing here.

This needs a human decision, not a code fix: either (a) move the live
deployment to a host that supports custom response headers (Cloudflare
Pages, Netlify, Vercel, S3+CloudFront, etc.) and use nginx.conf's header
as the template, or (b) front GitHub Pages with something that can
inject headers (a Cloudflare Worker or similar reverse proxy), or (c)
accept that CSP monitoring only exists for the nginx/Docker deployment
path and the GitHub Pages live site stays unmonitored. Everything else
in this card is done: fonts are self-hosted
(`frontend/public/fonts/`, 4 files, ~99 KB total, weight/style
combinations matching what the Google Fonts stylesheet previously
requested) and `index.html` no longer references
`fonts.googleapis.com`/`fonts.gstatic.com` at all — verified with a
production build that the self-hosted font URLs correctly pick up the
`/Pdf-Hub/` base path (Vite rewrites `url(/fonts/...)` in CSS the same
way it rewrites the favicon link, confirmed by inspecting the compiled
CSS in `dist/`).
debugging tooling, exempt it from the rule) or convert it to structured
logging like the rest of the codebase.

## Recommendation

P0-T02's own scope (lockfile/package.json reconciliation) is complete: no
drift to reconcile, confirmed by a clean `--frozen-lockfile` install.
P0-T02b closed the typecheck gap. Two things remain genuinely open before
`pnpm run test:ci` is green and before lint is enforceable in CI — Findings
4 and 5 — and both need their own scoped task cards rather than folding into
P0-T03. P0-T03 (wiring guards into CI) does not itself require green
typecheck/test/lint to install correctly, so it is not blocked by these.
