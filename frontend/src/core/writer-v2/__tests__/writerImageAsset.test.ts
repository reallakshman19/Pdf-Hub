import { describe, expect, it } from 'vitest';
import { createWriterImageAssetFromFile } from '../writerImageAsset';

describe('writerImageAsset', () => {
  it('creates image asset record from File', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'sample.png', {
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
    expect(asset.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(asset.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
