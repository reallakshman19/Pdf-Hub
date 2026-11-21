import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';

const mocks = vi.hoisted(() => ({ load: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@/core/annotations/persistence', () => ({ loadAnnotationsOrNull: mocks.load, saveAnnotations: mocks.save }));
vi.mock('@/core/pdf-annotations/nativeAnnotationReader', () => ({ readNativePdfAnnotations: mocks.read }));
import { useAnnotationPersistence } from './useAnnotationPersistence';

const stamp = (kind: 'generated' | 'imported', hasAppearance: boolean): PdfAnnotation => ({
  id: 'native-stamp', type: 'stamp', pageNumber: 1, rect: { x: 10, y: 10, width: 80, height: 30 },
  data: { text: 'Example', nativeStampAppearanceKind: kind, hasCustomAppearance: hasAppearance,
    nativeSourceRef: '10 0 R' }, createdAt: 1, updatedAt: 1,
});

describe('native stamp sidecar hydration', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ documentKey: 'stamp-doc', workingBytes: bytes });
    useAnnotationStore.setState({ annotations: [], hydratedDocumentKey: null });
    mocks.save.mockResolvedValue(undefined);
  });
  afterEach(() => { useSessionStore.getState().clearDocument(); });

  it.each([true, false])('does not let a generated sidecar override an imported source (AP=%s)', async (hasAppearance) => {
    const stale = stamp('generated', true);
    stale.data.nativeStampRotationReadOnly = true;
    stale.data.nativeStampBasisRotation = 270;
    mocks.load.mockResolvedValue([stale]);
    mocks.read.mockResolvedValue({ annotations: [stamp('imported', hasAppearance)] });
    const setRestoredCount = vi.fn();
    const { unmount } = renderHook(() => useAnnotationPersistence({
      documentKey: 'stamp-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations,
      setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount,
    }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('stamp-doc'));
    const restored = useAnnotationStore.getState().annotations[0];
    expect(restored.data.nativeStampAppearanceKind).toBe('imported');
    expect(Boolean(restored.data.hasCustomAppearance)).toBe(hasAppearance);
    expect(Boolean(restored.data.nativeStampRotationReadOnly)).toBe(false);
    expect(restored.data.nativeStampBasisRotation).toBeUndefined();
    expect(restored.data.nativeSourceRef).toBe('10 0 R');
    unmount();
  });

  it('retains editability when the actual native source is verified generated', async () => {
    const stale = stamp('imported', true);
    stale.data.nativeStampBasisRotation = 270;
    const source = stamp('generated', true);
    source.data.nativeStampBasisRotation = 90;
    mocks.load.mockResolvedValue([stale]);
    mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = renderHook(() => useAnnotationPersistence({
      documentKey: 'stamp-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations,
      setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn(),
    }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('stamp-doc'));
    expect(useAnnotationStore.getState().annotations[0].data.nativeStampAppearanceKind).toBe('generated');
    expect(useAnnotationStore.getState().annotations[0].data.nativeStampBasisRotation).toBe(90);
    unmount();
  });

  it('retains the actual source rotation guard even if the sidecar omitted it', async () => {
    mocks.load.mockResolvedValue([stamp('generated', true)]);
    const source = stamp('imported', true);
    source.data.nativeStampRotationReadOnly = true;
    mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = renderHook(() => useAnnotationPersistence({
      documentKey: 'stamp-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations,
      setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn(),
    }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('stamp-doc'));
    expect(useAnnotationStore.getState().annotations[0].data.nativeStampRotationReadOnly).toBe(true);
    unmount();
  });

  it('derives a copied stamp basis from the verified source and target pages', async () => {
    useSessionStore.setState({ pageGraph: { pages: [
      { pageId: 'source', documentKey: 'stamp-doc', originalPageNumber: 1, currentIndex: 0, width: 400, height: 500, rotation: 180 },
      { pageId: 'target', documentKey: 'stamp-doc', originalPageNumber: 2, currentIndex: 1, width: 400, height: 500, rotation: 0 },
    ] } });
    const stale = { ...stamp('generated', true), id: 'copied-stamp', pageNumber: 2 };
    stale.data.nativeStampBasisRotation = 180;
    stale.data.nativeCopySource = { pageNumber: 1, nativeName: 'native-stamp' };
    const source = stamp('generated', true);
    source.data.nativeStampBasisRotation = 90;
    mocks.load.mockResolvedValue([stale]);
    mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = renderHook(() => useAnnotationPersistence({
      documentKey: 'stamp-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations,
      setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn(),
    }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('stamp-doc'));
    const restored = useAnnotationStore.getState().annotations[0];
    expect(restored.data.nativeStampBasisRotation).toBe(270);
    expect(restored.data.nativeStampCopySourceBasisRotation).toBe(90);
    unmount();
  });
});
