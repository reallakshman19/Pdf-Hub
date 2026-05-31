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
| npm run typecheck | PASS (`pnpm --dir frontend typecheck` — 0 errors) |
| npm test | PASS (`pnpm --dir frontend test` — 92 test files, 548 unit tests passed) |
| npm run check:static | PASS (`pnpm --dir frontend check:static` — 100% compliant) |
| Playwright E2E | PASS (`npx.cmd playwright test` — 100% successful) |
| npm run build | PASS (`pnpm --dir frontend build` — compiled perfectly) |

## Browser Smoke (Playwright E2E Automated)

| Scenario | Result |
|----------|--------|
| App loads at / | PASS (Automated E2E check) |
| Preview mode banner visible & non-dismissible | PASS (Automated E2E check) |
| Sidebar panel and workspace mounting | PASS (Automated E2E check) |
| Multi-format PDF Rich Text Block Rendering | PASS (Unit & Integration tests) |

