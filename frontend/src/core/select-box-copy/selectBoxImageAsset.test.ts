import { describe, expect, it } from 'vitest';
import { createSelectBoxImageAssetFromDataUrl } from './selectBoxImageAsset';

describe('selectBoxImageAsset', () => {
  it('creates image asset records from data URLs', () => {
    const asset = createSelectBoxImageAssetFromDataUrl({
      dataUrl: 'data:image/png;base64,AA==',
      documentFingerprint: 'doc-1',
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(asset.documentFingerprint).toBe('doc-1');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.kind).toBe('image');
    expect(asset.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects non-image data URLs', () => {
    expect(() => createSelectBoxImageAssetFromDataUrl({
      dataUrl: 'data:text/html;base64,AA==',
      documentFingerprint: 'doc-1',
    })).toThrow(/Unsupported/);
  });
});