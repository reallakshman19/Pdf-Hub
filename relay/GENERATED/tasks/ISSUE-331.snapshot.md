# Issue #331 Task Snapshot

**Authority:** derived read model  
**Protocol:** V3.1 — Common `85bd46ac286003612598c1d8f0fa5d684728c228` — `TPG-2P-2026-09-25-R1`

## What is this task?

STEP-13-09 adds a **separate reconstructed visual replacement** executor for the already-proved narrow existing-text fallback class. It does not widen native `REPLACE_EXISTING_TEXT`.

## Material truth

- PR: #332
- base: `4ad5b88288d7997472b98d35028a2db36785d00b`
- product/material head: `d709a5c26ac689bde7b11eec7d31c5ca4f5f9f00`
- delivery: **DRAFT / MERGEABLE**
- static/source review: **PASS**
- focused executable certification: **NOT_RUN**
- hosted execution origin: **INFRASTRUCTURE** (#183)

The command payload carries span + intent + expected provenance only. Fresh provenance, font, overflow fit, background/text colors and visual clearance are re-proved on the exact mutation-session document before mask/redraw.

## Acceptance state

Eight of ten issue criteria are materially complete by source review. Undo/redo/save-reopen and focused fixture criteria remain **PARTIAL** because their executable tests are authored but have not run on an execution-capable surface.

No executable PASS is claimed.

## Next

Run:

```bash
cd frontend
pnpm run certify:phase13-existing-text-reconstructed-replacement
```

Keep #332 draft until executable evidence is available or the Owner explicitly chooses a documented infrastructure exception.
