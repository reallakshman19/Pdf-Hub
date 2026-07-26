import { describe, expect, it, vi } from 'vitest';
import { buildRawZipFixture } from '@/core/admission/zip/__tests__/zipFixtureBuilder';
import type { ProjectArchiveReader } from '@/core/admission/zip/projectArchiveReader';
import { computeZipCrc32 } from '@/core/admission/zip/zipCrc32';
import { inspectZipArchive } from '@/core/admission/zip/zipInventory';
import { admitDeclaredZipResources } from '@/core/admission/zip/zipDeclaredResourceAdmission';
import { admitWriterProjectMembers } from '@/core/admission/zip/writerProjectMemberAdmission';
import { extractZipMembersBounded } from '@/core/admission/zip/zipBoundedExtraction';
import { admitWriterProjectJsonSources } from '@/core/admission/zip/writerProjectJsonSourceAdmission';
import type { AdmittedWriterProjectJsonSourceSet } from '@/core/admission/zip/writerProjectJsonSourceSet';
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
    const invalidUtf8 = Uint8Array.from([0x80]);
    const fixture = buildRawZipFixture([
      {
        name: 'manifest.json',
        data: invalidUtf8,
        crc32: computeZipCrc32(invalidUtf8),
      },
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

  it('releases admitted strings and bounded member ownership after decoding', async () => {
    const fixture = buildRawZipFixture(REQUIRED_ENTRIES);
    let capturedSourceSet: AdmittedWriterProjectJsonSourceSet | undefined;
    let capturedBoundedReader: ProjectArchiveReader | undefined;

    const stage = await stageStandaloneWriterProject(
      fileFromBytes(fixture.bytes),
      operation(),
      {
        async admitJsonSources(memberSet, memberAdmission, reader, currentOperation) {
          capturedBoundedReader = reader;
          capturedSourceSet = await admitWriterProjectJsonSources(
            memberSet,
            memberAdmission,
            reader,
            currentOperation,
          );
          return capturedSourceSet;
        },
        async decodeProject(reader) {
          expect(await reader.readText('manifest.json')).toBe('');
          return blankImportedProject();
        },
      },
    );

    expect(capturedSourceSet).toBeDefined();
    expect(capturedBoundedReader).toBeDefined();
    await expect(
      capturedSourceSet!.reader.readText('manifest.json'),
    ).rejects.toThrow('no longer available');
    await expect(
      capturedBoundedReader!.readBytes('manifest.json'),
    ).rejects.toThrow('Bounded ZIP member set is no longer available');
    expect(stage.evidence.writerProjectJsonSourceAdmission.admissionOutcome).toBe(
      'ADMITTED',
    );
    revokeStagedWriterProjectImport(stage);
  });

  it('cancels after source-set registration and before semantic decoding', async () => {
    const fixture = buildRawZipFixture(REQUIRED_ENTRIES);
    const controller = new AbortController();
    const decodeProject = vi.fn<
      (reader: ProjectArchiveReader) => Promise<ImportPdfHubProjectResult>
    >();
    let capturedSourceSet: AdmittedWriterProjectJsonSourceSet | undefined;

    await expect(
      stageStandaloneWriterProject(
        fileFromBytes(fixture.bytes),
        operation(controller.signal),
        {
          async admitJsonSources(
            memberSet,
            memberAdmission,
            reader,
            currentOperation,
          ) {
            capturedSourceSet = await admitWriterProjectJsonSources(
              memberSet,
              memberAdmission,
              reader,
              currentOperation,
            );
            controller.abort('cancel after JSON source-set registration');
            return capturedSourceSet;
          },
          decodeProject,
        },
      ),
    ).rejects.toThrow(
      'Operation cancelled while running standalone Writer project after JSON source admission.',
    );

    expect(decodeProject).not.toHaveBeenCalled();
    expect(capturedSourceSet).toBeDefined();
    await expect(
      capturedSourceSet!.reader.readText('manifest.json'),
    ).rejects.toThrow('no longer available');
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
        writerDocumentMeta: 'writer-document-meta.json',
        assetDirectory: 'assets/',
      },
      counts: { writerElements: 0, writerAssets: 0 },
    },
    originalPdfBytes: new Uint8Array(),
    documentMeta: {
      documentFingerprint: 'phase3b3b-blank',
      mode: 'blankDocument',
      title: 'Phase 3B.3B Blank',
      pageSetup: {
        preset: 'A4',
        width: 595.28,
        height: 841.89,
        unit: 'pt',
        marginTop: 72,
        marginRight: 72,
        marginBottom: 72,
        marginLeft: 72,
        backgroundColor: '#ffffff',
      },
      pageCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
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
