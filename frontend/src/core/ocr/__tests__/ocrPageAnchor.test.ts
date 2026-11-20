import { describe, expect, it } from 'vitest';

import {
  createPageGraph,
  duplicatePagesInGraph,
  removePagesFromGraph,
  rotatePagesInGraph,
} from '../../pages/pageGraph';
import type { PageGraph, PageNode } from '../../pages/types';
import type { OcrPageAnchoredState } from '../ocrPageAnchor';
import {
  normalizeOcrPageAnchoredState,
  reanchorOcrPageStateAfterPageGraphChange,
  rekeyOcrPageAnchoredState,
  transformRectForRotation,
} from '../ocrPageAnchor';

function graph(ids: string[]): PageGraph<PageNode> {
  return createPageGraph(ids.map((pageId, index) => ({
    pageId,
    documentKey: 'doc',
    originalPageNumber: index + 1,
    currentIndex: index,
    width: 600,
    height: 800,
    rotation: 0 as const,
  })));
}

function state(pageIndex = 0): OcrPageAnchoredState {
  return {
    documentFingerprint: 'doc',
    result: {
      documentFingerprint: 'doc',
      createdAt: '2026-09-18T00:00:00.000Z',
      engineId: 'test',
      profileId: 'clean-scan',
      pages: [{
        status: 'success',
        pageIndex,
        pageNumber: pageIndex + 1,
        width: 600,
        height: 800,
        words: [{
          id: 'word-1',
          pageIndex,
          text: 'Valve',
          normalizedText: 'valve',
          confidence: 0.9,
          bbox: { x: 100, y: 200, width: 50, height: 20 },
        }],
        lines: [],
        blocks: [],
        diagnostics: [],
      }],
      diagnostics: [],
    },
    corrections: [{
      id: 'correction-1',
      documentFingerprint: 'doc',
      pageIndex,
      targetId: 'word-1',
      targetType: 'word',
      originalText: 'Valve',
      correctedText: 'VALVE',
      bbox: { x: 100, y: 200, width: 50, height: 20 },
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    }],
    regions: [{
      id: 'region-1',
      documentFingerprint: 'doc',
      pageIndex,
      bbox: { x: 80, y: 180, width: 120, height: 60 },
      mode: 'text',
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    }],
    selectedPageIndexes: [pageIndex],
    reviewFocus: {
      documentFingerprint: 'doc',
      pageIndex,
      bbox: { x: 100, y: 200, width: 50, height: 20 },
      targetId: 'word-1',
      source: 'lowConfidence',
      requestedAt: 1,
    },
  };
}

