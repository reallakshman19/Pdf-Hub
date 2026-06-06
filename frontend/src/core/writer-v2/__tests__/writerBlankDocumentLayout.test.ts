import {
  describe,
  expect,
  it,
} from 'vitest';
import { WRITER_PAGE_PRESETS } from '../types';
import {
  createBlankWriterDocumentMeta,
  createWriterPageSetup,
} from '../writerDocumentMode';
import {
  createWriterBlankDocumentPageDescriptors,
  createWriterBlankPageLayout,
  createWriterBlankPageViewport,
  normalizeBlankPageScale,
} from '../writerBlankDocumentLayout';

describe('writerBlankDocumentLayout', () => {
  it('creates blank page viewport from page setup', () => {
    const viewport = createWriterBlankPageViewport(WRITER_PAGE_PRESETS.A4, 1.25);

    expect(viewport).toEqual({
      pdfWidth: 595.28,
      pdfHeight: 841.89,
      scale: 1.25,
      rotation: 0,
    });
  });

  it('creates layout with css size and margin guide', () => {
    const setup = createWriterPageSetup('Letter', {
      marginLeft: 36,
      marginRight: 36,
      marginTop: 72,
      marginBottom: 72,
    });

    const layout = createWriterBlankPageLayout({
      pageSetup: setup,
      scale: 2,
    });

    expect(layout.cssWidth).toBe(1224);
    expect(layout.cssHeight).toBe(1584);
    expect(layout.pageBounds).toEqual({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
    });
    expect(layout.contentBounds).toEqual({
      x: 36,
      y: 72,
      width: 540,
      height: 648,
    });
    expect(layout.marginGuideCss).toEqual({
      left: 72,
      top: 144,
      width: 1080,
      height: 1296,
    });
  });

  it('creates page descriptors for blank document', () => {
    const meta = createBlankWriterDocumentMeta({
      documentFingerprint: 'doc-layout',
      pageCount: 3,
    });

    expect(createWriterBlankDocumentPageDescriptors(meta)).toEqual([
      {
        pageIndex: 0,
        pageNumber: 1,
        label: 'Page 1',
      },
      {
        pageIndex: 1,
        pageNumber: 2,
        label: 'Page 2',
      },
      {
        pageIndex: 2,
        pageNumber: 3,
        label: 'Page 3',
      },
    ]);
  });

  it('returns no descriptors for non-blank metadata', () => {
    expect(createWriterBlankDocumentPageDescriptors(null)).toEqual([]);
  });

  it('normalizes scale', () => {
    expect(normalizeBlankPageScale(Number.NaN)).toBe(1);
    expect(normalizeBlankPageScale(0.01)).toBe(0.1);
    expect(normalizeBlankPageScale(5)).toBe(4);
    expect(normalizeBlankPageScale(1.5)).toBe(1.5);
  });
});
