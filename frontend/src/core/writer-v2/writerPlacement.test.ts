import { describe, expect, it } from 'vitest';
import { createWriterElementFromPlacement } from './writerPlacement';

const pageBounds = {
  x: 0,
  y: 0,
  width: 612,
  height: 792,
};

describe('writer-v2 placement', () => {
  it('creates a rich text box from click point', () => {
    const element = createWriterElementFromPlacement({
      tool: 'richTextBox',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      clickPoint: {
        x: 100,
        y: 700,
      },
      pageBounds,
      zIndex: 10,
    });

    expect(element?.type).toBe('richTextBox');
    expect(element?.documentFingerprint).toBe('doc-1');
    expect(element?.pageIndex).toBe(0);
    expect(element?.rect).toEqual({
      x: 100,
      y: 610,
      width: 220,
      height: 90,
    });
    expect(element?.style.zIndex).toBe(10);
  });

  it('creates a text callout with anchor point', () => {
    const element = createWriterElementFromPlacement({
      tool: 'textCallout',
      documentFingerprint: 'doc-1',
      pageIndex: 1,
      clickPoint: {
        x: 80,
        y: 500,
      },
      pageBounds,
    });

    expect(element?.type).toBe('textCallout');
    expect(element?.callout?.anchorPoint).toEqual({
      x: 80,
      y: 500,
    });
    expect(element?.callout?.leaderStyle).toBe('arrow');
  });

  it('clamps placed objects to page bounds', () => {
    const element = createWriterElementFromPlacement({
      tool: 'richTextBox',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      clickPoint: {
        x: 600,
        y: 20,
      },
      pageBounds,
    });

    expect(element?.rect.x).toBe(392);
    expect(element?.rect.y).toBe(0);
  });

  it('returns null for select tool', () => {
    const element = createWriterElementFromPlacement({
      tool: 'select',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      clickPoint: {
        x: 100,
        y: 100,
      },
      pageBounds,
    });

    expect(element).toBeNull();
  });
});