import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { rotateBoxShapeQuarterTurn } from '@/core/annotations/geometryTransform';
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

const shape = (hash?: string): PdfAnnotation => ({ id: 'native-shape', type: 'shape-rect', pageNumber: 1,
  rect: { x: 10, y: 10, width: 80, height: 30 }, data: { nativeBoxShapeImported: true,
    ...(hash ? { nativeBoxShapeSourceHash: hash } : {}), nativeSourceRef: '10 0 R' }, createdAt: 1, updatedAt: 1 });

describe('native shape sidecar source binding', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  beforeEach(() => { vi.clearAllMocks(); useSessionStore.setState({ documentKey: 'shape-doc', workingBytes: bytes });
    useAnnotationStore.setState({ annotations: [], hydratedDocumentKey: null }); mocks.save.mockResolvedValue(undefined); });
  afterEach(() => { useSessionStore.getState().clearDocument(); });
  it.each(['fresh-source-hash', undefined])('never trusts a stale sidecar hash when source hash is %s', async (sourceHash) => {
    const stale = shape('old-sidecar-hash');
    stale.data.nativeBoxShapeTurn = { turns: 1, sourceHash: 'old-sidecar-hash' };
    stale.data.nativeBoxShapeGenerated = true;
    stale.data.nativeBoxShapeGeneratedOrientation = 3;
    mocks.load.mockResolvedValue([stale]); mocks.read.mockResolvedValue({ annotations: [shape(sourceHash)] });
    const { unmount } = renderHook(() => useAnnotationPersistence({ documentKey: 'shape-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations, setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn() }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('shape-doc'));
    const restored = useAnnotationStore.getState().annotations[0];
    expect(restored.data.nativeBoxShapeImported).toBe(true);
    expect(restored.data.nativeBoxShapeSourceHash).toBe(sourceHash);
    expect(restored.data.nativeBoxShapeTurn?.sourceHash).toBe('old-sidecar-hash');
    expect(restored.data.nativeBoxShapeGenerated).toBeUndefined();
    expect(restored.data.nativeBoxShapeGeneratedOrientation).toBeUndefined();
    expect(rotateBoxShapeQuarterTurn(restored)).toBeNull();
    unmount();
  });
  it('takes generated classification and orientation from the verified source, not the sidecar', async () => {
    const stale = shape('old-sidecar-hash'); stale.data.nativeBoxShapeGeneratedOrientation = 3;
    const source = shape('verified-source-hash'); source.data.nativeBoxShapeGenerated = true;
    source.data.nativeBoxShapeGeneratedOrientation = 1;
    mocks.load.mockResolvedValue([stale]); mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = renderHook(() => useAnnotationPersistence({ documentKey: 'shape-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations, setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn() }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('shape-doc'));
    const restored = useAnnotationStore.getState().annotations[0];
    expect(restored.data.nativeBoxShapeGenerated).toBe(true);
    expect(restored.data.nativeBoxShapeGeneratedOrientation).toBe(1);
    unmount();
  });
  it.each(['fresh-cloud-hash', undefined])('rebinds a recovered cloud turn to actual source hash %s', async (sourceHash) => {
    const stale = { ...shape('old-cloud-hash'), type: 'shape-cloud' as const };
    stale.data.nativeBoxShapeHasAppearance = true;
    stale.data.nativeBoxShapeTurn = { turns: 1, sourceHash: 'old-cloud-hash' };
    const source = { ...shape(sourceHash), type: 'shape-cloud' as const };
    source.data.nativeBoxShapeHasAppearance = Boolean(sourceHash);
    mocks.load.mockResolvedValue([stale]); mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = renderHook(() => useAnnotationPersistence({ documentKey: 'shape-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations, setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn() }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('shape-doc'));
    const restored = useAnnotationStore.getState().annotations[0];
    expect(restored.data.nativeBoxShapeSourceHash).toBe(sourceHash);
    expect(restored.data.nativeBoxShapeTurn?.sourceHash).toBe('old-cloud-hash');
    expect(rotateBoxShapeQuarterTurn(restored)).toBeNull();
    unmount();
  });

  it.each(['verified-markup', undefined])('restores markup preview orientation only from its native source %s', async (sourceHash) => {
    const stale: PdfAnnotation = { ...shape(), type: 'underline', data: { nativeMarkupRotationSourceHash: 'old',
      nativeMarkupPreviewOffset: 3, nativeMarkupTurn: { turns: 1, sourceHash: 'old' } } };
    const source: PdfAnnotation = { ...shape(), type: 'underline', data: sourceHash
      ? { nativeMarkupRotationSourceHash: sourceHash, nativeMarkupPreviewOffset: 2 } : {} };
    mocks.load.mockResolvedValue([stale]); mocks.read.mockResolvedValue({ annotations: [source] });
    const { unmount } = renderHook(() => useAnnotationPersistence({ documentKey: 'shape-doc', workingBytes: bytes, pdfDoc: null,
      annotations: useAnnotationStore.getState().annotations, setAnnotations: useAnnotationStore.getState().setAnnotations, setRestoredCount: vi.fn() }));
    await waitFor(() => expect(useAnnotationStore.getState().hydratedDocumentKey).toBe('shape-doc'));
    const restored = useAnnotationStore.getState().annotations[0];
    expect(restored.data.nativeMarkupRotationSourceHash).toBe(sourceHash);
    expect(restored.data.nativeMarkupPreviewOffset).toBe(sourceHash ? 2 : undefined);
    expect(restored.data.nativeMarkupTurn?.sourceHash).toBe('old');
    unmount();
  });
});
