# AGENT_PROTOCOL.md

> **Precedence:** `AGENTS.md` (architectural invariants) > this file (execution protocol) > task card > your judgment.
> Where a task card conflicts with this file, this file wins. Where your judgment conflicts with anything above, escalate.

This file exists because good intentions do not survive a long session. Every rule below is enforced by a script in CI. Nothing here relies on you remembering it.

---

## 0. The loop

Every unit of work is exactly this, with no steps skipped or reordered:

```
1. READ    tasks/STATE.json          → tells you the one active task
2. READ    tasks/<activeTask>.json   → tells you exactly what to do
3. CHECK   preconditions             → run every command; all must pass
4. BRANCH  task/<id>                 → one task, one branch, one PR
5. CHANGE  only files in mayTouch    → nothing else, for any reason
6. VERIFY  every exit criterion      → paste real terminal output in the PR
7. UPDATE  tasks/STATE.json          → move id to completed, set next activeTask
8. STOP    → open the PR. Do not begin the next task.
```

Step 8 is not optional. **You do not choose the next task.** A merged PR and an updated `STATE.json` are the handoff. Chaining tasks in one session is the single most common way this programme drifts.

---

## 1. Rules

### R-1 — One active task

```
RULE:  tasks/STATE.json has exactly one activeTask.
TEST:  node scripts/guard-scope.mjs   →  exit 0
```

If `activeTask` is empty, or you believe two tasks should run in parallel, **stop and escalate**. Parallel tasks are a human decision because their `mayTouch` lists may overlap.

### R-2 — The card defines scope; you may not edit the card

```
RULE:  A PR may only change files matched by its card's mayTouch list,
       and may not change that card's mayTouch or maxFiles.
TEST:  node scripts/guard-scope.mjs origin/main   →  exit 0
```

This is the primary anti-drift mechanism, and it is deliberately rigid.

If the correct fix genuinely requires a file outside `mayTouch`, that is **information, not an obstacle**. It means the task was mis-scoped. Record which file and why, and escalate. Widening the list yourself is the failure mode this guard exists to catch, and the guard compares your card against `origin/main` specifically so that you cannot.

> "While I was in there I also fixed…" is a scope violation even when the fix is correct.
> A good change in the wrong PR is still drift, because it makes the PR unreviewable and the revert unsafe.

### R-3 — Fixed bugs never return

```
RULE:  Six patterns are permanently banned repo-wide.
TEST:  node scripts/guard-forbidden.mjs   →  exit 0
```

| ID | Ban | Origin |
|---|---|---|
| FB-1 | `--no-frozen-lockfile` in any workflow | C-2, non-reproducible deploys |
| FB-2 | `createObjectURL` outside 4 allowlisted owners | M-1, five copies, four buggy |
| FB-3 | Store hooks called with no selector | H-1, full-store re-render storms |
| FB-4 | Static `pdf-lib` / `html2canvas` imports | H-2, defeats code splitting |
| FB-5 | Recreating `core/`, `archive/`, `LICENSE-backend` | H-4, diverged shadow tree |
| FB-6 | `new Uint8Array(bytes)` in session store | C-3, whole-PDF copies |

### R-4 — Counters only move toward zero

```
RULE:  Every counter in tasks/RATCHET.json may decrease or hold. Never increase.
TEST:  node scripts/guard-ratchet.mjs   →  exit 0
```

This catches the pattern where three instances of a problem are fixed and two new ones are introduced elsewhere in the same PR. Net-negative is not good enough; the number must not go up.

`--update` re-baselines and is legitimate **only** in the specific tasks that say so (P0-T03, P2-T02, P4-T01, P4-T02). Running it to make a red build green is falsifying the record.

### R-5 — Never weaken a gate to pass it

```
BANNED, without exception:
  - deleting or skipping a failing test (.skip, .todo, xit, commenting out)
  - lowering a coverage threshold
  - adding eslint-disable, @ts-ignore, @ts-expect-error, or `any`
  - re-adding --no-frozen-lockfile, --force, or --legacy-peer-deps
  - running guard-ratchet.mjs --update outside a task that authorises it
  - editing a guard script to make your own PR pass
```

A red gate is a finding. Report it. The repo currently holds `0` `@ts-ignore` and `1` `as any` across 817 files — that is an asset, and it is easier to keep than to recover.

