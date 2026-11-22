import { describe, expect, it } from 'vitest';
import type { PdfAnnotation } from './types';
import { markNativeAppearanceDirty } from './nativeInteropFidelity';

const imported: PdfAnnotation = {
  id: 'foreign-freetext',
  type: 'textbox',
  pageNumber: 1,
  rect: { x: 10, y: 20, width: 120, height: 30 },
  data: {
    text: 'Old contents',
    nativeAppearanceImported: true,
    nativeAppearanceRef: '10R',
  },
  createdAt: 1,
  updatedAt: 1,
};

describe('native appearance preview invalidation', () => {
  it('keeps an unmodified AP when review metadata changes', () => {
    const next = { ...imported, data: { ...imported.data, author: 'Reviewer' } };
    expect(markNativeAppearanceDirty(imported, next).data.nativeAppearanceDirty).not.toBe(true);
  });

  it('replaces stale AP after a text edit', () => {
    const next = { ...imported, data: { ...imported.data, text: 'New contents' } };
    expect(markNativeAppearanceDirty(imported, next).data.nativeAppearanceDirty).toBe(true);
  });

  it('retains original AP through simple translation', () => {
    const next = { ...imported, rect: { ...imported.rect, x: 20 } };
    expect(markNativeAppearanceDirty(imported, next).data.nativeAppearanceDirty).not.toBe(true);
  });

  it('invalidates a callout AP when moving its anchored text body', () => {
    const callout: PdfAnnotation = { ...imported, type: 'callout' };
    const next = { ...callout, rect: { ...callout.rect, x: 20 } };
    expect(markNativeAppearanceDirty(callout, next).data.nativeAppearanceDirty).toBe(true);
  });

  it('invalidates a line AP when editing native endpoint geometry', () => {
    const line: PdfAnnotation = { ...imported, type: 'line', data: { ...imported.data, points: [0, 0, 120, 30] } };
    const next = { ...line, data: { ...line.data, points: [0, 0, 100, 10] } };
    expect(markNativeAppearanceDirty(line, next).data.nativeAppearanceDirty).toBe(true);
  });

  it('does not affect app-generated visual previews', () => {
    const generated: PdfAnnotation = { ...imported, data: { ...imported.data, nativeAppearanceImported: false } };
    const next = { ...generated, data: { ...generated.data, text: 'New contents' } };
    expect(markNativeAppearanceDirty(generated, next).data.nativeAppearanceDirty).not.toBe(true);
  });
});
