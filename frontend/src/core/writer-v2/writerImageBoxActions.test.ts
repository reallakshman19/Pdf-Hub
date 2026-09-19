import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import { clearActiveImageBoxAsset, replaceActiveImageBoxAsset } from './writerImageBoxActions';

const ONE_BY_ONE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function pngFile(name = 'photo.png'): File {
  const bytes = Uint8Array.from(atob(ONE_BY_ONE_PNG), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

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

  it('replaces an active image asset through the shared admission boundary', async () => {
    const result = await replaceActiveImageBoxAsset(pngFile());

    expect(result.changed).toBe(true);
    const element = useWriterV2Store.getState().elements[0];
    expect(element.imageAssetId).toBeDefined();
    const asset = useWriterV2Store.getState().assetRecords.find((a) => a.id === element.imageAssetId);
    expect(asset?.width).toBe(1);
    expect(asset?.height).toBe(1);
  });

  it('removes the admitted asset when durable Writer dispatch fails', async () => {
    const store = useWriterV2Store.getState();
    const beforeAssets = [...store.assetRecords];
    const beforeDirty = store.dirty;

    const dispatchSpy = vi
      .spyOn(
        useWriterV2Store.getState(),
        'dispatchWriterCommandDurable',
      )
      .mockRejectedValueOnce(
        new Error('journal write failed'),
      );

    const result =
      await replaceActiveImageBoxAsset(
        pngFile('failed.png'),
      );

    expect(result).toEqual({
      changed: false,
      message: 'journal write failed',
    });
    expect(
      useWriterV2Store.getState().assetRecords,
    ).toEqual(beforeAssets);
    expect(
      useWriterV2Store.getState().dirty,
    ).toBe(beforeDirty);

    dispatchSpy.mockRestore();
  });

  it('rejects a file that is not a real image without touching the element', async () => {
    const notAnImage = new File(['plain text'], 'fake.png', { type: 'image/png' });
    const before = useWriterV2Store.getState().elements[0].imageAssetId;

    const result = await replaceActiveImageBoxAsset(notAnImage);

    expect(result.changed).toBe(false);
    expect(useWriterV2Store.getState().elements[0].imageAssetId).toBe(before);
  });
});
