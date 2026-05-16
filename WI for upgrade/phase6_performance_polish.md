# Phase 6 — Performance + Polish

**Depends on:** Phase 5 complete  
**Estimated effort:** ~1 hour

---

## WI-6.1 — Configurable Vite Base Path

**File:** `frontend/vite.config.ts`

```diff
// vite.config.ts
 export default defineConfig({
-  base: '/Pdf-Hub/',
+  base: process.env.VITE_BASE_PATH ?? '/Pdf-Hub/',
```

**Create `.env.development`** for local dev without the subpath:

```ini
# frontend/.env.development
VITE_BASE_PATH=/Pdf-Hub/
```

**Create `.env.production`** for GitHub Pages deployment:

```ini
# frontend/.env.production
VITE_BASE_PATH=/Pdf-Hub/
```

**Pass gate:**
1. `npm run dev` → app loads at `http://localhost:5173/Pdf-Hub/` ✅
2. `VITE_BASE_PATH=/ npm run dev` → app loads at `http://localhost:5173/` ✅

---

## WI-6.2 — Fallback Annotation Warning Logger

This WI was already implemented in Phase 2 (the `default` case in `KonvaAdapter.addObject`), but verify the log reaches the Debug page.

**Verify in `KonvaAdapter.ts` default case:**

```typescript
default: {
  const unknownType = (annotation as { type: string }).type;
  // Use dynamic import to avoid circular dep issues
  import('@/core/logger/service').then(({ warn }) => {
    warn('annotation', 'Fallback renderer used — type not implemented in KonvaAdapter', {
      type: unknownType,
      id: annotation.id,
      pageNumber: annotation.pageNumber,
    });
  });
  node = new Konva.Rect({
    ...cfg,
    fill: '#fef9c3',
    stroke: '#f59e0b',
    strokeWidth: 2,
    dash: [3, 3],
    opacity: 0.7,
  });
  break;
}
```

**Pass gate:**
1. Temporarily change one annotation type to `'unknown-test-type'` in browser console
2. Debug tab (`/debug`) → Logs → shows `warn` entry: `Fallback renderer used`
3. Revert test

---

## WI-6.3 — Performance Baseline Recording

**Create:** `PERFORMANCE_BASELINE.md` in repo root

```markdown
# DocCraft Performance Baseline

_Captured post-Phase-6. Update when implementation changes._

## Test Document
- Name: Math SA-Dec-25.pdf
- Pages: 8
- File size: ~XXX KB

## Rendering Budget

| Scenario | Budget | Measured | Status |
|----------|--------|----------|--------|
| App load (first paint) | ≤ 2000 ms | ? ms | ⬜ |
| Open PDF (first page visible) | ≤ 1500 ms | ? ms | ⬜ |
| Scroll through all 8 pages | ≤ 500 ms total stall | ? ms | ⬜ |
| Search "time" (8 pages) | ≤ 800 ms | ? ms | ⬜ |
| Render page after search | 0 crashes | ✅ / ❌ | ⬜ |
| Create highlight annotation | ≤ 100 ms visible | ? ms | ⬜ |
| Create textbox annotation | ≤ 100 ms visible | ? ms | ⬜ |
| Run rotate_pages macro (1 page) | ≤ 1500 ms | ? ms | ⬜ |
| Run Full Report macro (3 pages) | ≤ 8000 ms | ? ms | ⬜ |
| OCR single page (client-side) | ≤ 10 000 ms | ? ms | ⬜ |
| 5 concurrent OCR calls | no crash | ✅ / ❌ | ⬜ |

## Memory Budget

| Scenario | Budget | Measured | Status |
|----------|--------|----------|--------|
| After opening PDF | ≤ 150 MB JS heap | ? MB | ⬜ |
| After 15 undo steps | ≤ 450 MB JS heap | ? MB | ⬜ |
| After closing PDF | ≤ 80 MB JS heap | ? MB | ⬜ |

## How to Measure
- Rendering: DevTools → Performance tab → record during action
- Memory: DevTools → Memory tab → take heap snapshot
- Macro: `console.time('macro'); await runMacro(); console.timeEnd('macro')`
```

**Pass gate:** File exists with Measured column populated for all rows.

---

## WI-6.4 — Browser Smoke Test Checklist (Manual)

