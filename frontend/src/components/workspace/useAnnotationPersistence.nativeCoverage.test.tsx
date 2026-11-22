import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/core/annotations/persistence', () => ({
  loadAnnotationSnapshotOrNull: mocks.load,
  saveAnnotations: mocks.save,
}));
vi.mock('@/core/pdf-annotations/nativeAnnotationReader', () => ({
  readNativePdfAnnotations: mocks.read,
}));

import { useAnnotationPersistence } from './useAnnotationPersistence';

const bytes = new Uint8Array([10, 20, 30]);
const documentKey = 'sha256:engineering-markup';

const native = (id: string, ref: string, pageNumber = 1): PdfAnnotation => ({
  id,
  type: 'textbox',
  pageNumber,
  rect: { x: 10, y: 20, width: 80, height: 20 },
  data: {
    text: id,
    nativeSourceRef: ref,
    nativeInterop: { fidelityClass: 'NATIVE_PRESERVED_READ_ONLY', reason: 'RICH_TEXT', richText: true },
  },
  createdAt: 1,
  updatedAt: 1,
});

const key = (annotation: PdfAnnotation) => JSON.stringify([
  annotation.pageNumber, annotation.data.nativeSourceRef ?? annotation.id,
]);

function openHook() {
  return renderHook(() => useAnnotationPersistence({
    documentKey,
    workingBytes: bytes,
    pdfDoc: null,
    annotations: useAnnotationStore.getState().annotations,
    setAnnotations: useAnnotationStore.getState().setAnnotations,
    setRestoredCount: vi.fn(),
  }));
}

