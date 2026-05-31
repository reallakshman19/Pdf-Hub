# DocCraft Performance Baseline

_Captured post-Phase-6 on 2026-05-30. Update when implementation changes._

## Capture Environment
- Environment: non-interactive CI/container shell
- Browser/DevTools: not available in this environment
- Frontend build command: `pnpm --dir frontend build`
- Production build elapsed time: 15.527 seconds wall-clock (`time pnpm --dir frontend build`)
- Vite reported bundle transform/build time: 3.07 seconds
- OCR concurrency verification: `pnpm --dir frontend exec vitest run src/core/ocr/clientOcr.test.ts`

## Test Document
- Name: Math SA-Dec-25.pdf
- Pages: not available in this checkout
- File size: not available in this checkout
- Fixture status: manual browser baseline still required when the document fixture is available

## Rendering Budget

| Scenario | Budget | Measured | Status |
|----------|--------|----------|--------|
| App load (first paint) | ≤ 2000 ms | Not captured — browser Performance API unavailable in container | ⚠️ Manual |
| Open PDF (first page visible) | ≤ 1500 ms | Not captured — no PDF fixture/browser in container | ⚠️ Manual |
| Scroll through all 8 pages | ≤ 500 ms total stall | Not captured — no PDF fixture/browser in container | ⚠️ Manual |
| Search "time" (8 pages) | ≤ 800 ms | Not captured — no PDF fixture/browser in container | ⚠️ Manual |
| Render page after search | 0 crashes | Not captured — no PDF fixture/browser in container | ⚠️ Manual |
| Create highlight annotation | ≤ 100 ms visible | Not captured — browser interaction unavailable in container | ⚠️ Manual |
| Create textbox annotation | ≤ 100 ms visible | Not captured — browser interaction unavailable in container | ⚠️ Manual |
| Run rotate_pages macro (1 page) | ≤ 1500 ms | Not captured — browser/session fixture unavailable in container | ⚠️ Manual |
| Run Full Report macro (3 pages) | ≤ 8000 ms | Not captured — browser/session fixture unavailable in container | ⚠️ Manual |
| OCR single page (client-side) | ≤ 10 000 ms | Not captured — no image/PDF OCR fixture in container | ⚠️ Manual |
| 5 concurrent OCR calls | no crash | Pass in unit coverage; one worker, serialized calls, 0 failures | ✅ Pass |
| Production build elapsed wall time | ≤ 30 000 ms | 15 527 ms | ✅ Pass |
| Vite reported build time | ≤ 10 000 ms | 3 070 ms | ✅ Pass |

## Memory Budget

| Scenario | Budget | Measured | Status |
|----------|--------|----------|--------|
| After opening PDF | ≤ 150 MB JS heap | Not captured — browser heap snapshots unavailable in container | ⚠️ Manual |
| After 15 undo steps | ≤ 450 MB JS heap | Not captured — browser heap snapshots unavailable in container | ⚠️ Manual |
| After closing PDF | ≤ 80 MB JS heap | Not captured — browser heap snapshots unavailable in container | ⚠️ Manual |

## How to Measure Manually
- Rendering: DevTools → Performance tab → record during action.
- Memory: DevTools → Memory tab → take heap snapshot after each scenario.
- Macro: record around the macro trigger and compare with the budgets above.
- OCR concurrency: run the existing Vitest coverage and confirm five queued calls complete without worker-busy failures.

## Follow-up Requirement
Manual browser rows are explicitly populated but remain marked ⚠️ because this environment cannot open DevTools, inspect heap snapshots, or load the missing `Math SA-Dec-25.pdf` fixture. Replace the ⚠️ values with measured browser numbers during the next interactive QA pass.
