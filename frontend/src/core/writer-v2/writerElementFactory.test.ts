import { describe, expect, it } from 'vitest';
import {
  createReviewLabelElement,
  createRichTextBoxElement,
  createTextCalloutElement,
  createTextStampElement,
} from './writerElementFactory';

describe('writer-v2 writerElementFactory', () => {
  const commonInput = {
    documentFingerprint: 'doc-123',
    pageIndex: 0,
    rect: { x: 10, y: 20, width: 200, height: 100 },
    text: 'Hello Writer',
    zIndex: 5,
  };

  it('creates a base richTextBox', () => {
    const el = createRichTextBoxElement(commonInput);

    expect(el.type).toBe('richTextBox');
    expect(el.documentFingerprint).toBe('doc-123');
    expect(el.pageIndex).toBe(0);
    expect(el.plainText).toBe('Hello Writer');
    expect(el.editorStateJson).toContain('Hello Writer');
    expect(el.style.zIndex).toBe(5);
    expect(el.callout).toBeUndefined();
    expect(el.id).toBeDefined();
    expect(el.createdAt).toBeDefined();
    expect(el.locked).toBe(false);
    expect(el.hidden).toBe(false);
  });

  it('creates a textCallout with an anchor point and leader metadata', () => {
    const el = createTextCalloutElement({
      ...commonInput,
      anchorPoint: { x: 50, y: 50 },
    });

    expect(el.type).toBe('textCallout');
    expect(el.plainText).toBe('Hello Writer');
    expect(el.callout).toBeDefined();
    expect(el.callout?.anchorPoint).toEqual({ x: 50, y: 50 });
    expect(el.callout?.leaderStyle).toBe('arrow');
  });

  it('creates a reviewLabel with custom colors', () => {
    const el = createReviewLabelElement(commonInput);

    expect(el.type).toBe('reviewLabel');
    expect(el.style.backgroundColor).toBe('#fef3c7');
    expect(el.style.borderColor).toBe('#d97706');
  });

  it('creates a textStamp with transparent borders', () => {
    const el = createTextStampElement(commonInput);

    expect(el.type).toBe('textStamp');
    expect(el.style.backgroundColor).toBe('transparent');
    expect(el.style.borderWidth).toBe(0);
  });
});