If a test asserts behaviour you believe is wrong, **do not delete it**. Some downstream consumer may depend on that behaviour. Report it and stop.

### R-6 — Verification is pasted output, not a claim

Every PR body must contain, for each exit criterion, the command and its **actual terminal output**.

```
✗ "Typecheck passes."
✓ $ cd frontend && pnpm run typecheck
  > tsc -b --pretty false
  (no output, exit 0)
```

"Should work", "appears correct", and "I've verified" are not verification. If you did not run it, say you did not run it.

### R-7 — Read the path twice

Two path pairs in this repo are traps that have already cost time:

| Live | Trap |
|---|---|
| `frontend/src/core/` | `core/` at repo root — deleted in P2-T01, was 504 diff lines stale |
| `frontend/src/core/commands/dispatch.ts` | `core/commands/dispatch.ts` |

Before editing any file under a `core/` path, run `pwd` and confirm the full path begins `frontend/src/`.

### R-8 — Escalate rather than improvise

**Stop immediately and hand back** when any of these occur:

- a precondition command fails
- the fix requires a file outside `mayTouch`
- the change exceeds `maxFiles`
- an exit criterion cannot be met
- a test asserts the behaviour you were told to change
- you are about to do anything in R-5
- the task instruction is ambiguous and you are about to pick an interpretation
- you find a second bug while fixing the first

That last one matters most. **Finding an unrelated bug is a successful outcome — write it down, do not fix it.** File it as a proposed task card. An unplanned fix has no test plan, no scope review, and no rollback story.

### R-9 — The card's `forbidden` list is exhaustive of intent, not of imagination

Each card lists explicit non-goals. They are there because that specific expansion is tempting and wrong. But the list is illustrative: **if a change is not required by the card's `change` steps, it is out of scope**, whether or not it appears in `forbidden`.

### R-10 — Guard scripts and workflow are immutable outside their own task

```
RULE:  scripts/guard-*.mjs and .github/workflows/guards.yml may only be
       modified by P0-T03 (install) or a human-reviewed PR whose title
       says so explicitly.
TEST:  no other card lists those paths in mayTouch, so guard-scope.mjs
       rejects any other task's diff that touches them.
```

If a guard is wrong, that is a finding, not a license to edit it from inside an unrelated task. Escalate.

---

## 2. PR template

```markdown
## Task
<id> — <title from card>

## Preconditions
$ <command>
<pasted output>

## Change
<2-4 sentences. What changed and why, in the card's terms.>

## Exit criteria
### <criterion 1 from card>
$ <command>
<pasted output>

### <criterion 2 from card>
$ <command>
<pasted output>

## Guards
$ node scripts/guard-scope.mjs origin/main
$ node scripts/guard-forbidden.mjs
$ node scripts/guard-ratchet.mjs
<pasted output for all three>

## Out of scope but observed
<Bugs, smells, or surprises found while working. Do not fix them here.
 Propose a task card instead. Write "none" if none.>

## STATE.json
activeTask: <id> → <next id>
```

---

## 3. Local pre-flight

Run before every push. If any line fails, do not push.

```bash
node scripts/guard-scope.mjs origin/main   # scope + card tamper
node scripts/guard-forbidden.mjs           # no regressions
node scripts/guard-ratchet.mjs             # counters held
cd frontend && pnpm run typecheck && pnpm run lint && pnpm run test:ci
```

Optionally wire it into `.husky/pre-push` so the machine enforces it rather than you.

---

## 4. Why the plan is shaped this way

Two ordering constraints are load-bearing and must not be resequenced:

**Phase 0 comes first because nothing else is measurable without it.** All five workflows currently install with `--no-frozen-lockfile`. Until that is fixed, a green CI run proves nothing — the dependency tree that passed is not the tree that ships. Every exit criterion in every later task depends on CI meaning something.

**P1-T01 comes before P3-T01 because bounding an incorrect parser ships a bounded incorrect parser.** The CSV parser silently discards rows when it meets an unescaped quote. Adding byte and row limits to it first would produce a system that correctly rejects oversized input and silently corrupts valid input.

Everything else may be resequenced within its phase, by a human, in a PR that edits the cards.
