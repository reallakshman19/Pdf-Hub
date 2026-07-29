import { describe, expect, it } from 'vitest';
import { createWriterImageAssetFromFile } from '../writerImageAsset';

const ONE_BY_ONE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('writerImageAsset', () => {
  it('creates image asset record from File', async () => {
    const bytes = Uint8Array.from(atob(ONE_BY_ONE_PNG), (char) => char.charCodeAt(0));
    const file = new File([bytes], 'sample.png', {
      type: 'image/png',
    });

    const asset = await createWriterImageAssetFromFile(
      file,
      'blank-image-doc',
      '2026-01-01T00:00:00.000Z',
    );

    expect(asset.id).toMatch(/^writer-image-|[0-9a-f-]{36}/i);
    expect(asset.documentFingerprint).toBe('blank-image-doc');
    expect(asset.kind).toBe('image');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.dataUrl.startsWith('data:image/png;')).toBe(true);
    expect(asset.width).toBe(1);
    expect(asset.height).toBe(1);
    expect(asset.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(asset.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects a file that is not a real image', async () => {
    const notAnImage = new File([new Uint8Array([1, 2, 3, 4])], 'sample.png', {
      type: 'image/png',
    });

    await expect(
      createWriterImageAssetFromFile(notAnImage, 'blank-image-doc'),
    ).rejects.toThrow(/PNG, JPEG, and WebP/i);
  });
});
