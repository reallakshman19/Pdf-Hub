import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { useWriterV2Store } from '../writerV2Store';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { exportPdfHubWriterProject } from './projectZip';
import {
  commitStagedWriterProjectImport,
  revokeStagedWriterProjectImport,
  stageStandaloneWriterProject,
  type StandaloneWriterProjectOperation,
  type StagedWriterProjectImport,
} from './projectImportController';

async function blankPdfBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

function operation(generation = 1, current = true): StandaloneWriterProjectOperation {
  return {
    operationId: `operation-${generation}`,
    generation,
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
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function overlayFile(): Promise<File> {
  const project = await exportPdfHubWriterProject({
    originalPdfBytes: await blankPdfBytes(),
    documentFingerprint: 'doc-1',
    elements: [element('writer-1')],
    assets: [asset()],
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  return new File([project.bytes], 'project.pdfhub.zip', { type: 'application/zip' });
}

describe('atomic standalone Writer project import', () => {
  beforeEach(() => {
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
    useEditorStore.getState().setActiveMode('annotate');
  });

  it('stages without mutation and commits session and Writer state together', async () => {
    const existingPdf = await blankPdfBytes();
    useSessionStore.getState().openDocument({
      documentKey: 'old-doc',
      fileName: 'old.pdf',
      bytes: existingPdf,
      pageCount: 1,
    });
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'old-doc',
      elements: [],
    });

    const activeOperation = operation();
    const staged = await stageStandaloneWriterProject(await overlayFile(), activeOperation);
    expect(useSessionStore.getState().documentKey).toBe('old-doc');
    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBe('old-doc');

    const result = await commitStagedWriterProjectImport(staged, activeOperation);
    expect(result.documentFingerprint).toBe('doc-1');
    expect(useSessionStore.getState().documentKey).toBe('doc-1');
    expect(useSessionStore.getState().pageCount).toBe(1);
    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBe('doc-1');
    expect(useWriterV2Store.getState().elements[0]?.id).toBe('writer-1');
    expect(useWriterV2Store.getState().assetRecords[0]?.id).toBe('asset-1');
    expect(useEditorStore.getState().activeMode).toBe('write');
  });

  it('rolls back session, Writer, and editor state after an injected commit failure', async () => {
    const existingPdf = await blankPdfBytes();
    useSessionStore.getState().openDocument({
      documentKey: 'old-doc',
      fileName: 'old.pdf',
      bytes: existingPdf,
      pageCount: 1,
    });
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'old-doc',
      elements: [],
      persistedAt: '2026-01-01T00:00:00.000Z',
    });
    const beforeSession = useSessionStore.getState();
    const beforeWriter = useWriterV2Store.getState();
    const beforeEditor = useEditorStore.getState();

    const activeOperation = operation();
    const staged = await stageStandaloneWriterProject(await overlayFile(), activeOperation);
    await expect(commitStagedWriterProjectImport(staged, activeOperation, {
      afterSessionMutation: () => {
        throw new Error('injected commit failure');
      },
    })).rejects.toThrow('injected commit failure');

    expect(useSessionStore.getState()).toEqual(beforeSession);
    expect(useWriterV2Store.getState()).toEqual(beforeWriter);
    expect(useEditorStore.getState()).toEqual(beforeEditor);
  });

  it('rejects fabricated, revoked, consumed, and stale capabilities before mutation', async () => {
    const activeOperation = operation();
    const fabricated = Object.freeze({
      operationId: activeOperation.operationId,
      generation: activeOperation.generation,
      documentFingerprint: 'fake',
      documentMode: 'pdfOverlay' as const,
      evidence: Object.freeze({}) as StagedWriterProjectImport['evidence'],
    });
    await expect(commitStagedWriterProjectImport(fabricated, activeOperation)).rejects.toThrow('invalid');

    const revoked = await stageStandaloneWriterProject(await overlayFile(), activeOperation);
    revokeStagedWriterProjectImport(revoked);
    await expect(commitStagedWriterProjectImport(revoked, activeOperation)).rejects.toThrow('revoked');

    const consumed = await stageStandaloneWriterProject(await overlayFile(), activeOperation);
    await commitStagedWriterProjectImport(consumed, activeOperation);
    await expect(commitStagedWriterProjectImport(consumed, activeOperation)).rejects.toThrow('consumed');

    const staged = await stageStandaloneWriterProject(await overlayFile(), operation(3));
    await expect(commitStagedWriterProjectImport(staged, operation(2, false))).rejects.toThrow();
  });

  it('rejects invalid metadata and ZIP signatures without state mutation', async () => {
    const beforeSession = useSessionStore.getState();
    const beforeWriter = useWriterV2Store.getState();
    await expect(stageStandaloneWriterProject(
      new File(['not a zip'], 'project.txt', { type: 'text/plain' }),
      operation(),
    )).rejects.toThrow('not identified');
    await expect(stageStandaloneWriterProject(
      new File(['not a zip'], 'project.zip', { type: 'application/zip' }),
      operation(),
    )).rejects.toThrow('signature');
    expect(useSessionStore.getState()).toEqual(beforeSession);
    expect(useWriterV2Store.getState()).toEqual(beforeWriter);
  });
});
