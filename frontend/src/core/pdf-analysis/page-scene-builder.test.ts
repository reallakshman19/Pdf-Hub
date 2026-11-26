import { describe, expect, it } from 'vitest';
import { buildPageSceneFromTextLayer, pageSceneCacheKey } from './page-scene-builder';

describe('core/pdf-analysis/page-scene-builder', () => {
  it('builds obstacles from non-empty text items and marks protected title block', () => {
    const scene = buildPageSceneFromTextLayer(
      2,
      842,
      595,
      [
        { id: 't1', text: 'VALVE-01', x: 10, y: 20, width: 40, height: 12, fontSize: 10 },
        { id: 't2', text: '   ', x: 50, y: 20, width: 10, height: 12, fontSize: 10 },
      ],
      { x: 600, y: 500, width: 240, height: 90 },
    );

    expect(scene.pageNumber).toBe(2);
    expect(scene.pageBounds).toEqual({ x: 0, y: 0, width: 842, height: 595 });
    expect(scene.obstacles).toHaveLength(2);
    expect(scene.obstacles[0]).toMatchObject({ id: 't1', kind: 'text', penaltyWeight: 35 });
    expect(scene.obstacles[1]).toMatchObject({ id: 'title-block-protected', kind: 'title-block', penaltyWeight: Infinity });
    expect(scene.protectedRegions).toHaveLength(1);
    expect(scene.protectedRegions[0].id).toBe('title-block');
  });

  it('builds stable cache keys by document hash, page, and analyzer version', () => {
    expect(pageSceneCacheKey('abc123', 4)).toBe('abc123:4:v1');
  });
});
