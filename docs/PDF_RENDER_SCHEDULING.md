# PDF Render Scheduling and Bitmap Budgets

PDF Hub routes page and thumbnail rendering through a shared priority scheduler instead of allowing every component to start PDF.js work immediately.

## Scheduling policy

The scheduler enforces a global concurrency ceiling of three render jobs.

Priority order:

1. Current-page viewer rendering
2. Current and nearby thumbnails
3. Background thumbnails

Queued jobs are ordered by priority and then by request order. A later interactive request may move ahead of older background work. Jobs with the same render key are deduplicated while queued or active.

Each consumer has its own `AbortSignal`. Cancelling one consumer does not interrupt shared work while another consumer remains. When the final consumer detaches, queued work is removed and active work receives an abort signal immediately.

Render keys include document identity, page number, render scale or thumbnail target width, device-pixel ratio where applicable, and render target identity for canvas side effects.

## Bitmap-memory accounting

Thumbnail resources use a decoded-byte budget rather than an entry-count limit. The estimated bitmap cost is:

`pixel width × pixel height × 4 bytes`

The thumbnail cache has a 32 MiB decoded-bitmap budget and evicts least-recently-used entries until the budget is restored. Cached object URLs are revoked on replacement, deletion, eviction, and cache clear.

Thumbnail dimensions are bounded before rendering so pathological page aspect ratios cannot create an unexpectedly large bitmap from the normal 150-pixel thumbnail target.

The main viewer canvas is not retained in the cache. Its memory remains owned by the mounted canvas element and is released through normal component replacement or unmount behavior.

## Cancellation and cleanup

- Viewer dependency changes and unmount abort the current render consumer.
- Thumbnail dependency changes abort obsolete queued and active thumbnail consumers.
- PDF.js render tasks are cancelled through the existing adapter cancellation boundary.
- Page proxies are cleaned in `finally` blocks.
- Temporary thumbnail canvases are reset after encoding.
- Object URLs are revoked when their cache entries leave the decoded-byte budget.

## Maintenance rules

- New PDF.js render entry points must use the shared scheduler unless they have a documented isolation requirement.
- Interactive work must use a higher priority than speculative work.
- New retained render resources must declare their decoded or resident byte cost and deterministic disposal function.
- Cache keys must include every parameter that can change rendered pixels.
- Cancellation must prevent stale results from replacing newer UI state.