describe('OCR PageId anchors', () => {
  it('upgrades legacy pageIndex-only OCR state to PageId', () => {
    const anchored = normalizeOcrPageAnchoredState(
      state(1),
      graph(['p1', 'p2', 'p3']),
    );

    expect(anchored.result?.pages[0]).toMatchObject({
      pageId: 'p2',
      pageIndex: 1,
      pageNumber: 2,
    });
    expect(anchored.result?.pages[0]?.words?.[0]).toMatchObject({
      pageId: 'p2',
      pageIndex: 1,
    });
    expect(anchored.corrections[0]).toMatchObject({
      pageId: 'p2',
      pageIndex: 1,
    });
    expect(anchored.regions[0]).toMatchObject({
      pageId: 'p2',
      pageIndex: 1,
    });
    expect(anchored.reviewFocus).toMatchObject({
      pageId: 'p2',
      pageIndex: 1,
    });
  });

  it('drops an explicit stale PageId instead of rebinding by physical index', () => {
    const stale = state(0);
    stale.regions = [{ ...stale.regions[0], pageId: 'deleted-page' }];
    stale.corrections = [{ ...stale.corrections[0], pageId: 'deleted-page' }];
    stale.reviewFocus = { ...stale.reviewFocus!, pageId: 'deleted-page' };
    stale.result!.pages = [{ ...stale.result!.pages[0], pageId: 'deleted-page' }];

    const normalized = normalizeOcrPageAnchoredState(stale, graph(['replacement', 'survivor']));
    expect(normalized.regions).toEqual([]);
    expect(normalized.corrections).toEqual([]);
    expect(normalized.reviewFocus).toBeNull();
    expect(normalized.result?.pages).toEqual([]);

    // A truly legacy record with no PageId may still be upgraded by index.
    const legacy = normalizeOcrPageAnchoredState(state(0), graph(['replacement']));
    expect(legacy.regions[0].pageId).toBe('replacement');
  });

  it('derives physical pageIndex from stable PageId after reorder', () => {
    const before = graph(['p1', 'p2', 'p3']);
    const after = graph(['p3', 'p2', 'p1']);

    const remapped = reanchorOcrPageStateAfterPageGraphChange(
      normalizeOcrPageAnchoredState(state(0), before),
      before,
      after,
    );

    expect(remapped.result?.pages[0]).toMatchObject({
      pageId: 'p1',
      pageIndex: 2,
      pageNumber: 3,
    });
    expect(remapped.corrections[0]).toMatchObject({
      pageId: 'p1',
      pageIndex: 2,
    });
    expect(remapped.selectedPageIndexes).toEqual([2]);
    expect(remapped.reviewFocus).toMatchObject({
      pageId: 'p1',
      pageIndex: 2,
    });
  });

  it('drops OCR state when its PageId is deleted', () => {
    const before = graph(['p1', 'p2']);
    const after = removePagesFromGraph(before, ['p1']);

    const remapped = reanchorOcrPageStateAfterPageGraphChange(
      normalizeOcrPageAnchoredState(state(0), before),
      before,
      after,
    );

    expect(remapped.result?.pages).toEqual([]);
    expect(remapped.corrections).toEqual([]);
    expect(remapped.regions).toEqual([]);
    expect(remapped.selectedPageIndexes).toEqual([]);
    expect(remapped.reviewFocus).toBeNull();
  });

  it('rotates bottom-left OCR geometry with the page rotation delta', () => {
    const before = graph(['p1']);
    const after = rotatePagesInGraph(before, ['p1'], 90);

    const remapped = reanchorOcrPageStateAfterPageGraphChange(
      normalizeOcrPageAnchoredState(state(0), before),
      before,
      after,
    );

    expect(remapped.result?.pages[0]).toMatchObject({
      pageId: 'p1',
      pageIndex: 0,
      width: 800,
      height: 600,
    });
    expect(remapped.result?.pages[0]?.words?.[0].bbox).toEqual({
      x: 200,
      y: 450,
      width: 20,
      height: 50,
    });
    expect(remapped.corrections[0].bbox).toEqual({
      x: 200,
      y: 450,
      width: 20,
      height: 50,
    });
    expect(remapped.regions[0].bbox).toEqual({
      x: 180,
      y: 400,
      width: 60,
      height: 120,
    });
  });

  it('does not double-rotate native PDF-space OCR words, regions, corrections or focus', () => {
    const before = graph(['p1']);
    const native = state(0);
    native.result!.pages[0].geometryProvenance = 'pdf-user-space-v2';
    native.regions[0].geometryProvenance = 'pdf-user-space-v2';
    const after = rotatePagesInGraph(before, ['p1'], 90);

    const remapped = reanchorOcrPageStateAfterPageGraphChange(
      normalizeOcrPageAnchoredState(native, before),
      before,
      after,
    );

    expect(remapped.result?.pages[0]).toMatchObject({
      pageId: 'p1', pageIndex: 0, width: 600, height: 800,
      geometryProvenance: 'pdf-user-space-v2',
    });
    expect(remapped.result?.pages[0]?.words?.[0].bbox).toEqual({
      x: 100, y: 200, width: 50, height: 20,
    });
    expect(remapped.regions[0].bbox).toEqual({
      x: 80, y: 180, width: 120, height: 60,
    });
    expect(remapped.corrections[0].bbox).toEqual({
      x: 100, y: 200, width: 50, height: 20,
    });
    expect(remapped.reviewFocus?.bbox).toEqual({
      x: 100, y: 200, width: 50, height: 20,
    });
    // Existing untagged coordinates retain the historical rotation rule,
    // never silently upgraded to the verified native-space convention.
    const legacy = reanchorOcrPageStateAfterPageGraphChange(
      normalizeOcrPageAnchoredState(state(0), before),
      before,
      after,
    );
    expect(legacy.result?.pages[0]?.words?.[0].bbox.x).toBe(200);
    expect(legacy.regions[0].geometryProvenance).toBeUndefined();
  });

  it('invalidates OCR when page content is replaced despite PageId surviving', () => {
    const before = graph(['p1', 'p2']);
    const after = graph(['p1', 'p2']);

    const remapped = reanchorOcrPageStateAfterPageGraphChange(
      normalizeOcrPageAnchoredState(state(0), before),
      before,
      after,
      { dropPageIds: ['p1'] },
    );

    expect(remapped.result?.pages).toEqual([]);
    expect(remapped.corrections).toEqual([]);
    expect(remapped.regions).toEqual([]);
  });

  it('treats a duplicated page as unprocessed instead of cloning OCR target IDs', () => {
    const before = graph(['p1', 'p2']);
    const after = duplicatePagesInGraph(
      before,
      ['p1'],
      () => 'p1-copy',
    );

    const remapped = reanchorOcrPageStateAfterPageGraphChange(
      normalizeOcrPageAnchoredState(state(0), before),
      before,
      after,
    );

    expect(remapped.result?.pages).toHaveLength(1);
    expect(remapped.result?.pages[0]).toMatchObject({
      pageId: 'p1',
      pageIndex: 0,
    });
    expect(
      remapped.result?.pages.some((page) => page.pageId === 'p1-copy'),
    ).toBe(false);
  });

  it('rejects silent same-index ownership replacement after all original PageIds vanish', () => {
    const anchored = normalizeOcrPageAnchoredState(
      state(1),
      graph(['old-1', 'old-2']),
    );
    expect(anchored.result?.pages[0].pageId).toBe('old-2');

    const replacement = normalizeOcrPageAnchoredState(
      anchored,
      graph(['new-1', 'new-2']),
    );

    // Opaque equal-page-count output is NOT identity evidence: it could be a
    // completely different document with similar pagination.
    expect(replacement.result?.pages).toEqual([]);
    expect(replacement.corrections).toEqual([]);
    expect(replacement.regions).toEqual([]);
    expect(replacement.reviewFocus).toBeNull();
  });

  it('rekeys OCR state to the committed document revision', () => {
    const rekeyed = rekeyOcrPageAnchoredState(
      normalizeOcrPageAnchoredState(state(0), graph(['p1'])),
      'doc-after',
    );

    expect(rekeyed.documentFingerprint).toBe('doc-after');
    expect(rekeyed.result?.documentFingerprint).toBe('doc-after');
    expect(rekeyed.corrections[0].documentFingerprint).toBe('doc-after');
    expect(rekeyed.regions[0].documentFingerprint).toBe('doc-after');
    expect(rekeyed.reviewFocus?.documentFingerprint).toBe('doc-after');
  });

  it('rotates arbitrary rectangles in PDF bottom-left coordinates', () => {
    expect(
      transformRectForRotation(
        { x: 100, y: 200, width: 50, height: 20 },
        600,
        800,
        270,
      ),
    ).toEqual({
      x: 580,
      y: 100,
      width: 20,
      height: 50,
    });
  });
});
