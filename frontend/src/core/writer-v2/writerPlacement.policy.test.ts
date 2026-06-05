import { beforeEach, describe, expect, it } from 'vitest';
import { createWriterElementFromPlacement } from './writerPlacement';

const baseInput = {
  documentFingerprint: 'doc-1',
  pageIndex: 0,
  clickPoint: { x: 100, y: 500 },
  pageBounds: { x: 0, y: 0, width: 612, height: 792 },
  zIndex: 1,
};

describe('writerPlacement policy', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not create legacy placement objects by default', () => {
    expect(createWriterElementFromPlacement({
      ...baseInput,
      tool: 'textStamp',
    })).toBeNull();

    expect(createWriterElementFromPlacement({
      ...baseInput,
      tool: 'tableBox',
    })).toBeNull();
  });

  it('creates legacy placement objects only when debug flag is enabled', () => {
    localStorage.setItem('writer-v2-enable-legacy-placement', '1');

    const element = createWriterElementFromPlacement({
      ...baseInput,
      tool: 'textStamp',
    });

    expect(element?.type).toBe('textStamp');
  });
});
