import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('standalone Writer project source route', () => {
  it('uses bounded staged import and keeps round-trip PDF separate', () => {
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

  it('orders structural, declared, bounded, and semantic admission before staging', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/writer-v2/export/projectImportController.ts'),
      'utf8',
    );
    const decodeBoundary = source.slice(
      source.indexOf('async function decodeStandaloneWriterProject'),
      source.indexOf('export function revokeStagedWriterProjectImport'),
    );
    const stageBoundary = source.slice(
      source.indexOf('export async function stageStandaloneWriterProject'),
      source.indexOf('export function revokeStagedWriterProjectImport'),
    );

    expect(decodeBoundary).toContain('admitZipSourceMetadata(file.size)');
    expect(decodeBoundary.indexOf('admitZipSourceMetadata')).toBeLessThan(
      decodeBoundary.indexOf('file.arrayBuffer()'),
    );
    expect(decodeBoundary).toContain('inspectZipArchive');
    expect(decodeBoundary).toContain('admitZipArchive');
    expect(decodeBoundary).toContain('admitDeclaredZipResources');
    expect(decodeBoundary).toContain('extractZipMembersBounded');
    expect(decodeBoundary).toContain('importPdfHubWriterProjectFromReader');
    expect(decodeBoundary.indexOf('admitZipArchive')).toBeLessThan(
      decodeBoundary.indexOf('admitDeclaredZipResources'),
    );
    expect(decodeBoundary.indexOf('admitDeclaredZipResources')).toBeLessThan(
      decodeBoundary.indexOf('extractZipMembersBounded'),
    );
    expect(decodeBoundary.indexOf('extractZipMembersBounded')).toBeLessThan(
      decodeBoundary.indexOf('importPdfHubWriterProjectFromReader'),
    );
    expect(decodeBoundary).not.toContain('importPdfHubWriterProject(projectBytes)');
    expect(decodeBoundary).not.toContain('JSZip.loadAsync');
    expect(stageBoundary).not.toContain('useWriterV2Store.setState');
    expect(stageBoundary).not.toContain('hydrateWriterSession');
    expect(stageBoundary).not.toContain('useSessionStore.setState');
    expect(stageBoundary).not.toContain('openDocument');
    expect(stageBoundary).not.toContain('clearDocument');
    expect(stageBoundary).not.toContain('useEditorStore.setState');
    expect(source).not.toContain('useOcrStore');
    expect(source).not.toContain('hydrateOcrSession');
  });

  it('uses the closed owner policy and does not borrow PDF or macro limits', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/writer-v2/export/projectImportController.ts'),
      'utf8',
    );

    expect(source).not.toContain('MAX_PDF_SIZE_BYTES');
    expect(source).not.toContain('DEFAULT_MACRO_RESOURCE_LIMITS');
    expect(source).not.toContain('policy?:');
    expect(source).toContain('admitZipSourceMetadata(file.size)');
    expect(source).toContain('admitDeclaredZipResources');
    expect(source).toContain('extractZipMembersBounded');
  });
});
