import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';

const mocks = vi.hoisted(() => ({ load: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@/core/annotations/persistence', () => ({
  loadAnnotationSnapshotOrNull: async (key: string) => {
    const annotations = await mocks.load(key);
    return annotations === null ? null : { annotations, nativeSourceKeys: null };
  },
  saveAnnotations: mocks.save,
}));
vi.mock('@/core/pdf-annotations/nativeAnnotationReader', () => ({ readNativePdfAnnotations: mocks.read }));
import { useAnnotationPersistence } from './useAnnotationPersistence';

const item = (): PdfAnnotation => ({ id: 'native-under', type: 'underline', pageNumber: 1,
  rect: { x: 10, y: 10, width: 20, height: 8 }, data: {}, createdAt: 1, updatedAt: 1 });

describe('narrow markup provenance hydration', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  beforeEach(() => { vi.clearAllMocks(); useSessionStore.setState({ documentKey: 'narrow-doc', workingBytes: bytes });
    useAnnotationStore.setState({ annotations: [], hydratedDocumentKey: null }); mocks.save.mockResolvedValue(undefined); });
  afterEach(() => { useSessionStore.getState().clearDocument(); });

  it.each([true, false])('takes generated classification from source (%s) and never sidecar', async (verified) => {
    const stored = item(); stored.data.nativeMarkupGeneratedAppearance = !verified;
    const source = item(); source.data.nativeMarkupRotationSourceHash = 'native-hash';
    if (verified) source.data.nativeMarkupGeneratedAppearance = true;
    mocks.load.mockResolvedValue([stored]); mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = renderHook(() => useAnnotationPersistence({ documentKey: 'narrow-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations, setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn() }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('narrow-doc'));
    expect(useAnnotationStore.getState().annotations[0].data.nativeMarkupGeneratedAppearance).toBe(verified ? true : undefined);
    unmount();
  });

  it('does not trust the sidecar classification if no native source exists', async () => {
    const stored = item(); stored.data.nativeMarkupGeneratedAppearance = true; stored.data.nativeMarkupRotationSourceHash = 'forged';
    mocks.load.mockResolvedValue([stored]); mocks.read.mockResolvedValue({ annotations: [] });
    const { unmount } = renderHook(() => useAnnotationPersistence({ documentKey: 'narrow-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations, setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn() }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('narrow-doc'));
    expect(useAnnotationStore.getState().annotations[0].data.nativeMarkupGeneratedAppearance).toBeUndefined();
    expect(useAnnotationStore.getState().annotations[0].data.nativeMarkupRotationSourceHash).toBeUndefined();
    unmount();
  });
});
