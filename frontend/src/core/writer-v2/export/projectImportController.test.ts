import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { createBlankWriterDocumentMeta } from '../writerDocumentMode';
import { useWriterV2Store } from '../writerV2Store';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useOcrStore } from '@/core/ocr/ocrStore';
import {
  exportPdfHubWriterProject,
  type ExportPdfHubProjectInput,
  type PdfHubWriterProjectManifestV1,
} from './projectZip';
import {
  commitStagedWriterProjectImport,
  revokeStagedWriterProjectImport,
  stageStandaloneWriterProject,
  type StandaloneWriterProjectOperation,
  type StagedWriterProjectImport,
} from './projectImportController';

async function onePagePdfBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

async function zeroPagePdfBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  return document.save();
}

function operation(
  generation = 1,
  current = true,
  signal?: AbortSignal,
): StandaloneWriterProjectOperation {
  return {
    operationId: `operation-${generation}`,
    generation,
    signal,
    isCurrent: () => current,
    isMounted: () => true,
  };
}

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 140, height: 70 },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Restored editable text',
    assetIds: ['asset-1'],
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

function asset(): WriterAssetRecordV2 {
  return {
    id: 'asset-1',
    documentFingerprint: 'doc-1',
    kind: 'image',
    mimeType: 'image/png',
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function projectFile(
  input: ExportPdfHubProjectInput,
  fileName = 'project.pdfhub.zip',
): Promise<File> {
  const project = await exportPdfHubWriterProject(input);
  return new File([Uint8Array.from(project.bytes).buffer], fileName, {
    type: 'application/zip',
  });
}

async function overlayFile(): Promise<File> {
  return projectFile({
    originalPdfBytes: await onePagePdfBytes(),
    documentFingerprint: 'doc-1',
    elements: [element('writer-1')],
    assets: [asset()],
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
}

async function blankProjectFile(): Promise<File> {
  const documentMeta = createBlankWriterDocumentMeta({
    documentFingerprint: 'blank-doc-1',
    title: 'Blank Project',
    pageCount: 2,
    now: '2026-01-02T00:00:00.000Z',
  });
  return projectFile({
    originalPdfBytes: null,
    documentFingerprint: documentMeta.documentFingerprint,
    documentMeta,
    elements: [],
    assets: [],
    updatedAt: documentMeta.updatedAt,
  });
}

async function rewriteZipFile(
  file: File,
  rewrite: (zip: JSZip) => Promise<void>,
): Promise<File> {
  const zip = await JSZip.loadAsync(new Uint8Array(await file.arrayBuffer()));
  await rewrite(zip);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([Uint8Array.from(bytes).buffer], file.name, {
    type: 'application/zip',
  });
}

function seedExistingState(): void {
  useSessionStore.getState().openDocument({
    documentKey: 'old-doc',
    fileName: 'old.pdf',
    bytes: new Uint8Array([37, 80, 68, 70, 45, 49]),
    pageCount: 3,
  });
  useSessionStore.getState().setPage(2);
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: 'old-doc',
    elements: [],
    persistedAt: '2026-01-01T00:00:00.000Z',
  });
  useEditorStore.getState().setActiveMode('annotate');
  useOcrStore.getState().hydrateOcrSession({
    documentFingerprint: 'old-ocr-doc',
    forceOcr: true,
    selectedPageIndexes: [0, 2],
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

function stateSnapshot() {
  return {
    session: useSessionStore.getState(),
    writer: useWriterV2Store.getState(),
    editor: useEditorStore.getState(),
    ocr: useOcrStore.getState(),
  };
}

describe('atomic standalone Writer project import', () => {
  beforeEach(() => {
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
    useEditorStore.getState().setActiveMode('annotate');
    useOcrStore.getState().clearOcr();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stages without mutation and commits matching overlay session and Writer state', async () => {
    seedExistingState();
    const beforeOcr = useOcrStore.getState();
    const activeOperation = operation();
    const staged = await stageStandaloneWriterProject(await overlayFile(), activeOperation);

    expect(useSessionStore.getState().documentKey).toBe('old-doc');
    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBe('old-doc');
    expect(Object.isFrozen(staged)).toBe(true);
    expect(Object.isFrozen(staged.evidence)).toBe(true);

    const result = await commitStagedWriterProjectImport(staged, activeOperation);

    expect(result.documentFingerprint).toBe('doc-1');
    expect(useSessionStore.getState().documentKey).toBe('doc-1');
    expect(useSessionStore.getState().pageCount).toBe(1);
    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBe('doc-1');
    expect(useWriterV2Store.getState().elements[0]?.id).toBe('writer-1');
    expect(useWriterV2Store.getState().assetRecords[0]?.id).toBe('asset-1');
    expect(useEditorStore.getState().activeMode).toBe('write');
    expect(useOcrStore.getState()).toEqual(beforeOcr);
  });

  it('commits a blank Writer project by clearing the previous PDF atomically', async () => {
    seedExistingState();
    const beforeOcr = useOcrStore.getState();
    const activeOperation = operation();
    const staged = await stageStandaloneWriterProject(await blankProjectFile(), activeOperation);

    expect(useSessionStore.getState().documentKey).toBe('old-doc');
    await commitStagedWriterProjectImport(staged, activeOperation);

    expect(useSessionStore.getState().documentKey).toBeNull();
    expect(useSessionStore.getState().workingBytes).toBeNull();
    expect(useSessionStore.getState().pageCount).toBe(0);
    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBe('blank-doc-1');
    expect(useWriterV2Store.getState().documentMeta?.mode).toBe('blankDocument');
    expect(useWriterV2Store.getState().documentMeta?.pageCount).toBe(2);
    expect(useEditorStore.getState().activeMode).toBe('write');
    expect(useOcrStore.getState()).toEqual(beforeOcr);
  });

  it('rolls back session, Writer, and editor state after an injected commit failure', async () => {
    seedExistingState();
    const before = stateSnapshot();
    const activeOperation = operation();
    const staged = await stageStandaloneWriterProject(await overlayFile(), activeOperation);

    await expect(
      commitStagedWriterProjectImport(staged, activeOperation, {
        afterSessionMutation: () => {
          throw new Error('injected commit failure');
        },
      }),
    ).rejects.toThrow('injected commit failure');

    expect(stateSnapshot()).toEqual(before);
  });

  it('rejects fabricated, revoked, consumed, stale, and equivalent-operation capabilities before mutation', async () => {
    seedExistingState();
    const before = stateSnapshot();
    const activeOperation = operation();
    const fabricated = Object.freeze({
      operationId: activeOperation.operationId,
      generation: activeOperation.generation,
      documentFingerprint: 'fake',
      documentMode: 'pdfOverlay' as const,
      evidence: Object.freeze({}) as StagedWriterProjectImport['evidence'],
    });
    await expect(commitStagedWriterProjectImport(fabricated, activeOperation)).rejects.toThrow(
      'invalid',
    );

    const revoked = await stageStandaloneWriterProject(await overlayFile(), activeOperation);
    revokeStagedWriterProjectImport(revoked);
    await expect(commitStagedWriterProjectImport(revoked, activeOperation)).rejects.toThrow(
      'revoked',
    );

    const consumed = await stageStandaloneWriterProject(await overlayFile(), activeOperation);
    await commitStagedWriterProjectImport(consumed, activeOperation);
    await expect(commitStagedWriterProjectImport(consumed, activeOperation)).rejects.toThrow(
      'consumed',
    );

    seedExistingState();
    const staged = await stageStandaloneWriterProject(await overlayFile(), operation(3));
    await expect(commitStagedWriterProjectImport(staged, operation(2, false))).rejects.toThrow();

    const identityOperation = operation(5);
    const identityStage = await stageStandaloneWriterProject(
      await overlayFile(),
      identityOperation,
    );
    const equivalentOperation: StandaloneWriterProjectOperation = {
      ...identityOperation,
    };
    await expect(
      commitStagedWriterProjectImport(identityStage, equivalentOperation),
    ).rejects.toThrow('identity');

    expect(stateSnapshot()).toEqual(before);
  });

  it('rejects invalid metadata, signatures, and malformed ZIPs without state mutation', async () => {
    seedExistingState();
    const before = stateSnapshot();

    await expect(
      stageStandaloneWriterProject(
        new File(['not a zip'], 'project.txt', { type: 'text/plain' }),
        operation(),
      ),
    ).rejects.toThrow('not identified');
    await expect(
      stageStandaloneWriterProject(
        new File(['not a zip'], 'project.zip', { type: 'application/zip' }),
        operation(),
      ),
    ).rejects.toThrow('signature');
    await expect(
      stageStandaloneWriterProject(
        new File(
          [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]).buffer],
          'malformed.zip',
          { type: 'application/zip' },
        ),
        operation(),
      ),
    ).rejects.toThrow();

    expect(stateSnapshot()).toEqual(before);
  });

  it('rejects count mismatches, duplicate IDs, dangling references, contradictory modes, and invalid PDFs', async () => {
    seedExistingState();
    const before = stateSnapshot();
    const validPdf = await onePagePdfBytes();

    const countMismatch = await rewriteZipFile(await overlayFile(), async (zip) => {
      const file = zip.file('manifest.json');
      if (!file) throw new Error('missing test manifest');
      const manifest = JSON.parse(
        await file.async('string'),
      ) as PdfHubWriterProjectManifestV1;
      manifest.counts.writerElements += 1;
      zip.file('manifest.json', JSON.stringify(manifest));
    });

    const contradictoryMode = await rewriteZipFile(await overlayFile(), async (zip) => {
      const file = zip.file('manifest.json');
      if (!file) throw new Error('missing test manifest');
      const manifest = JSON.parse(
        await file.async('string'),
      ) as PdfHubWriterProjectManifestV1;
      manifest.documentMode = 'blankDocument';
      zip.file('manifest.json', JSON.stringify(manifest));
    });

    const duplicateElements = await projectFile({
      originalPdfBytes: validPdf,
      documentFingerprint: 'doc-1',
      elements: [element('duplicate'), { ...element('duplicate'), assetIds: [] }],
      assets: [asset()],
    });
    const duplicateAssets = await projectFile({
      originalPdfBytes: validPdf,
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
      assets: [asset(), { ...asset() }],
    });
    const danglingReference = await projectFile({
      originalPdfBytes: validPdf,
      documentFingerprint: 'doc-1',
      elements: [{ ...element('writer-1'), assetIds: ['missing-asset'] }],
      assets: [],
    });
    const invalidPdf = await projectFile({
      originalPdfBytes: new Uint8Array([37, 80, 68, 70, 45, 1, 2, 3]),
      documentFingerprint: 'doc-1',
      elements: [],
      assets: [],
    });
    const zeroPagePdf = await projectFile({
      originalPdfBytes: await zeroPagePdfBytes(),
      documentFingerprint: 'doc-1',
      elements: [],
      assets: [],
    });

    await expect(stageStandaloneWriterProject(countMismatch, operation())).rejects.toThrow(
      'count',
    );
    await expect(stageStandaloneWriterProject(duplicateElements, operation())).rejects.toThrow(
      'unique',
    );
    await expect(stageStandaloneWriterProject(duplicateAssets, operation())).rejects.toThrow(
      'unique',
    );
    await expect(stageStandaloneWriterProject(danglingReference, operation())).rejects.toThrow(
      'missing asset',
    );
    await expect(stageStandaloneWriterProject(contradictoryMode, operation())).rejects.toThrow(
      'contradictory document mode',
    );
    await expect(stageStandaloneWriterProject(invalidPdf, operation())).rejects.toThrow(
      'could not be parsed',
    );
    await expect(stageStandaloneWriterProject(zeroPagePdf, operation())).rejects.toThrow(
      'invalid page count',
    );

    expect(stateSnapshot()).toEqual(before);
  });

  it('normalizes stale nested fingerprints and records deterministic warnings', async () => {
    const staleFile = await rewriteZipFile(await overlayFile(), async (zip) => {
      const elementFile = zip.file('writer-elements.json');
      const assetFile = zip.file('writer-assets.json');
      if (!elementFile || !assetFile) throw new Error('missing test members');
      const elements = JSON.parse(await elementFile.async('string')) as WriterElementV2[];
      const assets = JSON.parse(await assetFile.async('string')) as Array<{
        documentFingerprint: string;
      }>;
      elements[0].documentFingerprint = 'stale-element-doc';
      assets[0].documentFingerprint = 'stale-asset-doc';
      zip.file('writer-elements.json', JSON.stringify(elements));
      zip.file('writer-assets.json', JSON.stringify(assets));
    });

    const activeOperation = operation();
    const staged = await stageStandaloneWriterProject(staleFile, activeOperation);
    const warningCodes = staged.evidence.diagnostics.map((diagnostic) => diagnostic.code);
    expect(warningCodes).toEqual([
      'WRITER_PROJECT_FINGERPRINT_NORMALIZED',
      'WRITER_PROJECT_FINGERPRINT_NORMALIZED',
    ]);

    await commitStagedWriterProjectImport(staged, activeOperation);
    expect(useWriterV2Store.getState().elements[0]?.documentFingerprint).toBe('doc-1');
    expect(useWriterV2Store.getState().assetRecords[0]?.documentFingerprint).toBe('doc-1');
  });

  it('cancellation during file read prevents staging and leaves every store unchanged', async () => {
    seedExistingState();
    const before = stateSnapshot();
    const controller = new AbortController();
    const file = await overlayFile();
    vi.spyOn(file, 'arrayBuffer').mockImplementation(
      () => new Promise<ArrayBuffer>(() => undefined),
    );

    const pending = stageStandaloneWriterProject(
      file,
      operation(1, true, controller.signal),
    );
    controller.abort('test cancellation');

    await expect(pending).rejects.toThrow('cancelled');
    expect(stateSnapshot()).toEqual(before);
  });

  it('cancellation during original PDF validation prevents staging and commit', async () => {
    seedExistingState();
    const before = stateSnapshot();
    const controller = new AbortController();
    const loadSpy = vi.spyOn(PDFDocument, 'load').mockImplementationOnce(
      () => new Promise<PDFDocument>(() => undefined),
    );

    const pending = stageStandaloneWriterProject(
      await overlayFile(),
      operation(1, true, controller.signal),
    );
    await vi.waitFor(() => expect(loadSpy).toHaveBeenCalled());
    controller.abort('test cancellation');

    await expect(pending).rejects.toThrow('cancelled');
    expect(stateSnapshot()).toEqual(before);
  });
});
