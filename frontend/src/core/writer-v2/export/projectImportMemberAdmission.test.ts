import { describe, expect, it, vi } from 'vitest';
import { buildRawZipFixture } from '@/core/admission/zip/__tests__/zipFixtureBuilder';
import { inspectZipArchive } from '@/core/admission/zip/zipInventory';
import { admitDeclaredZipResources } from '@/core/admission/zip/zipDeclaredResourceAdmission';
import { admitWriterProjectMembers } from '@/core/admission/zip/writerProjectMemberAdmission';
import { extractZipMembersBounded } from '@/core/admission/zip/zipBoundedExtraction';
import type { ImportPdfHubProjectResult } from './projectZip';
import {
  revokeStagedWriterProjectImport,
  stageStandaloneWriterProject,
  type StandaloneWriterProjectOperation,
} from './projectImportController';

const REQUIRED_ENTRIES = [
  { name: 'manifest.json' },
  { name: 'writer-elements.json' },
  { name: 'writer-assets.json' },
] as const;

describe('standalone Writer project static member admission', () => {
  it('runs structural, declared, member, extraction, and semantic boundaries in order', async () => {
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
        async decodeProject() {
          calls.push('semantic');
          return blankImportedProject();
        },
      },
    );

    expect(calls).toEqual([
      'structural',
      'declared',
      'member',
      'extraction',
      'semantic',
    ]);
    expect(stage.evidence.writerProjectMemberAdmission.admissionOutcome).toBe(
      'ADMITTED',
    );
    revokeStagedWriterProjectImport(stage);
  });

  it('rejects an unknown member before bounded extraction or semantic decoding', async () => {
    const fixture = buildRawZipFixture([
      ...REQUIRED_ENTRIES,
      { name: 'debug.json' },
    ]);
    const extractMembers = vi.fn<typeof extractZipMembersBounded>();
    const decodeProject = vi.fn<
      () => Promise<ImportPdfHubProjectResult>
    >();

    await expect(
      stageStandaloneWriterProject(fileFromBytes(fixture.bytes), operation(), {
        extractMembers,
        decodeProject,
      }),
    ).rejects.toMatchObject({ outcome: 'REJECTED_UNKNOWN_MEMBER' });

    expect(extractMembers).not.toHaveBeenCalled();
    expect(decodeProject).not.toHaveBeenCalled();
  });

  it('does not start extraction when member admission is cancelled', async () => {
    const fixture = buildRawZipFixture(REQUIRED_ENTRIES);
    const controller = new AbortController();
    const extractMembers = vi.fn<typeof extractZipMembersBounded>();
    const decodeProject = vi.fn<
      () => Promise<ImportPdfHubProjectResult>
    >();

    await expect(
      stageStandaloneWriterProject(
        fileFromBytes(fixture.bytes),
        operation(controller.signal),
        {
          admitMembers(inventory, currentOperation) {
            controller.abort('cancel before static member admission');
            return admitWriterProjectMembers(inventory, currentOperation);
          },
          extractMembers,
          decodeProject,
        },
      ),
    ).rejects.toMatchObject({ outcome: 'CANCELLED' });

    expect(extractMembers).not.toHaveBeenCalled();
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
      documentFingerprint: 'member-admission-blank',
      documentMode: 'blankDocument',
      source: {
        kind: 'blankDocument',
        hasOriginalPdf: false,
      },
      files: {
        writerElements: 'writer-elements.json',
        writerAssets: 'writer-assets.json',
        writerDocumentMeta: 'writer-document-meta.json',
        assetDirectory: 'assets/',
      },
      counts: {
        writerElements: 0,
        writerAssets: 0,
      },
    },
    originalPdfBytes: new Uint8Array(),
    documentMeta: {
      documentFingerprint: 'member-admission-blank',
      mode: 'blankDocument',
      title: 'Member Admission Blank',
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
    operationId: 'phase3b3a-member-admission',
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
