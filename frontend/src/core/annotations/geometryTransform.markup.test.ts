import { describe, expect, it } from 'vitest';
import type { PdfAnnotation } from './types';
import { rotateMarkupQuarterTurn } from './geometryTransform';
import { useAnnotationStore } from './store';
import { useSessionStore } from '../session/store';
import { useHistoryStore } from '../document-history/store';

const item = (type: PdfAnnotation['type'] = 'underline'): PdfAnnotation => ({
  id: 'synthetic', type, pageNumber: 1, rect: { x: 20, y: 30, width: 100, height: 40 },
  createdAt: 1, updatedAt: 2,
  data: { nativeMarkupRotationSourceHash: 'source-hash', textMarkupQuads: [0, 0, 0.8, 0, 0, 0.25, 0.8, 0.25,
    0.1, 0.5, 0.7, 0.5, 0.7, 0.75, 0.1, 0.75], text: 'comment', geometryVersion: 2, normalizedGeometry: {} },
} as PdfAnnotation);

function turn(value: PdfAnnotation): PdfAnnotation {
  const patch = rotateMarkupQuarterTurn(value);
  if (!patch) throw new Error('Expected rotation to be available');
  return { ...value, ...patch };
}

describe('native text markup rotation geometry', () => {
  it.each(['highlight', 'underline', 'strikeout', 'squiggly'] as const)(
    'turns every ordered %s quad around its Rect center and restores it after four turns', (type) => {
      const original = item(type); const once = turn(original);
      expect(once.rect).toEqual({ x: 50, y: 0, width: 40, height: 100 });
      expect(once.data.textMarkupQuads).toEqual([1, 0, 1, 0.8, 0.75, 0, 0.75, 0.8,
        0.5, 0.1, 0.5, 0.7, 0.25, 0.7, 0.25, 0.1]);
      expect(once.data.nativeMarkupTurn).toEqual({ turns: 1, sourceHash: 'source-hash' });
      expect(once.data.text).toBe('comment');
      expect(once.data.geometryVersion).toBeUndefined();
      expect(once.data.normalizedGeometry).toBeUndefined();
      const twice = turn(once); const three = turn(twice); const four = turn(three);
      expect(twice.data.nativeMarkupTurn?.turns).toBe(2);
      expect(three.data.nativeMarkupTurn?.turns).toBe(3);
      expect(four.data.nativeMarkupTurn).toBeUndefined();
      expect(four.rect).toEqual(original.rect);
      four.data.textMarkupQuads!.forEach((value, index) => expect(value).toBeCloseTo(original.data.textMarkupQuads![index]));
      expect(original.rect).toEqual({ x: 20, y: 30, width: 100, height: 40 });
    },
  );

  it('retains an explicit turn for a square visual mask even though its Rect stays the same', () => {
    const mask = { ...item('redaction'), rect: { x: 20, y: 30, width: 40, height: 40 },
      data: { nativeMarkupRotationSourceHash: 'source-hash', text: 'comment' } } as PdfAnnotation;
    const result = turn(mask);
    expect(result.rect).toEqual(mask.rect);
    expect(result.data.nativeMarkupTurn).toEqual({ turns: 1, sourceHash: 'source-hash' });
    expect(result.data.text).toBe('comment');
  });

  it('records the complete before and after rotation in one undoable annotation mutation', () => {
    useSessionStore.getState().clearDocument();
    useHistoryStore.getState().clear();
    useSessionStore.getState().openDocument({ documentKey: 'synthetic-rotation', fileName: 'synthetic.pdf',
      bytes: new Uint8Array([1]), pageCount: 1 });
    const original = item();
    useAnnotationStore.getState().setAnnotations([original]);
    useHistoryStore.getState().clear();
    useAnnotationStore.getState().updateAnnotation(original.id, rotateMarkupQuarterTurn(original)!);
    const entries = useHistoryStore.getState().undoStack;
    expect(entries).toHaveLength(1);
    expect(entries[0].before.annotations[0].rect).toEqual(original.rect);
    expect(entries[0].before.annotations[0].data.nativeMarkupTurn).toBeUndefined();
    expect(entries[0].after.annotations[0].data.nativeMarkupTurn).toEqual({ turns: 1, sourceHash: 'source-hash' });
    expect(entries[0].after.annotations[0].data.textMarkupQuads).toEqual(turn(original).data.textMarkupQuads);
  });

  it('rejects unsupported, copied, stale, malformed, and non-finite inputs', () => {
    const original = item();
    expect(rotateMarkupQuarterTurn({ ...original, type: 'line' })).toBeNull();
    expect(rotateMarkupQuarterTurn({ ...original, data: { ...original.data, nativeMarkupRotationSourceHash: undefined } })).toBeNull();
    expect(rotateMarkupQuarterTurn({ ...original, data: { ...original.data, nativeIdentityAmbiguous: true } })).toBeNull();
    expect(rotateMarkupQuarterTurn({ ...original, data: { ...original.data, nativeCopySource: { pageNumber: 1, nativeName: 'source' } } })).toBeNull();
    expect(rotateMarkupQuarterTurn({ ...original, data: { ...original.data, nativeMarkupTurn: { turns: 1, sourceHash: 'stale' } } })).toBeNull();
    expect(rotateMarkupQuarterTurn({ ...original, rect: { ...original.rect, width: Infinity } })).toBeNull();
    for (const quads of [[], [0, 0], [0, 0, 1, 0, 0, 1, NaN, 1], [0, 0, 1, 0, 0, 0, 1, 1],
      [0, 0, 1, 0, 0, 1, 2, 1], Array.from({ length: 257 }, () => [0, 0, 1, 0, 0, 1, 1, 1]).flat()]) {
      expect(rotateMarkupQuarterTurn({ ...original, data: { ...original.data, textMarkupQuads: quads } })).toBeNull();
    }
    expect(rotateMarkupQuarterTurn({ ...original, type: 'redaction' })).toBeNull();
  });
});
