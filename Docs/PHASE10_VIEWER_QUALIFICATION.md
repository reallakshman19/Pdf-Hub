# Phase 10 External Viewer Qualification

This runbook qualifies the **current production native annotation output** before any production `/AP` appearance-stream implementation is considered.

The qualification boundary is evidence-first:

- corpus PDFs are produced through `writeNativePdfAnnotations()`;
- all 17 supported PDF Hub annotation types are included;
- the current managed-annotation baseline must have no `/AP`;
- an external viewer/type pair is not qualified without both visual rendering and reopen/continued-editability evidence;
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

The test writes one PDF per supported annotation type plus `corpus-index.json`. The same test also raw-inspects every managed root annotation and requires its expected `/NM`, expected subtype, and absent `/AP`.

The corpus is a qualification artifact. Do not hand-edit the generated PDFs before viewer testing.

## 2. Prepare an evidence file

Copy:

`src/core/pdf-annotations/fixtures/viewerQualificationEvidence.example.json`

to a working evidence file outside the source tree.

The example is structurally valid but intentionally NOT_RUN. Replace its illustrative corpus material head and viewer identity with exact values observed during the run:

- viewer name;
- exact viewer version;
- operating system/platform;
- exact 40-character product material commit used to generate the corpus.

A viewer may be added only when it will actually be exercised. The manifest does not pre-declare viewer compatibility.

## 3. Observe every viewer/type pair

For every generated PDF in every declared viewer:

1. open the PDF and inspect the annotation visually;
2. record `render=PASS` only when the expected visible annotation is present with usable geometry/content;
3. save or otherwise perform the viewer's normal annotation edit workflow where supported;
4. close and reopen the resulting PDF;
5. record `reopen_editability=PASS` only when the annotation remains a native/selectable annotation object and the viewer permits the family-appropriate edit probe;
6. set `evidence_ref` to a durable artifact or report that identifies what was observed.

Appearance-family probes are defined in `viewerQualificationManifest.json`. A screenshot alone may support rendering evidence, but it does not by itself prove reopen/continued editability.

## 4. Validate the evidence

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

- `QUALIFIED` / exit 0: every declared viewer/type pair has `render=PASS`, `reopen_editability=PASS`, and a non-empty `evidence_ref`;
- `NOT QUALIFIED` / exit 1: the evidence file is structurally valid but at least one observation is `FAIL`, `NOT_RUN`, or lacks durable evidence;
- `INVALID EVIDENCE` / exit 2: required viewer/type observations or required fields are missing/duplicated/invalid.

## 5. Decide whether production /AP work is justified

This EP does **not** add appearance streams.

If one or more viewer/type pairs fail, use the recorded evidence to define the smallest subsequent implementation EP by appearance family. If current standard annotation dictionaries already render and remain editable in a target viewer, that is evidence against adding unnecessary `/AP` for that viewer/type.

**No compatibility claim** is valid from structural PDF inspection alone. Named-viewer compatibility requires the external observations above.
