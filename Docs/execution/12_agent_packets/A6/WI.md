# WI_A6

## Goal
Deliver production-safe implementation for preset lifecycle, dry-run validation, donor binding, batch reports, integrated with existing architecture and with no duplicate mutation execution path.

## Owned write scope
- preset lifecycle, dry-run validation, donor binding, batch reports
- Agent-specific UI/state wiring required for this feature.

## Forbidden write scope
- Backend code and API contracts.
- Unrelated UI refactors outside the owned scope.
- Any direct page/document mutation path bypassing command dispatcher.

## Required deliverables
- Functional feature implementation in owned scope.
- Updated docs under Docs/execution/30_evidence/A6/RESULT.md.
- Regression-safe integration against current ribbon/sidebar/workspace flows.

## Critical code snippets (target shape)
```ts
interface MacroRunReport {
  recipeId: string;
  recipeHash: string;
  startedAtIso: string;
  files: Array<{ fileName: string; ok: boolean; stepErrors: string[] }>;
}

if (dryRun) {
  return validateRecipe(runtimeRecipe, bindings);
}
```

## Quantitative pass tests (must be measurable)
1. corepack pnpm --filter frontend exec tsc --noEmit exits 0.
2. corepack pnpm --filter frontend lint exits 0.
3. corepack pnpm --filter frontend test exits 0.
4. In files modified by this WI, count(window.prompt() occurrences) = 0.
5. In files modified by this WI, count(direct replaceWorkingCopy() additions outside command/history layer) = 0.
6. During 10-step manual run for this WI, uncaught exceptions count = 0.

## Manual validation matrix (quantitative)
- Browser matrix: Chrome latest + Edge latest.
- Each critical user flow executed 3 consecutive times with failure count = 0.
- Expected-vs-actual checklist completion ratio = 100%.

## Rollback criteria
- Any pass-test command non-zero exit.
- Any reproducible regression in existing workflow.
- Any command-bus bypass introduced by this WI.

## Evidence checklist
- [ ] Git diff summary scoped to WI.
- [ ] Command outputs for all quantitative pass tests.
- [ ] Manual validation table with run counts and pass/fail totals.
- [ ] Defects found/fixed log.
- [ ] Residual risk statement.
