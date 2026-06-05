import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import { clearActiveImageBoxAsset } from './writerImageBoxActions';

function imageElement(): WriterElementV2 {
  return {
    id: 'image-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'imageBox',
    rect: { x: 10, y: 20, width: 120, height: 90 },
    plainText: 'Image',
    imageAssetId: 'asset-1',
    assetIds: ['asset-1'],
    style: {
      zIndex: 1,
      backgroundColor: 'transparent',
      borderColor: '#94a3b8',
      borderWidth: 1,
      padding: 0,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

describe('writerImageBoxActions', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [imageElement()],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'image-1',
    });
  });

  it('clears an active image asset', () => {
    const result = clearActiveImageBoxAsset();

    expect(result.changed).toBe(true);
    expect(useWriterV2Store.getState().elements[0].imageAssetId).toBeUndefined();
    expect(useWriterV2Store.getState().elements[0].assetIds).toEqual([]);
  });
});
