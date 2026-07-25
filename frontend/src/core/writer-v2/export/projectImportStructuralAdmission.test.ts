import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { useEditorStore } from '@/core/editor/store';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useSessionStore } from '@/core/session/store';
import { buildRawZipFixture } from '@/core/admission/zip/__tests__/zipFixtureBuilder';
import { inspectZipArchive } from '@/core/admission/zip/zipInventory';
import { useWriterV2Store } from '../writerV2Store';
import { exportPdfHubWriterProject } from './projectZip';
import {
  stageStandaloneWriterProject,
  type StandaloneWriterProjectOperation,
} from './projectImportController';

function operation(signal?: AbortSignal): StandaloneWriterProjectOperation {
  return {
    operationId: 'phase3b1-operation',
    generation: 1,
    signal,
    isCurrent: () => true,
    isMounted: () => true,
  };
}

function fileFromBytes(bytes: Uint8Array): File {
  return new File([Uint8Array.from(bytes).buffer], 'project.pdfhub.zip', {
    type: 'application/zip',
  });
}

function snapshot() {
  return {
    session: useSessionStore.getState(),
    writer: useWriterV2Store.getState(),
    editor: useEditorStore.getState(),
    ocr: useOcrStore.getState(),
  };
}

async function exportedProjectFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const exported = await exportPdfHubWriterProject({
    originalPdfBytes: await pdf.save(),
    documentFingerprint: 'phase3b1-compatible',
    elements: [],
    assets: [],
  });
  return fileFromBytes(exported.bytes);
}

describe('standalone project raw ZIP admission integration', () => {
  beforeEach(() => {
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
    useEditorStore.getState().setActiveMode('annotate');
    useOcrStore.getState().clearOcr();
  });

  it('rejects duplicate raw records before compatibility decoding or state mutation', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'existing',
      fileName: 'existing.pdf',
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
      pageCount: 1,
    });
    const before = snapshot();
    const duplicate = buildRawZipFixture([
      { name: 'manifest.json' },
      { name: 'manifest.json' },
    ]);
    const decodeProject = vi.fn(async () => {
      throw new Error('compatibility decoder must not run');
    });

    await expect(
      stageStandaloneWriterProject(fileFromBytes(duplicate.bytes), operation(), {
        decodeProject,
      }),
    ).rejects.toThrow('duplicate entry');

    expect(decodeProject).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
  });

  it('checks cancellation after raw inspection and before compatibility decoding', async () => {
    const controller = new AbortController();
    const decodeProject = vi.fn(async () => {
      throw new Error('compatibility decoder must not run');
    });
    const fixture = buildRawZipFixture([{ name: 'manifest.json' }]);

    await expect(
      stageStandaloneWriterProject(
        fileFromBytes(fixture.bytes),
        operation(controller.signal),
        {
          inspectArchive: (bytes) => {
            const inventory = inspectZipArchive(bytes);
            controller.abort('cancel after structural inspection');
            return inventory;
          },
          decodeProject,
        },
      ),
    ).rejects.toThrow('cancelled');

    expect(decodeProject).not.toHaveBeenCalled();
    expect(useSessionStore.getState().documentKey).toBeNull();
    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBeNull();
  });

  it('admits the current exported project before Phase 3A.1 semantic staging', async () => {
    const staged = await stageStandaloneWriterProject(
      await exportedProjectFile(),
      operation(),
    );

    expect(staged.evidence.zipStructuralAdmission.outcome).toBe('ADMITTED');
    expect(staged.evidence.zipStructuralAdmission.entries.map((entry) => entry.decodedFilename)).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'original.pdf',
        'writer-elements.json',
        'writer-assets.json',
      ]),
    );
    expect(staged.evidence.zipStructuralAdmission.measurements.RAW_ENTRY_COUNT).toBeGreaterThan(0);
    expect(useSessionStore.getState().documentKey).toBeNull();
    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBeNull();
  });
});
