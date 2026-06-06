import { describe, expect, it } from 'vitest';
import {
  decideOcrForPage,
  runOcrPreflight,
} from '../ocrPreflight';

describe('ocrPreflight', () => {
  it('skips born-digital page by default', () => {
    const decision = decideOcrForPage({
      forceOcr: false,
      page: {
        pageIndex: 0,
        width: 595,
        height: 842,
        embeddedTextLength: 2000,
        imageCount: 0,
      },
    });

    expect(decision.action).toBe('skip');
    expect(decision.shouldQueue).toBe(false);
    expect(decision.profile.id).toBe('clean-scan');
    expect(decision.diagnostics.some((item) => item.code === 'PAGE_SKIPPED_BORN_DIGITAL')).toBe(true);
  });

  it('forces OCR when forceOcr is enabled', () => {
    const decision = decideOcrForPage({
      forceOcr: true,
      page: {
        pageIndex: 0,
        width: 595,
        height: 842,
        embeddedTextLength: 3000,
        imageCount: 0,
      },
    });

    expect(decision.action).toBe('force-ocr');
    expect(decision.shouldQueue).toBe(true);
    expect(decision.profile.id).toBe('force-ocr');
  });

  it('queues mixed pages for image-region OCR', () => {
    const decision = decideOcrForPage({
      forceOcr: false,
      page: {
        pageIndex: 1,
        width: 595,
        height: 842,
        embeddedTextLength: 1000,
        imageCount: 2,
      },
    });

    expect(decision.action).toBe('ocr-image-regions');
    expect(decision.shouldQueue).toBe(true);
  });

  it('selects table-heavy profile for grid-like pages', () => {
    const decision = decideOcrForPage({
      forceOcr: false,
      page: {
        pageIndex: 2,
        width: 595,
        height: 842,
        imageCount: 1,
        detectedGridLikeRegions: 2,
      },
    });

    expect(decision.action).toBe('ocr-table');
    expect(decision.profile.id).toBe('table-heavy');
    expect(decision.shouldQueue).toBe(true);
  });

  it('selects engineering drawing profile for drawing-like pages', () => {
    const decision = decideOcrForPage({
      forceOcr: false,
      page: {
        pageIndex: 3,
        width: 2384,
        height: 1684,
        vectorObjectCount: 500,
      },
    });

    expect(decision.action).toBe('ocr-engineering');
    expect(decision.profile.id).toBe('engineering-drawing');
    expect(decision.shouldQueue).toBe(true);
  });

  it('honors requested profile override except force behavior', () => {
    const decision = decideOcrForPage({
      forceOcr: false,
      requestedProfileId: 'low-quality-scan',
      page: {
        pageIndex: 4,
        width: 595,
        height: 842,
        imageCount: 1,
      },
    });

    expect(decision.action).toBe('ocr');
    expect(decision.profile.id).toBe('low-quality-scan');
  });

  it('runs preflight across pages and returns queued/skipped page indexes', () => {
    const result = runOcrPreflight({
      documentFingerprint: 'doc-1',
      pages: [
        {
          pageIndex: 0,
          width: 595,
          height: 842,
          embeddedTextLength: 3000,
          imageCount: 0,
        },
        {
          pageIndex: 1,
          width: 595,
          height: 842,
          imageCount: 1,
        },
        {
          pageIndex: 2,
          width: 595,
          height: 842,
          detectedGridLikeRegions: 1,
        },
      ],
    });

    expect(result.documentFingerprint).toBe('doc-1');
    expect(result.skippedPageIndexes).toEqual([0]);
    expect(result.queuedPageIndexes).toEqual([1, 2]);
    expect(result.pageDecisions).toHaveLength(3);
  });

  it('filters pages by selectedPageIndexes', () => {
    const result = runOcrPreflight({
      documentFingerprint: 'doc-2',
      selectedPageIndexes: [2],
      pages: [
        {
          pageIndex: 0,
          width: 595,
          height: 842,
          imageCount: 1,
        },
        {
          pageIndex: 1,
          width: 595,
          height: 842,
          imageCount: 1,
        },
        {
          pageIndex: 2,
          width: 595,
          height: 842,
          imageCount: 1,
        },
      ],
    });

    expect(result.queuedPageIndexes).toEqual([2]);
    expect(result.skippedPageIndexes).toEqual([0, 1]);
  });
});
