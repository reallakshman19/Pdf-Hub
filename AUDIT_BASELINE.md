# AUDIT_BASELINE - DocCraft

_Captured before and after Phase 1 changes. Rows are kept stable for later phases._

## Static Counts

| Check | Command | Before | After Phase 1 | After Phase 6 | Target |
|-------|---------|--------|---------------|---------------|--------|
| createRoot calls | `grep -rn "createRoot" frontend/src \| wc -l` | 5 | 5 | 1 | 1 |
| as any in toolbar | `grep -rn "as any" frontend/src/components/toolbar/ \| wc -l` | 7 | 7 | 0 | 0 |
| console.log in src | `grep -rn "console\.log" frontend/src/ \| wc -l` | 0 | 0 | 0 | 0 |
| .orig/.rej files | `find . -type f \( -name '*.orig' -o -name '*.rej' \) \| wc -l` | 13 | 0 | 0 | 0 |
| conflict markers | `grep -rn "<<<<<<<" frontend/src \| wc -l` | 0 | 0 | 0 | 0 |
| annotation localStorage refs | `grep -rn "localStorage.*annot\|annot.*localStorage" frontend/src/ \| wc -l` | Not measured | Not measured | 0 | 0 |
| hardcoded undo cap | `grep -rn "slice(-15)" frontend/src \| wc -l` | Not measured | Not measured | 0 | 0 |
| macro registered ops | `macroRegistry.getRegisteredOps().length` at startup | Not measured in this phase | Not measured in this phase | Not measured — requires browser startup | 22 |
| annotation types covered in Konva | count non-default cases in KonvaAdapter switch | 7 | 7 | 17 | 17 |

## Build Health

| Step | Result |
|------|--------|
| npm install | PASS (`corepack pnpm install --frozen-lockfile`) |
| npm run typecheck | PASS (`pnpm --dir frontend typecheck`) |
| npm test | PASS (`pnpm --dir frontend test` — 84 files passed, 1 skipped) |
| npm run check:static | PASS (`pnpm --dir frontend check:static`) |
| npm run build | PASS with Vite chunk-size warnings (`pnpm --dir frontend build`) |

## Browser Smoke (Manual)

| Scenario | Result |
|----------|--------|
| App loads at /Pdf-Hub/ | NOT RUN — browser unavailable in container |
| Preview mode banner visible | NOT RUN — browser unavailable in container |
| Open PDF renders page 1 | NOT RUN — PDF fixture/browser unavailable in container |
| Search text, scroll after | NOT RUN — PDF fixture/browser unavailable in container |
| Create highlight annotation | NOT RUN — browser unavailable in container |
| Run rotate_pages macro from sidebar | NOT RUN — browser/session fixture unavailable in container |
