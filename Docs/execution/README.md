# Execution Control Plane

This folder is the execution control plane for multi-agent delivery.

## Scope
- Frontend only.
- No backend/API changes in this phase.
- Static-mode safe implementation.

## Public Interfaces / Types to Add
- `core/commands/types.ts`: `DocumentCommand`, `CommandSource`, `CommandResult`, `CommandContext`.
- `core/commands/dispatch.ts`: single execution entrypoint for toolbar, thumbnail menu, macro runner, shortcuts.
- `core/document-history/types.ts` and `store.ts`: document mutation undo/redo transactions.
- `core/session/types.ts`: explicit save/export action types and last operation metadata.
- `core/search/types.ts`: text hit geometry and active result model.
- `core/review/types.ts`: thread metadata and review summary export model.

## Dependency Waves
- Wave 0: A0 creates execution scaffolding and merge policy docs.
- Wave 1: A1 lands command bus + document mutation history foundation.
- Wave 2: A2, A3, A4, A5, A6, A7 run in parallel on disjoint scopes using A1 contracts.
- Wave 3: A8 performs cross-cutting hardening, accessibility, and test expansion.
- Wave 4: A0 integrates, runs global gate, resolves conflicts, and signs off.

## Merge Order
1. A1
2. A4
3. A5
4. A2
5. A3
6. A6
7. A7
8. A8
9. A0 final integration
