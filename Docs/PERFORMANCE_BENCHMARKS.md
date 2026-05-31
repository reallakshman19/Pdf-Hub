# Performance Benchmarks

This document describes baseline performance metrics for the PDF Hub/DocCraft
viewer and establishes targets for each release phase.  As the
implementation evolves, these benchmarks should be updated and used to
verify that changes improve or at least maintain performance.  All times
below are representative of typical laptop hardware without hardware
acceleration disabled.

## Baseline metrics (pre‑redesign)

* **Time‑to‑first‑page:** Loading a 100‑page PDF from local disk and
  rendering the first visible page currently takes ~1.5 seconds.  During
  this time the UI is unresponsive and the scroll bar jumps as page
  dimensions become available.
* **Memory usage:** Opening a 200‑page scanned PDF consumes > 400 MB of
  memory because every page is loaded and rasterized as soon as the user
  scrolls quickly.
* **Scroll jitter:** Fast scrolling can leave blank placeholders on screen
  for more than 1 second while pages render; the intersection observer only
  preloads one viewport ahead.

## Target metrics

### Page metrics prefetch

* **Layout stability:** After loading, the scroll bar and page anchors should
  remain stable.  Placeholder heights should be set using pre‑fetched
  `width` and `height` from `page.getViewport({scale: 1})`.
* **Metric:** No visible layout jump after the first 0.5 seconds.

### Virtual rendering and caching

* **LRU cache:** Implement an LRU cache for `PDFPageProxy` objects with a
  configurable size (default 8).  Prefetch pages ±2 of the current
  viewport.
* **Metric:** Fast scrolling through 100 pages should not cause repeated
  reparsing of page content.  The number of page objects in memory should
  remain below 10.

### Range streaming

* **Streaming load:** When loading a PDF from a remote server, enable
  range requests.  Only the bytes necessary for the requested pages should
  be downloaded initially.
* **Metric:** Time‑to‑first‑page for a 50 MB remote PDF should be < 2 seconds
  over a 100 Mbps connection.

### Text layer caching

* **Memoization:** Cache text items by `documentKey + pageNumber + scale`.
* **Metric:** Repeated zooming and searching should not reparse the same
  text content.  CPU utilization should remain low after the initial
  parsing.

### Thumbnail rendering

* **Throttling:** Limit concurrent thumbnail render tasks to avoid
  saturating the main thread.  Prioritize visible thumbnails over
  background ones.
* **Metric:** Thumbnail panel remains responsive even when thumbnails are
  generating for hundreds of pages.  No more than 2 concurrent tasks at
  a time.

## Measuring performance

Performance should be measured with automated tests whenever possible.  At
minimum, include a benchmark script that opens sample PDFs and records the
time until the first page is rendered, memory usage after scrolling
through the document, and the number of `PDFPageProxy` objects in the
cache.  Benchmark results should be committed to this file or stored in
`docs/PERFORMANCE_BENCHMARKS.md` under a new heading labelled with the
date and commit hash.