describe('native PDF annotation source coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ documentKey, workingBytes: bytes });
    useAnnotationStore.setState({
      annotations: [], hydratedDocumentKey: null,
      nativeIntegrity: { status: 'LOADING', documentKey: null },
      nativeDeletionTombstones: [],
    });
    mocks.save.mockResolvedValue(undefined);
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    useSessionStore.getState().clearDocument();
  });

  it('still imports PDF-native annotations when IndexedDB recovery is unavailable', async () => {
    const a = native('source-only', '10 0 R');
    mocks.load.mockRejectedValue(new Error('IndexedDB blocked'));
    mocks.read.mockResolvedValue({ annotations: [a] });

    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));
    expect(useAnnotationStore.getState().annotations).toEqual([a]);
    expect(useAnnotationStore.getState().nativeIntegrity).toMatchObject({
      status: 'INCOMPLETE', cacheState: 'UNAVAILABLE',
    });
    unmount();
  });

  it('alerts the user instead of silently pretending a failed import was flattened', async () => {
    mocks.load.mockResolvedValue(null);
    mocks.read.mockRejectedValue(new Error('Bad source annotation graph'));

    const { unmount } = openHook();
    await waitFor(() => expect(useToastStore.getState().toasts.some((toast) =>
      toast.title === 'Native annotations unavailable')).toBe(true));
    expect(useAnnotationStore.getState().hydratedDocumentKey).toBeNull();
    expect(useAnnotationStore.getState().nativeIntegrity.status).toBe('FAILED');
    unmount();
  });

  it('recovers all source annotations omitted by an incomplete legacy sidecar', async () => {
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    const c = native('c', '12 0 R');
    const local: PdfAnnotation = { ...native('local', '99 0 R'), data: { text: 'New overlay' } };
    mocks.load.mockResolvedValue({ annotations: [a, local], nativeSourceKeys: null });
    mocks.read.mockResolvedValue({ annotations: [a, b, c] });

    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));

    const hydrated = useAnnotationStore.getState().annotations;
    expect(hydrated.map((item) => item.id)).toEqual(['a', 'local', 'b', 'c']);
    expect(hydrated.find((item) => item.id === 'b')?.data.nativeSourceRef).toBe('11 0 R');
    expect(hydrated.find((item) => item.id === 'b')?.data.nativeInterop?.richText).toBe(true);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(
      documentKey,
      expect.arrayContaining([b, c]),
      { nativeSourceKeys: [key(a), key(b), key(c)], nativeDeletionTombstones: [] },
    ));
    unmount();
  });

  it('recovers missing native entries even if a legacy sidecar knew their IDs', async () => {
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    mocks.load.mockResolvedValue({
      annotations: [a],
      nativeSourceKeys: [key(a), key(b)],
    });
    mocks.read.mockResolvedValue({ annotations: [a, b] });

    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));

    expect(useAnnotationStore.getState().annotations.map((item) => item.id)).toEqual(['a', 'b']);
    expect(useAnnotationStore.getState().nativeIntegrity.status).toBe('COMPLETE');
    unmount();
  });

  it('honors a matching explicit deletion tombstone and preserves the command after refresh', async () => {
    useSessionStore.setState({
      pageGraph: {
        pages: [{
          pageId: 'page-original', documentKey,
          originalPageNumber: 1, currentIndex: 0,
          width: 300, height: 400, rotation: 0,
        }],
      },
    });
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    const tombstone = {
      sourceRevision: documentKey,
      sourceRef: '11 0 R', sourceName: 'b',
      pageNumber: 1, pageId: 'page-original',
      commandId: 'explicit-user-delete',
    };
    mocks.load.mockResolvedValue({
      annotations: [a],
      nativeSourceKeys: [key(a), key(b)],
      nativeDeletionTombstones: [tombstone],
    });
    mocks.read.mockResolvedValue({ annotations: [a, b] });
    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));
    const state = useAnnotationStore.getState();
    expect(state.annotations.map((item) => item.id)).toEqual(['a']);
    expect(state.nativeDeletionTombstones).toEqual([tombstone]);
    expect(state.nativeIntegrity.status).toBe('COMPLETE');
    unmount();
  });

  it('restores the source and blocks native Save on a stale deletion command', async () => {
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    mocks.load.mockResolvedValue({
      annotations: [a],
      nativeSourceKeys: [key(a), key(b)],
      nativeDeletionTombstones: [{
        sourceRevision: 'sha256:wrong-revision',
        sourceRef: '11 0 R', sourceName: 'b',
        pageNumber: 1, pageId: 'stale-page',
        commandId: 'explicit-user-delete',
      }],
    });
    mocks.read.mockResolvedValue({ annotations: [a, b] });
    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));
    expect(useAnnotationStore.getState().annotations.map((item) => item.id)).toEqual(['a', 'b']);
    expect(useAnnotationStore.getState().nativeIntegrity.status).toBe('INCOMPLETE');
    expect(useAnnotationStore.getState().nativeDeletionTombstones).toEqual([]);
    unmount();
  });

  it('imports a new native object when the previous baseline did not include it', async () => {
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    mocks.load.mockResolvedValue({ annotations: [a], nativeSourceKeys: [key(a)] });
    mocks.read.mockResolvedValue({ annotations: [a, b] });

    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));

    expect(useAnnotationStore.getState().annotations.map((item) => item.id)).toEqual(['a', 'b']);
    unmount();
  });

  it('preserves only explicitly edited callout fields across hydration and refresh', async () => {
    const source = {
      ...native('callout', '10 0 R'),
      type: 'callout' as const,
      data: {
        ...native('callout', '10 0 R').data,
        anchor: { x: 12, y: 15 },
        knee: { x: 20, y: 24 },
        leaderStyle: 'elbow' as const,
        text: 'Source text',
      },
    };
    const stored: PdfAnnotation = {
      ...source,
      rect: { ...source.rect, x: 80, y: 95 },
      data: {
        ...source.data,
        text: 'User edited',
        anchor: { x: 35, y: 50 },
        knee: { x: 40, y: 50 },
        nativeEditProvenance: {
          sourceRevision: documentKey,
          sourceRef: '10 0 R',
          commandId: 'edit-command',
          fields: ['rect', 'text', 'anchor', 'knee'],
        },
      },
    };
    mocks.load.mockResolvedValue({
      annotations: [stored], nativeSourceKeys: [key(source)],
      nativeDeletionTombstones: [],
    });
    mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));
    const recovered = useAnnotationStore.getState().annotations[0];
    expect(recovered.rect).toEqual(stored.rect);
    expect(recovered.data.text).toBe('User edited');
    expect(recovered.data.anchor).toEqual({ x: 35, y: 50 });
    expect(recovered.data.knee).toEqual({ x: 40, y: 50 });
    expect(recovered.data.leaderStyle).toBe('elbow');
    expect(useAnnotationStore.getState().nativeIntegrity.status).toBe('COMPLETE');
    unmount();
  });

  it('rejects stale edit provenance and restores the authoritative PDF values', async () => {
    const source = native('source', '10 0 R');
    const stored: PdfAnnotation = {
      ...source,
      rect: { ...source.rect, x: 90 },
      data: {
        ...source.data,
        text: 'Cache data',
        nativeEditProvenance: {
          sourceRevision: 'sha256:wrong-source',
          sourceRef: '10 0 R', commandId: 'edit',
          fields: ['text', 'rect'],
        },
      },
    };
    mocks.load.mockResolvedValue({ annotations: [stored] });
    mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));
    const result = useAnnotationStore.getState().annotations[0];
    expect(result.rect).toEqual(source.rect);
    expect(result.data.text).toBe(source.data.text);
    expect(result.data.nativeEditProvenance).toBeUndefined();
    expect(useAnnotationStore.getState().nativeIntegrity.status).toBe('INCOMPLETE');
    expect(mocks.save).not.toHaveBeenCalled();
    unmount();
  });

  it('marks supported parser omissions INCOMPLETE instead of allowing Save', async () => {
    const a = native('a', '10 0 R');
    mocks.load.mockResolvedValue(null);
    mocks.read.mockResolvedValue({
      annotations: [a],
      sourceRoots: [
        { pageNumber: 1, sourceRef: '10 0 R', subtype: 'Text', visible: true,
          supported: true, hasAppearance: true, parsedId: 'a' },
        { pageNumber: 1, sourceRef: '11 0 R', subtype: 'FreeText', visible: true,
          supported: true, hasAppearance: true },
      ],
    });
    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));
    expect(useAnnotationStore.getState().nativeIntegrity.status).toBe('INCOMPLETE');
    unmount();
  });

  it('keeps the native source when the sidecar contains only a copy of it', async () => {
    const a = native('native-original', '10 0 R');
    const copy: PdfAnnotation = {
      ...native('copied-overlay', '10 0 R', 2),
      data: {
        text: 'Copied overlay',
        nativeCopySource: { pageNumber: 1, nativeName: a.id },
      },
    };
    mocks.load.mockResolvedValue({ annotations: [copy], nativeSourceKeys: null });
    mocks.read.mockResolvedValue({ annotations: [a] });

    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));

    expect(useAnnotationStore.getState().annotations.map((item) => item.id)).toEqual(['copied-overlay', 'native-original']);
    unmount();
  });

  it('matches a source by native reference even if a saved overlay ID changed', async () => {
    const a = native('original', '10 0 R');
    const stored = { ...a, id: 'renamed-by-sidecar' };
    mocks.load.mockResolvedValue({ annotations: [stored], nativeSourceKeys: null });
    mocks.read.mockResolvedValue({ annotations: [a] });

    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));

    expect(useAnnotationStore.getState().annotations).toHaveLength(1);
    expect(useAnnotationStore.getState().annotations[0].id).toBe('renamed-by-sidecar');
    unmount();
  });
});
