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
    const standaloneRoute = route.slice(route.indexOf('const previous'));

    expect(standaloneRoute).toContain('stageStandaloneWriterProject');
    expect(standaloneRoute).toContain('commitStagedWriterProjectImport');
    expect(standaloneRoute).toContain('AbortController');
    expect(standaloneRoute).toContain('isCurrent');
    expect(standaloneRoute).toContain('isMounted');
    expect(standaloneRoute).not.toContain('importProjectIntoWriterStore');
    expect(standaloneRoute).not.toContain('hydrateWriterSession');
    expect(standaloneRoute).not.toContain('PDFDocument.load');
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

    expect(stageBoundary).toContain('inspectZipArchive');
    expect(stageBoundary).toContain('admitZipArchive');
    expect(stageBoundary.indexOf('admitZipArchive')).toBeLessThan(
      stageBoundary.indexOf('importPdfHubWriterProject'),
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
