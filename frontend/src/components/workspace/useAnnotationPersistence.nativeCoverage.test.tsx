import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';

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
    useAnnotationStore.setState({ annotations: [], hydratedDocumentKey: null });
    mocks.save.mockResolvedValue(undefined);
  });

  afterEach(() => {
    useSessionStore.getState().clearDocument();
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
      { nativeSourceKeys: [key(a), key(b), key(c)] },
    ));
    unmount();
  });

  it('does not resurrect an intentionally deleted source annotation', async () => {
    const a = native('a', '10 0 R');
    const b = native('b', '11 0 R');
    mocks.load.mockResolvedValue({
      annotations: [a],
      nativeSourceKeys: [key(a), key(b)],
    });
    mocks.read.mockResolvedValue({ annotations: [a, b] });

    const { unmount } = openHook();
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe(documentKey));

    expect(useAnnotationStore.getState().annotations.map((item) => item.id)).toEqual(['a']);
    expect(mocks.save).toHaveBeenCalledWith(documentKey, [a], {
      nativeSourceKeys: [key(a), key(b)],
    });
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
