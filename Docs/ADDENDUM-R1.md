# ADDENDUM-R1.md
## Research-Driven Stack Patches — Diff Against Implementation Plan v2

> Five targeted replacements. No new parallel paths.
> Apply each patch to the referenced section of v2 before Phase 2 begins.
> Sections not mentioned here are unchanged.

---

## PATCH 1 — PDF Rendering Library

**Replaces:** ARCHITECTURE.md §3.1 frontend stack row for "PDF rendering"
**Reason:** @react-pdf-viewer/core is commercially licensed (not Apache 2.0),
abandoned since March 2023, pinned to pdfjs-dist 3.4.120, and has a
confirmed bug where `onCanvasLayerRender` fires only once — annotations
are lost on re-render. Incompatible with Konva overlay architecture.

```diff
- | PDF rendering     | @react-pdf-viewer/core | 3.x | React wrapper, virtualization built-in |
+ | PDF rendering     | pdfjs-dist (Mozilla)   | 4.x | Apache 2.0, direct canvas access, actively maintained |
+ | PDF React wrapper | react-pdf (wojtekmaj)  | 10.x | MIT, onRenderSuccess fires every render, canvas ref exposed |
```

**Replaces:** IMPLEMENTATION_PLAN.md Phase 2 P2-T5 virtual list library

```diff
- @tanstack/react-virtual  (requires pre-known item heights)
+ virtua                   (handles dynamic heights natively — PDF pages vary)
```

**Install line for Phase 2:**
```
pnpm add pdfjs-dist react-pdf virtua
```

The critical integration point: react-pdf's `<Page canvasRef={ref}>` exposes
the underlying canvas on every render. Mount the Konva `<Stage>` adjacent to
it — not on top of the canvas — so Konva manages its own canvas element at
the same position via absolute positioning. This avoids the single-fire
problem entirely.

---

## PATCH 2 — Annotation Canvas Library

**Replaces:** ARCHITECTURE.md §3.1 frontend stack row for "Annotation canvas"
**Reason:** Fabric.js v5→v6 serialization was severely breaking (text style
format, group structure, stacking API, import syntax all changed). v6→v7
introduces further breaks. 464 open issues. React integration is fully
imperative with no declarative bindings. Konva.js: 55 kB gzip vs Fabric's
200+ kB, 26 open issues, native TypeScript, react-konva provides declarative
`<Stage><Layer>` components with React 18/19 support.

```diff
- | Annotation canvas | Fabric.js    | 6.x    | Rich object model, serializable, text/shape/stamp |
+ | Annotation canvas | Konva.js     | 10.x   | MIT, 55 kB gzip, stable serialization, multi-layer canvas |
+ | React canvas      | react-konva  | 19.x   | Declarative <Stage><Layer>, React 18/19 native support    |
```

**Replaces:** IMPLEMENTATION_PLAN.md Phase 3 P3-T1 — FabricAdapter

```diff
- P3-T1: FabricAdapter
- [ ] adapters/annotation-canvas/FabricAdapter.ts
- [ ] initCanvas(el), addObject, removeObject, serialize, deserialize
- [ ] serializer.ts: bidirectional Fabric ↔ PdfAnnotation

+ P3-T1: KonvaAdapter
+ [ ] adapters/annotation-canvas/KonvaAdapter.ts
+ [ ] initStage(container, width, height): Konva.Stage
+ [ ] addObject(annotation: PdfAnnotation): Konva.Node
+ [ ] removeObject(id: string): void
+ [ ] serialize(): PdfAnnotation[]   — reads from annotationLayer.toJSON().children
+ [ ] deserialize(annotations: PdfAnnotation[]): void
+ [ ] events: onSelectionChange, onObjectModified via Konva event system
+ [ ] serializer.ts: bidirectional Konva attrs ↔ PdfAnnotation
+   (Konva serialization format: { attrs, className, children } — stable across versions)
```

