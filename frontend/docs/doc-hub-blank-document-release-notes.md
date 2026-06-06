# Doc Hub Blank Document Authoring Path — Release Notes

Branch: `doc-hub-phase4a-blank-doc`

## Summary

This branch upgrades Writer V2 from a PDF-overlay-only authoring layer into a basic Doc Hub authoring path while preserving the existing PDF Hub overlay behavior.

The new blank document mode can create a document without a source PDF, render blank pages, insert Writer elements, export to PDF/DOCX, and save/reload as an editable PDF Hub project ZIP.

## User-facing capabilities

- Create a blank Writer document.
- Choose A4, Letter, Legal, or Custom page setup.
- Configure margins and page background color.
- Rename the document after creation.
- Render a blank page stack with margin guides.
- Add, insert, duplicate, and remove pages.
- Place rich text boxes, callouts, stamps, review labels, notes, tables, and images.
- Export blank documents to PDF.
- Export blank documents to DOCX.
- Save/open blank documents as `.pdfhub.zip` projects.

## Core implementation areas

- Blank document metadata and page setup model.
- Writer store actions for blank document creation, rename, page setup, and page operations.
- Blank document canvas and page renderer.
- Page setup and rename dialogs.
- Image asset creation and image insertion UI.
- Project ZIP schema extension with `writer-document-meta.json`.
- Blank document PDF source generation.
- Blank document DOCX export with page setup propagation.
- Table and image export certification.
- Dedicated certification script and CI workflow.

## Important files

```txt
frontend/src/core/writer-v2/writerDocumentMode.ts
frontend/src/core/writer-v2/writerBlankDocumentLayout.ts
frontend/src/core/writer-v2/writerDocumentTitle.ts
frontend/src/core/writer-v2/writerImageAsset.ts
frontend/src/core/writer-v2/writerV2Store.ts
frontend/src/core/writer-v2/export/projectZip.ts
frontend/src/core/writer-v2/export/exportCurrentWriterPdf.ts
frontend/src/core/writer-v2/export/exportLiveBlankWriterDocx.ts
frontend/src/core/writer-v2/export/docx/buildWriterDocxDocument.ts
frontend/src/components/writer-v2/WriterBlankDocumentCanvas.tsx
frontend/src/components/writer-v2/WriterBlankPageCanvas.tsx
frontend/src/components/writer-v2/BlankDocumentCreateDialog.tsx
frontend/src/components/writer-v2/BlankDocumentPageSetupDialog.tsx
frontend/src/components/writer-v2/BlankDocumentRenameDialog.tsx
frontend/src/components/writer-v2/WriterBlankImageInsertButton.tsx
frontend/src/components/writer-v2/WriterV2ToolbarControls.tsx
frontend/scripts/certify-writer-blank-doc.mjs
.github/workflows/frontend-ci.yml
```

## Certification gates

Run from `frontend`:

```bash
npm run typecheck
npm run certify:writer-blank-doc
npm run check:doc-hub
npm run check:release
```

`certify:writer-blank-doc` writes:

```txt
frontend/artifacts/writer-blank-doc-certification.json
```

The frontend CI workflow runs:

```bash
npm ci
npm run check:release
```

and uploads:

```txt
frontend/artifacts/*.json
```

as the `doc-hub-certification` artifact.

## Known verification note

This branch was implemented through connector-based source edits. Local commands were not executed in the connector environment. Treat GitHub Actions and local `npm run check:release` as the executable proof before merge.
