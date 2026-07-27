# Concept Note: Dynamic Obstacle-Aware Adobe-Compatible Annotation

**Status:** Proposed  
**Initial profile:** Piping isometric drawings  
**Primary entry points:** Macro Builder and interactive UI  
**Date:** 2026-07-27

## 1. Executive summary

This concept introduces a reusable annotation platform for placing professional callouts on dense engineering PDFs without unnecessarily obscuring existing drawing information.

The first implementation targets piping isometric drawings, where annotations must point to PS references and display mapped information such as an action, tag, reference, or ISO note. The same platform is intended to support future workflows including P&ID review, weld and NDE comments, punch-list markup, revision notes, inspection findings, approval stamps, and drawing-comparison findings.

The platform will be accessible through two complementary workflows:

1. **Macro Builder:** deterministic, repeatable, batch-oriented annotation generated from structured data and reusable macros.
2. **Interactive UI:** visual review, manual adjustment, approval, suppression, and finalization of automatically proposed annotations.

The core behavior is:

```text
Detect target
→ analyze page occupancy
→ generate candidate callout positions
→ route leader lines
→ score obstruction and readability
→ choose the best candidate
→ require review when quality is compromised
→ write an Adobe-compatible callout annotation
→ reopen and verify the output
```

The engine prefers collision-free placement. When a clash is unavoidable, it selects the **least obstructive valid placement**, records exactly what is crossed or covered, and exposes that compromise for review. Protected information such as dimensions, identifiers, title blocks, critical equipment tags, and the source target itself must never be silently obscured.

---

## 2. Problem statement

Engineering drawings are not ordinary document pages. A piping isometric may contain:

- pipe centerlines and branches;
- elbows, tees, reducers, valves, flanges, and supports;
- weld symbols and weld numbers;
- dimensions, extension lines, elevations, and coordinates;
- line numbers, equipment tags, and flow arrows;
- title blocks, revision blocks, stamps, and existing markups;
- vector geometry with little or no searchable text;
- scanned or rasterized drawing content.

A simple “place text near the detected value” implementation can cover important information, create ambiguous leader routes, overlap other annotations, or produce a result that cannot be edited in Acrobat.

The application needs a general solution that can understand occupied regions, select an appropriate callout location, preserve drawing readability, and produce output that behaves like a professional PDF annotation.

---

## 3. Vision

Create a reusable **engineering annotation platform** that can place, review, render, verify, and audit callouts on complex PDFs.

The platform should separate:

- **workflow-specific logic**, such as detecting a PS number and mapping it to an ISONOTE;
- **general annotation logic**, such as occupancy analysis, callout layout, leader routing, review state, PDF rendering, and output verification.

This separation allows future workflows to reuse the same placement and review infrastructure.

---

## 4. Goals

### 4.1 Functional goals

- Place callout text in the clearest available region near a target.
- Use routed leaders to connect the callout to the exact target.
- Avoid covering existing text and critical engineering information.
- Consider vector geometry and raster occupancy, not only extracted text.
- Support least-obstruction placement when no collision-free option exists.
- Make compromised placements visible and explainable.
- Support manual movement, leader adjustment, approval, and suppression.
- Produce editable Adobe-compatible FreeText callout annotations.
- Optionally flatten approved annotations for controlled issue packages.
- Allow the same engine to be invoked from Macro Builder and the UI.
- Reopen the generated PDF and verify annotation identity, geometry, and content.

### 4.2 Quality goals

- Deterministic output for identical inputs and configuration.
- Fail-closed behavior for protected-data obstruction.
- Stable preview-to-PDF geometry.
- Explicit, inspectable placement diagnostics.
- Versioned schemas and styles.
- Reusable components with workflow-independent interfaces.
- Testable behavior using real engineering drawing fixtures.

---

## 5. Non-goals

The initial release will not attempt to:

- semantically understand every symbol on every engineering discipline;
- guarantee perfect placement on unknown or poor-quality scanned drawings without review;
- replace a CAD authoring system;
- infer engineering intent from geometry alone;
- silently approve major or protected-region obstruction;
- claim official Adobe certification.

“Adobe-compatible” means that the generated annotation follows the relevant PDF annotation structures and is tested for interoperability with Adobe Acrobat and other supported PDF viewers.

---

## 6. User experience

### 6.1 Clear placement

```text
                     PIPE
                       ╲
                        ╲──────────────
                         ╲
                          ● PS-11168.8
                          │
                          └───────────────┐
                                          │
                    ┌─────────────────────┴──────────┐
                    │ Action: REMOVE GUIDE           │
                    │ ISO Note: :/PS-11168.8 ...     │
                    └────────────────────────────────┘
```

The box is placed in verified whitespace. The leader connects to a point beside the PS reference and does not cover the reference text.

### 6.2 Least-obstruction placement

```text
                  EXISTING PIPE
                       ╲
                        ╲────────────
                         ● PS-11168.8
                         │
                         │ leader crosses one
                         │ low-priority pipe segment
                         └──────────────┐
                                        │
                  ┌─────────────────────┴──────────┐
                  │ Action: REMOVE GUIDE           │
                  │ Reference: PS-11168.8           │
                  └────────────────────────────────┘
```

This placement is accepted as a candidate because only the leader crosses low-priority geometry. It is marked as a minor obstruction and can be reviewed according to policy.

### 6.3 Margin rail for dense drawings

```text
ISO DRAWING                                      CALLOUT RAIL

   ╲──── PIPE ──● PS-11168.8 ─────────────────┐  ┌────────────────────┐
                                                └──┤ REMOVE GUIDE       │
                                                   │ ISO Note: ...      │
───◁▷──────────● PS-11167.4 ────────────────┐     └────────────────────┘
                                            │     ┌────────────────────┐
                                            └─────┤ GUIDE              │
                                                  │ ISO Note: ...      │
                                                  └────────────────────┘
```

A side rail is preferred when the drawing body is too dense for nearby boxes.

---

## 7. Core concepts

### 7.1 Annotation target

A target identifies the drawing object to which the callout refers.

```ts
export interface AnnotationTarget {
  pageNumber: number;
  anchor: Point;
  bounds?: Rect;
  kind: string;
  sourceText?: string;
}
```

Examples include a PS number, weld ID, valve tag, equipment tag, revision region, or user-selected point.

### 7.2 Semantic annotation content

Business data is stored without presentation prefixes.

```ts
export interface AnnotationContent {
  title?: string;
  fields: readonly AnnotationField[];
  severity?: 'info' | 'warning' | 'critical';
}

export interface AnnotationField {
  key: string;
  label: string;
  value: string;
}
```

Example:

```ts
{
  fields: [
    { key: 'action', label: 'Action', value: 'REMOVE GUIDE' },
    { key: 'isoNote', label: 'ISO Note', value: ':/PS-11168.8 Remove Guide' }
  ]
}
```

Only the content-layout component converts semantic values into rendered lines.

### 7.3 Page scene and occupancy map

The page analyzer produces a normalized scene model:

```ts
export interface PageScene {
  pageNumber: number;
  pageBounds: Rect;
  obstacles: readonly PageObstacle[];
  occupancyGrid?: OccupancyGrid;
  protectedRegions: readonly ProtectedRegion[];
}
```

Obstacle kinds may include:

```ts
export type ObstacleKind =
  | 'text'
  | 'dimension-text'
  | 'dimension-line'
  | 'pipe-line'
  | 'symbol'
  | 'equipment-tag'
  | 'title-block'
  | 'revision-block'
  | 'image-content'
  | 'existing-annotation'
  | 'generated-callout'
  | 'generated-leader';
```

### 7.4 Placement policy

A placement policy controls what may be crossed, touched, or covered.

```ts
export interface PlacementPolicy {
  prohibited: ReadonlySet<ObstacleKind>;
  boxPenalties: Partial<Record<ObstacleKind, number>>;
  leaderPenalties: Partial<Record<ObstacleKind, number>>;
  autoApproveThreshold: number;
  reviewThreshold: number;
  allowMarginRail: boolean;
  minimumClearance: number;
}
```

The piping-ISO policy should generally:

- prohibit box overlap with dimensions, identifiers, title blocks, and critical tags;
- heavily penalize box overlap with pipe geometry;
- tolerate a leader crossing an ordinary pipe line when unavoidable;
- prefer a longer clean leader over a nearby obstructive box;
- protect the target text itself;
- require review for any non-zero significant penalty.

### 7.5 Placement result

```ts
export type PlacementResult =
  | {
      status: 'clear';
      occurrence: AnnotationOccurrence;
      candidate: PlacementCandidate;
      assessment: PlacementAssessment;
    }
  | {
      status: 'compromised';
      occurrence: AnnotationOccurrence;
      candidate: PlacementCandidate;
      assessment: PlacementAssessment;
    }
  | {
      status: 'unplaceable';
      occurrence: AnnotationOccurrence;
      diagnostics: readonly PlacementDiagnostic[];
    };
```

The full occurrence must be preserved even when placement fails. No workflow may replace it with placeholder content or a zero coordinate.

---

## 8. Obstacle analysis

### 8.1 Text layer

Extract text items with bounds, font information, and page coordinates. Classify likely dimensions, tags, and title-block text where reliable.

Text is normally a hard obstacle for the callout box.

### 8.2 Vector layer

Inspect PDF drawing operations and construct bounds or occupancy for:

- stroked paths;
- filled paths;
- line segments;
- rectangles and polygons;
- symbol-like dense regions.

Vector extraction does not need full engineering semantics in the first release. A geometric occupancy representation is sufficient to avoid covering pipework and symbols.

### 8.3 Raster layer

For scanned or hybrid PDFs, render a low-resolution analysis image and create an occupancy mask based on local ink density.

The image occupancy stage should distinguish:

- clear background;
- sparse linework;
- dense content;
- page borders and title blocks.

### 8.4 Existing annotations

Read existing PDF annotations and treat their rectangles and leader paths as occupied regions. Generated callouts should not silently overlap user-created comments.

### 8.5 Coordinate normalization

All analysis and layout components use one internal coordinate system:

```text
origin: top-left
x: increases to the right
y: increases downward
unit: PDF point
```

Only adapters convert to or from viewer- and PDF-library-specific coordinates. Rotation at 0, 90, 180, and 270 degrees must be handled explicitly.

---

## 9. Candidate generation and scoring

### 9.1 Candidate locations

Generate candidates in ordered zones:

1. nearby clear whitespace;
2. preferred sides around the target;
3. wider surrounding whitespace;
4. left or right margin rail;
5. constrained least-obstruction locations.

Each candidate contains:

- callout rectangle;
- rendered text lines;
- target endpoint;
- leader route;
- placement class;
- obstruction assessment;
- deterministic tie-break metadata.

### 9.2 Leader routes

Supported routes should include:

- straight;
- horizontal then vertical;
- vertical then horizontal;
- two-elbow margin route.

An orthogonal route must contain actual horizontal and vertical segments. A nearly horizontal straight line must not be labelled as orthogonal.

### 9.3 Obstruction scoring

Box and leader obstruction must be scored separately.

Illustrative policy:

| Interaction | Example penalty |
|---|---:|
| Clear whitespace | 0 |
| Leader crosses ordinary pipe line | 10 |
| Leader crosses generated leader | 25 |
| Box touches ordinary pipe line | 40 |
| Leader crosses dimension line | 50 |
| Leader crosses text | 80 |
| Box overlaps pipe geometry | 100 |
| Box overlaps ordinary text | 200 |
| Box overlaps dimension value | 300 |
| Box overlaps source target | 500 |
| Box overlaps title block | prohibited |
| Box overlaps critical equipment tag | prohibited |

The exact values are profile configuration, not hard-coded solver behavior.

### 9.4 Least-obstruction rule

The solver applies this decision order:

```text
collision-free candidate
→ candidate with leader-only low-priority crossings
→ candidate with the smallest permitted box interaction
→ margin-rail candidate
→ manual review/unplaceable
```

A protected hit always rejects the candidate. The engine must never silently draw a fallback callout over protected data.

### 9.5 Search strategy

Use a real branching search, such as bounded beam search:

- retain several candidates per occurrence;
- branch across multiple candidate combinations;
- account for collisions with previously selected callouts and leaders;
- sort deterministically;
- cap beam width and candidate count for predictable performance.

---

## 10. Adobe-compatible annotation output

### 10.1 Editable review output

The preferred editable representation is a PDF FreeText callout annotation, using the appropriate annotation dictionary fields for:

- FreeText subtype;
- callout intent;
- annotation rectangle;
- callout line coordinates;
- line ending style;
- default appearance and text styling;
- contents;
- annotation name and metadata;
- appearance stream.

The implementation must generate an explicit appearance stream so the annotation renders consistently in viewers that do not regenerate appearances.

### 10.2 Compatibility profile

Compatibility must be tested in at least:

- Adobe Acrobat or Reader;
- the application’s PDF viewer;
- browser PDF viewing where supported;
- any other viewer officially supported by Pdf-Hub.

Tests should confirm that the annotation:

- is visible on open;
- remains selectable;
- can be moved and resized in Acrobat where expected;
- preserves callout geometry;
- preserves text content;
- displays its leader ending correctly;
- survives save and reopen.

### 10.3 Flattened final output

A separate renderer may flatten approved callouts into page content for controlled issue packages.

Flattening must use the same approved immutable geometry and rendered lines. It must not reflow text or recalculate placement during export.

### 10.4 Renderer abstraction

```ts
export interface AnnotationRenderer {
  render(
    document: PdfDocument,
    annotations: readonly ApprovedAnnotation[],
  ): Promise<RenderResult>;
}
```

Initial implementations:

- `FreeTextCalloutAnnotationRenderer`;
- `FlattenedVectorCalloutRenderer`;
- `CanvasAnnotationPreviewRenderer`.

---

## 11. Macro Builder workflow

Macro Builder provides a repeatable batch interface for annotation generation.

### 11.1 Macro pipeline

```text
Select input PDF
→ load or derive target occurrences
→ map external data
→ configure content template
→ choose placement profile
→ plan annotations
→ optionally open review UI
→ render
→ verify
→ export PDF and audit evidence
```

### 11.2 Proposed macro operations

```ts
export type AnnotationMacroOperation =
  | DetectAnnotationTargetsOperation
  | MapAnnotationDataOperation
  | PlanObstacleAwareAnnotationsOperation
  | ReviewAnnotationPlanOperation
  | RenderAnnotationsOperation
  | VerifyAnnotationsOperation
  | ExportAnnotationEvidenceOperation;
```

Example macro configuration:

```json
{
  "type": "planObstacleAwareAnnotations",
  "version": 1,
  "targetSource": "ps-occurrences",
  "contentTemplate": {
    "fields": [
      { "label": "Action", "value": "{{tag}}" },
      { "label": "ISO Note", "value": "{{isoNote}}" }
    ]
  },
  "placementProfile": "piping-iso-v1",
  "outputMode": "editable-callout",
  "fallback": {
    "mode": "least-obstruction",
    "maximumPenalty": 99,
    "requireReviewAbove": 0,
    "allowMarginRail": true
  }
}
```

### 11.3 Macro behavior

The macro operation returns a plan rather than immediately modifying the PDF:

```ts
export interface AnnotationPlan {
  planId: string;
  sourceDocumentHash: string;
  styleVersion: string;
  placementProfileVersion: string;
  items: readonly PlacementResult[];
  diagnostics: readonly PlanDiagnostic[];
}
```

A render operation may consume only an approved plan. Batch macros may apply a configurable policy to auto-approve clear placements, but compromised placements must either open review or fail the macro with a structured report.

### 11.4 Macro reuse

The same operations can support future workflows by changing only:

- target detector;
- mapping provider;
- content template;
- placement policy;
- style profile.

---

## 12. Interactive UI workflow

### 12.1 Review workspace

The UI should display:

- the PDF page;
- target highlight;
- proposed callout box and leader;
- collision overlays;
- placement quality;
- obstruction list and score;
- alternative candidates;
- margin-rail option;
- approval and suppression controls.

### 12.2 Quality states

```text
Clear          no meaningful obstruction
Compromised    least-obstruction candidate selected
Unplaceable    all candidates hit protected data or exceed policy
Approved       explicitly accepted
Suppressed     intentionally omitted with reason
```

Suggested review colors:

- green: clear;
- amber: minor obstruction;
- red: major obstruction or unresolved;
- gray: suppressed.

The final PDF style remains neutral unless a workflow explicitly requests warning colors.

### 12.3 Editing interactions

The user should be able to:

- drag the callout box;
- move the target endpoint within an allowed target zone;
- move or add a leader elbow;
- resize the box;
- select another generated candidate;
- move the annotation into a margin rail;
- edit allowed content fields;
- approve;
- suppress with a required reason.

Any geometry or content change revokes prior approval and triggers revalidation.

### 12.4 Commit gate

The UI may finalize only when every item is:

- approved; or
- suppressed with a reason.

No unresolved or unplaceable item may be silently omitted.

---

## 13. Review-state model

Use a discriminated state machine rather than independent booleans.

```ts
export type AnnotationReviewItem =
  | ProposedReviewItem
  | CompromisedReviewItem
  | MovedReviewItem
  | ApprovedReviewItem
  | UnplaceableReviewItem
  | SuppressedReviewItem;
```

Transitions:

```text
proposed → approved
proposed → moved → approved
compromised → approved
compromised → moved → approved
unplaceable → moved → approved
unplaceable → suppressed
approved → moved → approval revoked
```

Each transition creates an audit event containing the previous and next state, timestamp, actor where available, diagnostics, and geometry hash.

---

## 14. Identity, verification, and audit

### 14.1 Generated annotation identity

Each generated annotation receives a versioned identity:

```ts
export interface GeneratedAnnotationIdentity {
  schemaVersion: number;
  objectType: string;
  sourceDocumentSha256: string;
  mappingSha256: string;
  occurrenceId: string;
  contentSha256: string;
  geometrySha256: string;
  styleVersion: string;
  placementProfileVersion: string;
}
```

### 14.2 Canonical hashing

Use canonical serialization and SHA-256 for audit-critical identity. Do not use small non-cryptographic hashes for review or output binding.

### 14.3 Post-write verification

After rendering, reopen the PDF and verify:

- expected annotation count;
- unique annotation identity;
- correct page;
- exact semantic content;
- expected rectangle and leader coordinates within tolerance;
- expected style version;
- appearance stream presence;
- no duplicate current annotation;
- output document hash.

For flattened output, also verify visible text spatially inside the expected callout rectangle.

### 14.4 Audit manifest

The manifest must be constructed internally from the committed review state, rendered output, and verification result.

```ts
export interface AnnotationAuditManifest {
  schemaVersion: number;
  inputSha256: string;
  outputSha256: string;
  mappingSha256: string;
  committedPlanSha256: string;
  verificationSha256: string;
  annotationCount: number;
  compromisedCount: number;
  suppressedCount: number;
  auditEvents: readonly AnnotationAuditEvent[];
}
```

A caller must not be able to combine an unrelated review state, annotation list, and verification report.

---

## 15. Reusable architecture

Suggested package boundaries:

```text
src/
  pdf-analysis/
    text-extractor.ts
    vector-extractor.ts
    raster-occupancy.ts
    annotation-extractor.ts
    page-scene.ts

  annotation-core/
    target.ts
    content.ts
    geometry.ts
    typography.ts
    style-profile.ts
    annotation-model.ts

  annotation-placement/
    candidate-generator.ts
    obstruction-policy.ts
    obstruction-scorer.ts
    beam-search.ts
    leader-router.ts
    margin-rail.ts

  annotation-review/
    review-state.ts
    review-actions.ts
    review-validation.ts
    audit-events.ts

  annotation-renderers/
    free-text-callout-renderer.ts
    flattened-vector-renderer.ts
    canvas-preview-renderer.ts

  annotation-verification/
    canonical-hash.ts
    identity-codec.ts
    output-verifier.ts
    audit-manifest.ts

  workflows/
    ps-isonote/
    weld-review/
    punch-list/
    revision-review/
```

The core packages must not import PS-to-ISONOTE workflow modules.

---

## 16. Public service API

A future workflow API could be:

```ts
const workflow = createAnnotationWorkflow({
  targetDetector: psNumberDetector,
  contentProvider: isonoteContentProvider,
  occupancyAnalyzer,
  placementPolicy: pipingIsoPlacementPolicy,
  styleProfile: engineeringCalloutStyle,
  renderer: freeTextCalloutRenderer,
  verifier: annotationVerifier
});

const plan = await workflow.plan({
  inputPdf,
  externalData: navisRows
});

const reviewed = await reviewService.resolve(plan);
const output = await workflow.renderAndVerify(reviewed);
```

A future punch-list workflow reuses the same services with a different detector, content provider, policy, and style.

---

## 17. Performance and operational considerations

- Cache page-scene analysis by source document hash and analyzer version.
- Analyze only pages containing candidate targets unless a global rail is required.
- Use coarse occupancy grids for initial candidate rejection and precise geometry for finalists.
- Bound candidate count, route count, and beam width.
- Move CPU-heavy raster and vector analysis to a worker.
- Expose progress by page and stage.
- Cancel safely without producing partial committed output.
- Enforce limits on PDF size, page count, annotation count, text length, and primitive count.
- Validate all macro-provided geometry and styles at runtime.

---

## 18. Phased delivery

### Phase 1: Canonical callout and manual UI

- Semantic annotation content model.
- Shared text layout and geometry.
- Canvas preview.
- Manual callout placement and leader editing.
- Flattened vector output.
- Basic review state and audit events.

### Phase 2: Text-aware automatic placement

- PDF text extraction with bounds.
- Candidate generation.
- Orthogonal leader routing.
- Text and title-block obstruction policies.
- Clear, compromised, and unplaceable states.
- Macro planning operation.

### Phase 3: Engineering-graphics awareness

- Vector-path occupancy.
- Raster-density occupancy.
- Existing annotation detection.
- Real branching search.
- Margin-rail placement.
- Least-obstruction diagnostics.

### Phase 4: Adobe-compatible editable annotations

- FreeText callout annotation writer.
- Explicit appearance streams.
- Acrobat interoperability fixtures.
- Editable and flattened output modes.

### Phase 5: Verification and production hardening

- Canonical SHA-256 identity.
- Post-write annotation verification.
- Audit manifest binding.
- Rotation and mixed-content fixtures.
- Dense drawing performance tests.
- Failure recovery and evidence export.

---

## 19. Acceptance criteria for the piping-ISO profile

A release is acceptable when:

1. The callout box never covers a configured protected region.
2. The source PS reference remains visible.
3. A clear placement is preferred over every obstructive placement.
4. A leader-only pipe crossing is preferred over box overlap.
5. Least-obstruction placement reports every detected clash.
6. Unacceptable candidates are rejected instead of silently rendered.
7. Manual movement triggers collision re-evaluation and revokes approval.
8. Preview and PDF output use the same approved geometry and rendered lines.
9. Editable output opens correctly in Acrobat with visible callout and leader.
10. The output is reopened and verified before being reported as successful.
11. Re-running the workflow does not duplicate current annotations.
12. Real fixtures cover dense vector ISOs, scanned ISOs, rotations, title blocks, and repeated annotation text.

---

## 20. Future reuse

The same platform can support:

- P&ID review comments;
- weld and NDE status callouts;
- construction punch items;
- inspection findings;
- revision-difference explanations;
- equipment and valve metadata;
- architectural and structural drawing comments;
- electrical schematic annotations;
- approval and document-control stamps;
- redaction proposal and verification;
- OCR or extraction review overlays.

The reusable assets with the greatest long-term value are:

1. page-scene and occupancy analysis;
2. obstacle-aware placement;
3. orthogonal leader routing;
4. margin-rail layout;
5. review and approval state management;
6. Adobe-compatible annotation rendering;
7. post-write verification and audit binding.

---

## 21. Key architectural invariant

> The output PDF may contain only annotations that were generated from preserved source data, placed under an explicit obstruction policy, approved according to review rules, rendered from the approved immutable model, and successfully verified after reopening the output.

This invariant keeps the feature professional for the initial PS-to-ISONOTE use case and makes the underlying components suitable for broader engineering-document automation.