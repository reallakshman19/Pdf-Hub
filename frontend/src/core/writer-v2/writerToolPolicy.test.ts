import { beforeEach, describe, expect, it } from 'vitest';
import {
  isLegacyWriterPlacementEnabled,
  isLegacyWriterPlacementTool,
  normalizeWriterToolForRichAuthoring,
  shouldWriterOverlayCapturePlacement,
} from './writerToolPolicy';

describe('writerToolPolicy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('identifies legacy placement tools', () => {
    expect(isLegacyWriterPlacementTool('textStamp')).toBe(true);
    expect(isLegacyWriterPlacementTool('reviewLabel')).toBe(true);
    expect(isLegacyWriterPlacementTool('tableBox')).toBe(true);
    expect(isLegacyWriterPlacementTool('select')).toBe(false);
    expect(isLegacyWriterPlacementTool('selectBoxCopy')).toBe(false);
  });

  it('normalizes legacy tools to select by default', () => {
    expect(normalizeWriterToolForRichAuthoring('richTextBox')).toBe('select');
    expect(normalizeWriterToolForRichAuthoring('textCallout')).toBe('select');
    expect(normalizeWriterToolForRichAuthoring('textStamp')).toBe('select');
    expect(normalizeWriterToolForRichAuthoring('reviewLabel')).toBe('select');
    expect(normalizeWriterToolForRichAuthoring('richNote')).toBe('select');
    expect(normalizeWriterToolForRichAuthoring('tableBox')).toBe('select');
  });

  it('preserves select and selectBoxCopy', () => {
    expect(normalizeWriterToolForRichAuthoring('select')).toBe('select');
    expect(normalizeWriterToolForRichAuthoring('selectBoxCopy')).toBe('selectBoxCopy');
  });

  it('allows legacy placement only with explicit local debug flag', () => {
    expect(isLegacyWriterPlacementEnabled()).toBe(false);
    expect(shouldWriterOverlayCapturePlacement('textStamp')).toBe(false);

    localStorage.setItem('writer-v2-enable-legacy-placement', '1');

    expect(isLegacyWriterPlacementEnabled()).toBe(true);
    expect(normalizeWriterToolForRichAuthoring('textStamp')).toBe('textStamp');
    expect(shouldWriterOverlayCapturePlacement('textStamp')).toBe(true);
  });
});
