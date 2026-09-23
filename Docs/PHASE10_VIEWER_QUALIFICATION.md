# Phase 10 External Viewer Qualification

This runbook qualifies the **current production native annotation output** before any production `/AP` appearance-stream implementation is considered.

The qualification boundary is evidence-first:

- corpus PDFs are produced through `writeNativePdfAnnotations()`;
- all 17 supported PDF Hub annotation types are included as isolated fixtures;
- a mandatory `review-round-trip` fixture covers highlight + comment + reply + resolved review state;
- the current managed-root baseline must have no `/AP`;
- rendering, native interaction, and edit/save/reopen are recorded as separate capabilities;
- a viewer that does not support annotation editing may record `UNSUPPORTED` for that capability, but `UNSUPPORTED` is never a PASS claim;
- missing evidence, `FAIL`, or `NOT_RUN` never becomes a compatibility claim.

## 1. Generate the corpus

From `frontend/`, choose an empty output directory.

PowerShell:

```powershell
$env:PHASE10_VIEWER_CORPUS_DIR = "$PWD\phase10-viewer-corpus"

pnpm exec vitest run `
  src/core/pdf-annotations/viewerQualificationCorpus.test.ts `
  --pool=forks `
  --maxWorkers=1
```

The test writes:

- one PDF for each of the 17 supported annotation types;
- `phase10-review-round-trip.pdf`;
- `corpus-index.json`.

The same test raw-inspects every isolated root annotation and requires the expected `/NM`, subtype, and absent `/AP`. It also raw-inspects the review journey and requires:

- highlight root;
- comment root;
- reply `/Text` annotation with `/IRT` to the comment root and `/RT /R`;
- separate review-state `/Text` annotation with `/IRT` to the comment root, `/StateModel /Review`, and the expected `/State`;
- no standard `/StateModel` or `/State` on the comment root.

The corpus is a qualification artifact. Do not hand-edit generated PDFs before viewer testing.

## 2. Prepare an evidence file

Copy:

`src/core/pdf-annotations/fixtures/viewerQualificationEvidence.example.json`

to a working evidence file outside the source tree.

The example is structurally valid but intentionally `NOT_RUN`. Replace its illustrative corpus material head and viewer identity with exact observed values:

- viewer name;
- exact viewer version;
- operating system/platform;
- exact 40-character product material commit used to generate the corpus.

A viewer may be added only when it will actually be exercised. The manifest does not pre-declare viewer compatibility.

## 3. Record isolated annotation capabilities

For every generated type PDF in every declared viewer, record:

- `render=PASS` only when the expected annotation is visibly rendered with usable geometry/content;
- `native_interaction=PASS` only when the viewer exposes the annotation as a native/selectable/inspectable annotation object;
- `native_interaction=UNSUPPORTED` only when the viewer demonstrably has no such interaction surface for that type;
- `edit_save_reopen=PASS` only when the viewer supports a normal annotation edit, the document is saved, closed, reopened, and the annotation remains native/editable;
- `edit_save_reopen=UNSUPPORTED` only when that edit/save workflow is demonstrably unavailable;
- a durable `evidence_ref` identifying the observation.

`FAIL` means the viewer claims/exposes the capability but the fixture did not survive it correctly. `NOT_RUN` means the capability was not exercised. Neither qualifies.

If `native_interaction=UNSUPPORTED`, then `edit_save_reopen` must also be `UNSUPPORTED`. A PASS for edit/save/reopen requires a PASS for native interaction.

A screenshot may support rendering evidence. It does not prove native interaction or edit/save/reopen.

## 4. Run the review-round-trip journey

For `phase10-review-round-trip.pdf`, record one `journey_observations` entry per viewer.

Start with the generated graph:

1. highlight;
2. comment;
3. reply;
4. resolved review state.

Record:

- `render`;
- `native_interaction`;
- `edit_save_reopen`;
- `external_mutation`;
- `return_semantics`;
- durable `evidence_ref`.

Where the viewer supports annotation editing:

1. make at least one detectable standards-native edit: change comment text, change review state, edit/add a reply, or change highlight geometry/style that the production reader represents;
2. save;
3. close and reopen in that viewer;
4. confirm the edited work remains native;
5. reopen the externally saved PDF in PDF Hub;
6. verify root/reply identity, review state, geometry/content, nested reply parentage where present, and no duplication;
7. save again in PDF Hub and structurally verify the graph again;
8. record `external_mutation=PASS` only when the returned-file probe reports a non-empty `external_delta`;
9. record `return_semantics=PASS` only when that return path succeeds.

Where the viewer does not support edit/save/reopen, record `edit_save_reopen=UNSUPPORTED`, `external_mutation=UNSUPPORTED`, and `return_semantics=UNSUPPORTED`. That qualifies the observed render/native capability profile without creating an edit-round-trip compatibility claim.

When the viewer **does** support edit/save/reopen, run the returned PDF through the production-reader/writer probe before recording `return_semantics=PASS`:

```powershell
pnpm run validate:phase10-returned-review C:\path\to\returned-review.pdf C:\path\to\return-evidence.json
```

Do not insert a standalone `--` before the PDF path.

The probe:

1. raw-inspects the returned file for the managed highlight/comment roots and native reply/review-state relationships;
2. imports the returned file through `readNativePdfAnnotations()`;
3. generates and reads a normalized baseline using the same production writer/reader;
4. compares only standard-derived review/highlight semantics and requires a non-empty external semantic delta;
5. snapshots the returned semantic state, including reply IDs/content and review status;
6. saves through `writeNativePdfAnnotations()`;
7. reopens through the production reader;
8. repeats a second PDF Hub save/reopen;
9. requires semantic convergence with no reply-ID drift or managed relationship duplication;
10. compares normalized native reply topology (`id`, `parentReplyId`, depth, author/content) before and after the two PDF Hub saves, including opaque native replies that are not projected into the app model;
11. requires externally supplied `/AP` presence, `Subj`, and rich-text `RC` on managed roots/replies to survive those no-op saves where present;
12. preserves reply-attached Review-state relationships without projecting those states onto the root thread;
13. writes `phase10-review-return-evidence-v1` JSON containing `external_delta` only after all assertions pass.

A no-op external open/save fails qualification. A successful command prints `RETURN SEMANTICS QUALIFIED`. Use the generated JSON report as the durable evidence reference for the journey return claim.

## 5. Validate the evidence

From `frontend/`:

```powershell
node scripts/phase10-validate-viewer-evidence.mjs C:\path\to\viewer-evidence.json
```

or:

```powershell
pnpm run validate:phase10-viewer-evidence C:\path\to\viewer-evidence.json
```

With pnpm 10, do not insert a standalone `--` before the evidence path: pnpm forwards it literally and the validator will try to open a file named `--`.

The validator has three outcomes:

- `QUALIFIED CAPABILITY PROFILE` / exit 0: every required type and review-journey record has `render=PASS`, durable evidence, and each higher capability is either `PASS` or explicitly observed `UNSUPPORTED`; edit-capable journeys also require `external_mutation=PASS` and `return_semantics=PASS`;
- `NOT QUALIFIED` / exit 1: evidence is structurally valid but at least one required observation is `FAIL`, `NOT_RUN`, or lacks durable evidence;
- `INVALID EVIDENCE` / exit 2: required records/fields are missing, duplicated, invalid, or internally inconsistent.

An exit-0 profile does **not** mean every capability is supported. Claims must match the reported PASS/UNSUPPORTED profile exactly.

## 6. Decide whether production /AP work is justified

This work does **not** add appearance streams.

Use viewer evidence to define the smallest subsequent implementation slice by appearance family. If standard native dictionaries already render reliably in a target viewer, that is evidence against unnecessary `/AP` work for that viewer/type. If rendering fails, the evidence must identify the affected viewer/type/family before `/AP` is implemented.

**No compatibility claim** is valid from structural PDF inspection alone. Named-viewer claims require the external observations above, and edit-round-trip claims require `edit_save_reopen=PASS` plus successful return semantics for the review journey.
