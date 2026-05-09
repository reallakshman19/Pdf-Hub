# PDF Hub — Enhanced Macro Certification

## Scope

This certification covers the Enhanced Macro implementation:

- Phase F — Macro engine safety
- Phase G — Macro validation and security
- Phase H — Macro schema, recipe catalog and storage
- Phase I — Macro builder UI, import/export and run panels
- Phase J — Macro dropdown, app integration and certification

## Required command

Run from `frontend/`:

    npm run certify:macro

Equivalent expanded command:

    npm run typecheck
    npm run test
    npm run audit:macro
    npm run build

## Numeric pass criteria

| Gate | Required Result |
|---|---:|
| TypeScript errors | 0 |
| Unit test failures | 0 |
| Macro static audit failures | 0 |
| Build errors | 0 |
| Registry unknown-op throws | 0 |
| Dry-run bytes mutated | 0 |
| Failed aborting macro partial mutation | 0 |
| Unsafe image mutation side effects | 0 |
| Unsafe HTML/CSS accepted | 0 |
| Invalid nested conditional accepted | 0 |
| Invalid imported recipe accepted | 0 |

## Required automated tests

At minimum, these suites must pass:

    npx vitest run src/core/macro/executor.phaseF.test.ts
    npx vitest run src/core/macro/transaction.phaseF.test.ts
    npx vitest run src/core/macro/validator.phaseG.test.ts
    npx vitest run src/core/macro/security.phaseG.test.ts
    npx vitest run src/core/macro/security.revised.phaseG.test.ts
    npx vitest run src/core/macro/schema/opSchema.phaseH.test.ts
    npx vitest run src/core/macro/builder/recipeBuilderState.phaseH.test.ts
    npx vitest run src/core/macro/recipes/builtInRecipes.phaseH.test.ts
    npx vitest run src/core/macro/recipes/recipeStorage.phaseH.test.ts
    npx vitest run src/components/macro/builder/MacroRecipeBuilder.phaseI.test.tsx
    npx vitest run src/components/macro/builder/MacroStepEditor.phaseI.test.tsx
    npx vitest run src/components/macro/builder/MacroRecipeImportExport.phaseI.test.tsx
    npx vitest run src/core/macro/macroCertification.wave7.test.ts
    npx vitest run src/components/macro/MacroDropdown.phaseJ.test.tsx
    npx vitest run src/components/macro/MacroPanel.phaseJ.test.tsx

## Manual smoke test matrix

### M1 — Dropdown opens

Expected: Macro recipe dropdown opens, built-in recipes are visible, and filters work.

Result: PASS / FAIL

### M2 — Builder opens

Expected: MacroRecipeBuilder opens with palette, step list, editor, and validation panel.

Result: PASS / FAIL

### M3 — Add step

Expected: Added step appears in list, editor opens, and validation updates.

Result: PASS / FAIL

### M4 — Import/export

Expected: Valid recipe imports; invalid JSON and invalid recipe are rejected.

Result: PASS / FAIL

### M5 — Dry-run

Expected: Dry-run completes, no PDF bytes are committed, and result panel shows details.

Result: PASS / FAIL

### M6 — Normal run

Expected: Macro executes and byte update is routed only through the host app controlled commit path.

Result: PASS / FAIL

### M7 — Security

Expected: Unsafe image and unsafe CSS are blocked, and unsafe image error emits no bytes_updated side effect.

Result: PASS / FAIL

### M8 — Recursive validation

Expected: Conditional recipe with nested `{ "op": "not_registered" }` is rejected.

Result: PASS / FAIL

### M9 — Writer paste isolation

Expected: Macro builder text fields have native paste; Writer paste controller does not intercept macro fields.

Result: PASS / FAIL

### M10 — Certification command

Expected: `npm run certify:macro` gives TypeScript errors 0, test failures 0, static audit failures 0, build errors 0.

Result: PASS / FAIL

## Certification sign-off

Certified by: ____________________

Date: ____________________

Commit/build: ____________________

Result:

- [ ] PASS
- [ ] FAIL

Notes:
