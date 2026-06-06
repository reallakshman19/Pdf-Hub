import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createLegacyOcrEmptyResultsByPage,
  createLegacyOcrLaunchPlan,
  createLegacyOcrNoopJob,
  createLegacyOcrRetiredPageResult,
  createLegacyOcrRetirementNotice,
  normalizeLegacyOcrPageNumbers,
  shouldDisableLegacyPreviewOcr,
} from '../legacyOcrCompat';

describe('legacyOcrCompat', () => {
  it('creates retirement notice', () => {
    const notice = createLegacyOcrRetirementNotice();

    expect(notice.retired).toBe(true);
    expect(notice.title).toBe('Preview OCR retired');
    expect(notice.replacement).toBe('OcrPanelWriterConnected');
  });

  it('normalizes legacy page numbers', () => {
    expect(
      normalizeLegacyOcrPageNumbers([3, 1, 1, 0, -1, 2]),
    ).toEqual([1, 2, 3]);
  });

  it('creates cancelled no-op legacy job', () => {
    const job = createLegacyOcrNoopJob({
      documentKey: 'doc-legacy',
      pageNumbers: [2, 1],
      now: 1000,
    });

    expect(job.id).toBe('legacy-ocr-retired-1000');
    expect(job.documentKey).toBe('doc-legacy');
    expect(job.pageNumbers).toEqual([1, 2]);
    expect(job.status).toBe('cancelled');
    expect(job.cancelled).toBe(true);
    expect(job.results).toEqual([]);
    expect(job.queuedAt).toBe(1000);
    expect(job.finishedAt).toBe(1000);
  });

  it('creates blocked launch plan', () => {
    const plan = createLegacyOcrLaunchPlan({
      documentKey: 'doc-legacy',
      pageNumbers: [1, 2],
      language: 'eng',
      now: 2000,
    });

    expect(plan.allowed).toBe(false);
    expect(plan.job.status).toBe('cancelled');
    expect(plan.normalizedPageNumbers).toEqual([1, 2]);
    expect(plan.diagnostics.some((item) => item.code === 'LEGACY_OCR_RETIRED')).toBe(true);
  });

  it('adds diagnostics for missing document and pages', () => {
    const plan = createLegacyOcrLaunchPlan({
      documentKey: '',
      pageNumbers: [],
      now: 3000,
    });

    expect(plan.diagnostics.some((item) => item.code === 'LEGACY_OCR_NO_DOCUMENT')).toBe(true);
    expect(plan.diagnostics.some((item) => item.code === 'LEGACY_OCR_NO_PAGES')).toBe(true);
  });

  it('creates empty legacy result map', () => {
    expect(createLegacyOcrEmptyResultsByPage()).toEqual({});
  });

  it('creates retired page result', () => {
    const result = createLegacyOcrRetiredPageResult({
      pageNumber: 5,
      language: 'eng',
    });

    expect(result.pageNumber).toBe(5);
    expect(result.status).toBe('failed');
    expect(result.language).toBe('eng');
    expect(result.confidence).toBe(0);
    expect(result.blocks).toEqual([]);
    expect(result.warnings?.[0]).toContain('Legacy preview OCR is retired');
  });

  it('disables legacy preview OCR', () => {
    expect(shouldDisableLegacyPreviewOcr()).toBe(true);
  });
});
