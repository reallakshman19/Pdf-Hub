import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('standalone Writer project source route', () => {
  it('uses staged import and keeps round-trip PDF separate', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/writer-v2/WriterV2ToolbarControls.tsx'),
      'utf8',
    );
    const route = source.slice(
      source.indexOf('const importProjectFile'),
      source.indexOf('const runRichToolbarAction'),
    );

    expect(route).toContain('stageStandaloneWriterProject');
    expect(route).toContain('commitStagedWriterProjectImport');
    expect(route).toContain('AbortController');
    expect(route).toContain('isCurrent');
    expect(route).toContain('isMounted');
    expect(route).not.toContain('importProjectIntoWriterStore');
    expect(route).not.toContain('hydrateWriterSession');
    expect(route).not.toContain('PDFDocument.load');
    expect(route).toContain('importRoundTripPdfIntoWriterStore');
    expect(route.indexOf('importRoundTripPdfIntoWriterStore')).toBeLessThan(
      route.indexOf('stageStandaloneWriterProject'),
    );
  });

  it('keeps decode/stage free of application-state mutation and OCR hydration', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/writer-v2/export/projectImportController.ts'),
      'utf8',
    );
    const stageBoundary = source.slice(
      source.indexOf('export async function stageStandaloneWriterProject'),
      source.indexOf('export function revokeStagedWriterProjectImport'),
    );

    expect(stageBoundary).not.toContain('useWriterV2Store.setState');
    expect(stageBoundary).not.toContain('hydrateWriterSession');
    expect(stageBoundary).not.toContain('useSessionStore.setState');
    expect(stageBoundary).not.toContain('openDocument');
    expect(stageBoundary).not.toContain('clearDocument');
    expect(stageBoundary).not.toContain('useEditorStore.setState');
    expect(source).not.toContain('useOcrStore');
    expect(source).not.toContain('hydrateOcrSession');
  });

  it('does not borrow PDF or macro numeric policies', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/writer-v2/export/projectImportController.ts'),
      'utf8',
    );

    expect(source).not.toContain('MAX_PDF_SIZE_BYTES');
    expect(source).not.toContain('DEFAULT_MACRO_RESOURCE_LIMITS');
    expect(source).toContain('UNRESOLVED_POLICY');
    expect(source).toContain("'SOURCE_BYTES'");
    expect(source).toContain("'ZIP_ENTRY_COUNT'");
    expect(source).toContain("'JSON_BYTES'");
    expect(source).toContain("'WRITER_ELEMENT_COUNT'");
    expect(source).toContain("'WRITER_ASSET_COUNT'");
  });
});
