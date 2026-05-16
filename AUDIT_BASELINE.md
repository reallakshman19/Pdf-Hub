# AUDIT_BASELINE - DocCraft

_Captured before and after Phase 1 changes. Rows are kept stable for later phases._

## Static Counts

| Check | Command | Before | After Phase 1 | Target |
|-------|---------|--------|---------------|--------|
| createRoot calls | `grep -rn "createRoot" frontend/src \| wc -l` | 5 | 5 | 1 |
| as any in toolbar | `grep -rn "as any" frontend/src/components/toolbar/ \| wc -l` | 7 | 7 | 0 |
| console.log in src | `grep -rn "console\.log" frontend/src/ \| wc -l` | 0 | 0 | 0 |
| .orig/.rej files | `Get-ChildItem -Recurse -Include *.orig,*.rej \| Measure-Object` | 13 | 0 | 0 |
| conflict markers | `grep -rn "<<<<<<<" frontend/src \| wc -l` | 0 | 0 | 0 |
| localStorage refs | `grep -rn "localStorage" frontend/src/ \| wc -l` | 2 | 2 | <=1 (theme only) |
| macro registered ops | `macroRegistry.getRegisteredOps().length` at startup | Not measured in this phase | Not measured in this phase | 22 |
| annotation types covered in Konva | count non-default cases in KonvaAdapter switch | 7 | 7 | 17 |

## Build Health

| Step | Result |
|------|--------|
| npm install | PASS (`corepack pnpm install --frozen-lockfile`) |
| npm run typecheck | FAIL (`corepack pnpm -r typecheck` -> no `typecheck` script in workspace packages) |
| npm test | PASS (`corepack pnpm -r test`) |
| npm run build | PASS (`corepack pnpm --filter frontend build`) |

## Browser Smoke (Manual)

| Scenario | Result |
|----------|--------|
| App loads at /Pdf-Hub/ | NOT RUN |
| Open PDF renders page 1 | NOT RUN |
| Search text, scroll after | NOT RUN |
| Create highlight annotation | NOT RUN |
| Run rotate_pages macro from sidebar | NOT RUN |
