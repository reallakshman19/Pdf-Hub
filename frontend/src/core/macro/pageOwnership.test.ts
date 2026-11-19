import { describe, expect, it } from 'vitest';
import { createPageGraph } from '@/core/pages/pageGraph';
import type { PageGraph, PageNode } from '@/core/pages/types';
import type { PdfAnnotation } from '@/core/annotations/types';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { resolveMacroPageOwnership } from './pageOwnership';
import type { MacroPageLineageEntry } from './pageLineage';

const source = (): PageGraph<PageNode> => createPageGraph(
  ['A', 'B', 'C'].map((id, index) => ({
    pageId: `original-${id}`,
    documentKey: 'source-document',
    originalPageNumber: index + 1,
    currentIndex: index,
    width: 612,
    height: 792,
    rotation: 0 as const,
  })),
);
const output = (count: number): PageGraph<PageNode> => createPageGraph(
  Array.from({ length: count }, (_, i) => ({
    pageId: `rewritten-at-index-${i}`,
    documentKey: 'new-document',
    originalPageNumber: i + 1,
    currentIndex: i,
    width: 612,
    height: 792,
    rotation: 0 as const,
  })),
);
const original = (index: number): MacroPageLineageEntry => ({
  sourceIndex: index,
  instanceId: `source-${index}`,
});
const copy = (index: number, ordinal: number): MacroPageLineageEntry => ({
  sourceIndex: index,
  instanceId: `new-${ordinal}`,
});
const inserted = (ordinal: number): MacroPageLineageEntry => ({
  sourceIndex: null,
  instanceId: `new-${ordinal}`,
});
const annotation = (pageId = 'original-B'): PdfAnnotation => ({
  id: 'note-b',
  type: 'sticky-note',
  pageId,
  pageNumber: 2,
  rect: { x: 10, y: 20, width: 40, height: 30 },
  data: {} as PdfAnnotation['data'],
  createdAt: 100,
  updatedAt: 100,
} as PdfAnnotation);
const writer = (pageId = 'original-B'): WriterElementV2 => ({
  id: 'writer-b',
  documentFingerprint: 'source-document',
  pageId,
  pageIndex: 1,
  type: 'text',
  rect: { x: 5, y: 6, width: 60, height: 20 },
  style: { zIndex: 1 },
  plainText: 'Owned by B',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  locked: false,
  hidden: false,
} as WriterElementV2);

describe('WP07 canonical macro PageId ownership', () => {
  it('keeps note and Writer on source B after same-count C,A,B reorder', () => {
    const result = resolveMacroPageOwnership(
      source(), output(3),
      [original(2), original(0), original(1)],
      'macro-command-1',
      [annotation()], [writer()],
    );
    expect(result.graph.pages.map((p) => p.pageId)).toEqual([
      'original-C', 'original-A', 'original-B',
    ]);
    expect(result.annotations).toMatchObject([{
      id: 'note-b',
      pageId: 'original-B',
      pageNumber: 3,
    }]);
    expect(result.writerElements).toMatchObject([{
      id: 'writer-b',
      pageId: 'original-B',
      pageIndex: 2,
    }]);
    expect(result.annotations[0].pageNumber).not.toBe(2);
    expect(result.writerElements?.[0].pageIndex).not.toBe(1);
  });

  it('duplicates each original B overlay into unique B-copy owners', () => {
    const result = resolveMacroPageOwnership(
      source(), output(5),
      [original(0), original(1), copy(1, 1), copy(1, 2), original(2)],
      'macro-command-2',
      [annotation()], [writer()],
    );
    expect(result.annotations.map((a) => a.pageNumber)).toEqual([2, 3, 4]);
    expect(result.writerElements?.map((a) => a.pageIndex)).toEqual([1, 2, 3]);
    expect(new Set(result.annotations.map((a) => a.id)).size).toBe(3);
    expect(new Set(result.writerElements?.map((a) => a.id)).size).toBe(3);
    expect(result.annotations[1].pageId).not.toBe('original-B');
    expect(result.annotations[2].pageId).not.toBe(result.annotations[1].pageId);
  });

  it('removes deleted B ownership and never migrates its note to source C', () => {
    const result = resolveMacroPageOwnership(
      source(), output(2), [original(0), original(2)],
      'macro-command-3', [annotation()], [writer()],
    );
    expect(result.annotations).toEqual([]);
    expect(result.writerElements).toEqual([]);
    expect(result.graph.pages.map((p) => p.pageId)).toEqual(['original-A','original-C']);
  });

  it('drops overlays from replaced B and gives replacement no source owner', () => {
    const result = resolveMacroPageOwnership(
      source(), output(3), [original(0), inserted(1), original(2)],
      'macro-command-4', [annotation()], [writer()],
    );
    expect(result.annotations).toHaveLength(0);
    expect(result.writerElements).toHaveLength(0);
    expect(result.graph.pages[1].pageId).not.toBe('original-B');
    expect(result.graph.pages[1].originalPageNumber).toBe(0);
  });

  it('rejects incomplete, repeated and invalid source-lineage manifests', () => {
    const args = [source(), output(3), [original(0),original(1)], 'cmd', [], []] as const;
    expect(() => resolveMacroPageOwnership(...args)).toThrow(/complete output page-lineage/);
    expect(() => resolveMacroPageOwnership(
      source(),output(3),[original(0),original(1),original(1)],'cmd',[],[],
    )).toThrow(/repeated page instance/);
    expect(() => resolveMacroPageOwnership(
      source(),output(3),[original(0),original(1),{sourceIndex:9,instanceId:'new-1'}],'cmd',[],[],
    )).toThrow(/unknown source page/);
  });

  it('rejects stale annotation or Writer pageId rather than silently rebinding by index', () => {
    expect(() => resolveMacroPageOwnership(
      source(), output(3), [original(0),original(1),original(2)],
      'cmd',[annotation('stale-not-B')],[writer()],
    )).toThrow(/unresolved source PageId/);
    expect(() => resolveMacroPageOwnership(
      source(), output(3), [original(0),original(1),original(2)],
      'cmd',[],[writer('stale-not-B')],
    )).toThrow(/unresolved source PageId/);
  });
});