**Replaces:** IMPLEMENTATION_PLAN.md Phase 3 P3-T2 — AnnotationOverlay

```diff
- P3-T2: AnnotationOverlay — Fabric canvas at z-index above TextLayer

+ P3-T2: AnnotationOverlay — Konva Stage layered alongside react-pdf canvas
+   Layer 0 (annotationLayer): persistent shapes — highlights, stamps, text boxes
+   Layer 1 (interactionLayer): active tool, selection handles, in-progress draws
+   Both layers are separate Konva <Layer> components on one <Stage>
+   Stage dimensions match page viewport; updates on zoom via props
+   No z-index conflict: Konva manages its own <canvas> element separately
```

**Trade-off to document in AGENTS.md:**
Konva has no built-in on-canvas rich text editing equivalent to Fabric's
`IText`. Text box annotations use a `<textarea>` positioned over the canvas
(standard pattern for Konva text editing, documented in official examples),
then rendered as a Konva `Text` node on commit. This is acceptable for
annotation text boxes; it is not a regression from Fabric's behavior in
practice.

**Install line for Phase 3:**
```
pnpm add konva react-konva
```

**Remove from Phase 3 install:**
```
- pnpm add fabric
```

---

## PATCH 3 — Tesseract.js Version

**Replaces:** ARCHITECTURE.md §3.1 frontend stack row for "OCR (preview)"
**Reason:** Tesseract.js v5 has a confirmed memory leak (issue #977) where
WASM heap grows linearly per job with no release, eventually crashing the
browser tab. Fixed in v6.0.0 (January 2025). v7.0.0 (December 2025) adds
a `relaxedsimd` WASM build giving 15–35% speed improvement.

```diff
- | OCR (preview)     | Tesseract.js  | 5.x   | Web Worker, honest about 10–20s/page limit |
+ | OCR (preview)     | Tesseract.js  | 7.x   | Web Worker, v5 memory leak fixed in v6, v7 adds relaxedsimd WASM |
```

**Replaces:** IMPLEMENTATION_PLAN.md Phase 4 P4-T2 — TesseractAdapter

```diff
- [ ] Web Worker initialization
- [ ] `runOcr(imageData, options) → Promise<OcrResult>`
- [ ] Progress callback per page
- [ ] English only by default

+ [ ] Install: pnpm add tesseract.js@^7.0.0  (not v5 — memory leak)
+ [ ] Initialize via createScheduler + 2 workers (not a single worker)
+
+   const scheduler = createScheduler()
+   const w1 = await createWorker('eng')
+   const w2 = await createWorker('eng')
+   scheduler.addWorker(w1)
+   scheduler.addWorker(w2)
+
+ [ ] TesseractAdapter.recognize(image) calls scheduler.addJob('recognize', image)
+   Scheduler queues and dispatches to idle worker automatically
+ [ ] Worker count: 2 on desktop (≥8 GB RAM), 1 on mobile/low-RAM
+   Detection: navigator.hardwareConcurrency < 4 || navigator.deviceMemory < 4 → 1 worker
+ [ ] Recycle workers every 20 pages to prevent WASM heap bloat:
+   await worker.terminate(); worker = await createWorker('eng'); scheduler.addWorker(worker)
+ [ ] Progress callback: scheduler emits per-job progress events — wire to OcrJobStore
```

---

## PATCH 4 — Equation OCR: pix2tex import path correction + surya note

**Replaces:** ARCHITECTURE.md §3.2 backend stack row for "OCR equations"
**Reason:** There is no separate `lukas-blecher/pix2tex` repo — it is the
PyPI package name for `lukas-blecher/LaTeX-OCR`. The install command
in the plan was correct; the repo URL reference was wrong. Additionally,
`texify` (the successor library) was archived January 2025 and merged into
`surya` — this is the correct future upgrade path.

```diff
- | OCR equations | pix2tex  | 0.1.x | LaTeX from image; open-source, self-hostable |
+ | OCR equations | pix2tex  | 0.1.4 | pip install "pix2tex[api]" — correct install;
+                                      LaTeX-OCR repo is the same codebase.
+                                      Pin to 0.1.4. Maintenance low but last release
+                                      Jan 2025. Upgrade path: surya (VikParuchuri)
+                                      when stability is confirmed.            |
```

**Replaces:** IMPLEMENTATION_PLAN.md Phase 4 P4-T4 — equation OCR invocation

```diff
- Route equation regions to pix2tex

+ Route equation regions to pix2tex via in-process call (no subprocess needed):
+
+   from pix2tex.cli import LatexOCR
+   # Instantiate once at server startup, reuse per request
+   _model = LatexOCR()
+   latex: str = _model(pil_image)   # returns LaTeX string or raises
+
+ Handles only block equations. Does not handle inline math — do not route
+ inline-sized regions (<30px height) to pix2tex; treat as text.
+
+ Future upgrade: monitor github.com/VikParuchuri/surya for stable equation
+ OCR API. surya absorbed texify and is actively maintained. Drop-in
+ replacement when available.
```

---

## PATCH 5 — Remove Nougat from Architecture

**Replaces:** ARCHITECTURE.md §6 OCR section (Nougat reference)
**Reason:** CPU-only speed measured at 165–188 sec/page (small model).
GPU target was 19.5 sec/page per the paper. nougat-base is CC-BY-NC-4.0
(non-commercial). No bounding-box output — cannot correlate equations to
page positions without a separate layout model. Not feasible for an
interactive local PDF editor.

```diff
- Nougat (Meta) is an optional alternative pipeline for academic PDFs
- in server mode. Feasibility depends on hardware.

+ Nougat is REMOVED from consideration.
+ CPU: 165–188 sec/page (small model, measured). 3–9× over the 20 sec target.
+ nougat-base license: CC-BY-NC-4.0 — non-commercial only.
+ No position output: cannot map equation blocks to page coordinates.
+
+ If full-page academic PDF parsing becomes a future requirement, evaluate:
+ - Marker (VikParuchuri, Apache 2.0) — CPU-viable, outputs Markdown+LaTeX
+ - DocTR (Mindee, Apache 2.0) — layout detection with bounding boxes
+ These remain in the Ideas Backlog, not in the active plan.
```

---

## Summary of net stack changes

| Component         | v2 spec          | After this addendum    | Change |
|-------------------|------------------|------------------------|--------|
| PDF React wrapper | @react-pdf-viewer | react-pdf (wojtekmaj) | Replace |
| Virtual list      | @tanstack/react-virtual | virtua           | Replace |
| Annotation canvas | Fabric.js 6.x    | Konva.js 10.x          | Replace |
| React canvas      | (implicit)       | react-konva 19.x       | Add     |
| OCR preview       | Tesseract.js 5.x | Tesseract.js 7.x       | Version bump |
| Worker pattern    | single worker    | createScheduler + 2 workers | Change |
| Equation OCR      | pix2tex (path unclear) | pix2tex 0.1.4 (in-process) | Clarify |
| Nougat            | optional future  | Removed                | Remove  |

**Packages to add:**
```
pnpm add pdfjs-dist react-pdf virtua konva react-konva tesseract.js@^7.0.0
pip install "pix2tex[api]"==0.1.4
```

**Packages to remove from v2 spec:**
```
- @react-pdf-viewer/core  (commercial license)
- @tanstack/react-virtual  (replaced by virtua)
- fabric                   (replaced by konva)
```

**AGENTS.md invariants requiring update:**
- INV-3: "FabricAdapter" → "KonvaAdapter" in Phase 3 reference
- Pre-commit checklist item: `fabric` import → `konva` import check
- §3 Separation of concerns: `FabricAdapter` → `KonvaAdapter`

No phase boundaries change. No task counts change materially.
Phase 3 start date is unaffected — Konva learning curve is lower than Fabric,
not higher.
