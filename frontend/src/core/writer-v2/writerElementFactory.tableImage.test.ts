import { describe, expect, it } from 'vitest';
import {
  createImageBoxElement,
  createTableBoxElement,
} from './writerElementFactory';

describe('writerElementFactory table/image objects', () => {
  it('creates a tableBox with tableData', () => {
    const element = createTableBoxElement({
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      rect: { x: 10, y: 20, width: 300, height: 150 },
      zIndex: 5,
    });

    expect(element.type).toBe('tableBox');
    expect(element.tableData?.columns).toHaveLength(3);
    expect(element.tableData?.rows).toHaveLength(2);
    expect(element.style.zIndex).toBe(5);
  });

  it('creates an imageBox with asset references', () => {
    const element = createImageBoxElement({
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      rect: { x: 10, y: 20, width: 120, height: 90 },
      imageAssetId: 'asset-1',
      zIndex: 8,
    });

    expect(element.type).toBe('imageBox');
    expect(element.imageAssetId).toBe('asset-1');
    expect(element.assetIds).toEqual(['asset-1']);
    expect(element.style.zIndex).toBe(8);
  });
});
