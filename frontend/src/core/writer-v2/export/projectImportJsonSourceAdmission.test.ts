import { describe, expect, it, vi } from 'vitest';
import { buildRawZipFixture } from '@/core/admission/zip/__tests__/zipFixtureBuilder';
import { inspectZipArchive } from '@/core/admission/zip/zipInventory';
import { admitDeclaredZipResources } from '@/core/admission/zip/zipDeclaredResourceAdmission';
import { admitWriterProjectMembers } from '@/core/admission/zip/writerProjectMemberAdmission';
import { extractZipMembersBounded } from '@/core/admission/zip/zipBoundedExtraction';
import { admitWriterProjectJsonSources } from '@/core/admission/zip/writerProjectJsonSourceAdmission';
import type { ImportPdfHubProjectResult } from './projectZip';
import {
  revokeStagedWriterProjectImport,
  stageStandaloneWriterProject,
  type StandaloneWriterProjectOperation,
} from './projectImportController';

const REQUIRED_ENTRIES = [
  { name: 'manifest.json', data: [] },
  { name: 'writer-elements.json', data: [] },
  { name: 'writer-assets.json', data: [] },
] as const;

describe('standalone Writer project JSON source admission', () => {
  it('runs byte and UTF-8 admission after extraction and before semantic parsing', async () => {
    const calls: string[] = [];
    const fixture = buildRawZipFixture(REQUIRED_ENTRIES);
    const stage = await stageStandaloneWriterProject(
      fileFromBytes(fixture.bytes),
      operation(),
      {
        inspectArchive(bytes) {
          calls.push('structural');
          return inspectZipArchive(bytes);
        },
        admitDeclaredResources(inventory, sourceBytes, policy) {
          calls.push('declared');
          return admitDeclaredZipResources(inventory, sourceBytes, policy);
        },
        admitMembers(inventory, currentOperation) {
          calls.push('member');
          return admitWriterProjectMembers(inventory, currentOperation);
        },
        async extractMembers(...args) {
          calls.push('extraction');
          return extractZipMembersBounded(...args);
        },
        async admitJsonSources(...args) {
          calls.push('json');
          return admitWriterProjectJsonSources(...args);
        },
        async decodeProject(reader) {
          calls.push('semantic');
          expect(await reader.readText('manifest.json')).toBe('');
          return blankImportedProject();
        },
      },
    );

    expect(calls).toEqual([
      'structural',
      'declared',
      'member',
      'extraction',
      'json',
      'semantic',
    ]);
    expect(
      stage.evidence.writerProjectJsonSourceAdmission.admissionOutcome,
    ).toBe('ADMITTED');
    revokeStagedWriterProjectImport(stage);
  });

  it('prevents semantic parsing and staging after fatal UTF-8 rejection', async () => {
    const fixture = buildRawZipFixture([
      { name: 'manifest.json', data: [0x80] },
      { name: 'writer-elements.json', data: [] },
      { name: 'writer-assets.json', data: [] },
    ]);
    const decodeProject = vi.fn<
      (reader: Parameters<typeof admitWriterProjectJsonSources>[2]) =>
        Promise<ImportPdfHubProjectResult>
    >();

    await expect(
      stageStandaloneWriterProject(fileFromBytes(fixture.bytes), operation(), {
        decodeProject,
      }),
    ).rejects.toMatchObject({ outcome: 'REJECTED_UTF8' });
    expect(decodeProject).not.toHaveBeenCalled();
  });
});

function blankImportedProject(): ImportPdfHubProjectResult {
  return {
    manifest: {
      schema: 'pdf-hub-project',
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      documentFingerprint: 'phase3b3b-blank',
      documentMode: 'blankDocument',
      source: { kind: 'blankDocument', hasOriginalPdf: false },
      files: {
        writerElements: 'writer-elements.json',
        writerAssets: 'writer-assets.json',
        assetDirectory: 'assets/',
      },
      counts: { writerElements: 0, writerAssets: 0 },
    },
    originalPdfBytes: new Uint8Array(),
    documentMeta: null,
    elements: [],
    assets: [],
    ocrProject: null,
    compatibilityWarnings: [],
  };
}

function operation(signal?: AbortSignal): StandaloneWriterProjectOperation {
  return {
    operationId: 'phase3b3b-json-admission',
    generation: 1,
    ...(signal ? { signal } : {}),
    isCurrent: () => !signal?.aborted,
    isMounted: () => true,
  };
}

function fileFromBytes(bytes: Uint8Array): File {
  return new File([Uint8Array.from(bytes).buffer], 'project.pdfhub.zip', {
    type: 'application/zip',
  });
}