Run after all 6 phases complete. Record results in `AUDIT_BASELINE.md`:

```
Phase 6 Smoke Test — Run in order

□ 1. App loads at /Pdf-Hub/ without white screen
□ 2. Preview mode banner visible (no backend)
□ 3. Open Math SA-Dec-25.pdf — page 1 renders
□ 4. Scroll through all 8 pages — no white/blank pages
□ 5. Search "time" — results highlighted, no console errors
□ 6. Scroll after search — pages still render correctly
□ 7. Create highlight annotation — visible yellow highlight
□ 8. Create textbox annotation — text box appears
□ 9. Create line annotation — line renders (not gray box)
□ 10. Create arrow annotation — arrow with pointer renders
□ 11. Create ink stroke — freehand line visible
□ 12. Create redaction — solid black rectangle
□ 13. Select any annotation — Inspector right panel populates
□ 14. Undo annotation — annotation disappears
□ 15. Redo annotation — annotation reappears
□ 16. Sidebar → Macros → "Rotate selected pages 90°" → Run Macro
       Expected: page rotates, log shows success
□ 17. Sidebar → Macros → "Generate Full Report" → Generate PDF
       Expected: 3 pages appended, no error
□ 18. Sidebar → Search tab → type query → results appear
□ 19. Sidebar → Thumbnails → click page 3 → workspace jumps to page 3
□ 20. Zoom In/Out → annotations stay aligned with PDF content
□ 21. Simulate workspace crash (DevTools: window.__throwTest = true)
       Expected: only workspace shows error boundary, sidebar/inspector intact
□ 22. Open a second PDF → workspace boundary auto-recovers
□ 23. npm run check:all → exit code 0
```

---

## Final Master Acceptance Gates

| Gate | Command / Check | Target |
|------|----------------|--------|
| `.orig`/`.rej` files | `Get-ChildItem -Recurse -Include *.orig,*.rej \| Measure` | 0 |
| Conflict markers | `grep -rn "<<<<<<<" frontend/src` | 0 results |
| `createRoot` calls | `grep -rn "createRoot" frontend/src \| wc -l` | 1 |
| Toolbar `as any` | `grep -n "as any" frontend/src/components/toolbar/` | 0 |
| `console.log` in source | `grep -rn "console\.log" frontend/src/` | 0 |
| Duplicate macro registrations | App startup with duplicate → throws | confirmed |
| Macro rollback | Failed step → bytes unchanged | confirmed |
| Annotation fallback warnings | All 17 types created → 0 warnings | 0 |
| Undo depth | 20 edits → `undoStack.length` | ≤ 15 |
| Hardcoded undo cap | `grep -rn "slice(-15)" frontend/src` | 0 (uses constant) |
| Preview banner | No backend → banner at top | visible |
| Server-only API in preview | DevTools Network, no `/api/` calls | 0 calls |
| OCR concurrent | 5 jobs queued → all complete | 0 failures |
| `npm run typecheck` | | 0 errors |
| `npm test` | | 0 failures |
| `npm run check:static` | | exit 0 |
| `npm run build` | | 0 errors |
| Smoke test checklist | Above 23 items | ≥ 21/23 |

---

## Phase 6 Completion Checklist

```
□ VITE_BASE_PATH environment variable controls Vite base in vite.config.ts
□ .env.development created with VITE_BASE_PATH=/Pdf-Hub/
□ Fallback annotation warning verified in Debug page logs
□ PERFORMANCE_BASELINE.md created with all rows measured
□ Browser smoke test checklist completed (≥ 21/23 pass)
□ Master acceptance gate table fully checked
□ AUDIT_BASELINE.md "After" column populated for all static checks
□ All static checks green: typecheck, test, check:static, build
```

---

## Summary: Phase Dependency and Execution Order

```
Phase 1 (Critical Fixes)        — run first, ~2h
├── Phase 2 (Annotation)        — parallel with Phase 3, ~3h
└── Phase 3 (Macro Engine)      — parallel with Phase 2, ~2.5h
     └── Phase 4 (Type/CI)      — after P2+P3, ~1.5h
          └── Phase 5 (Guards)  — after P4, ~2h
               └── Phase 6 (Polish) — after P5, ~1h

Total estimated effort: ~12 hours (two engineers in parallel: ~7h)
```
