import { describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import {
  clampOcrRegionToPage,
  createOcrRegion,
  createOcrRegionResult,
  filterOcrBlocksInsideRegion,
  validateOcrRegion,
} from '../ocrRegionModel';

describe('ocrRegionModel', () => {
  it('creates and validates OCR region', () => {
    const region = createOcrRegion({
      id: 'region-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 72,
        y: 500,
        width: 200,
        height: 100,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(region.createdAt).toBe('2026-01-01T00:00:00.000Z');

    const validation = validateOcrRegion(region, {
      pageIndex: 0,
      width: 595,
      height: 842,
    });

    expect(validation.valid).toBe(true);
    expect(validation.diagnostics).toHaveLength(0);
  });

  it('normalizes negative-dimension region input', () => {
    const region = createOcrRegion({
      id: 'region-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 200,
        y: 200,
        width: -100,
        height: -50,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(region.bbox).toEqual({
      x: 100,
      y: 150,
      width: 100,
      height: 50,
    });
  });

  it('rejects region outside page', () => {
    const region = createOcrRegion({
      id: 'region-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 580,
        y: 500,
        width: 50,
        height: 100,
      },
    });

    const validation = validateOcrRegion(region, {
      pageIndex: 0,
      width: 595,
      height: 842,
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.some((item) => item.code === 'OUT_OF_PAGE_BBOX')).toBe(true);
  });

  it('clamps region to page bounds', () => {
    const region = createOcrRegion({
      id: 'region-1',
      documentFingerprint: 'doc-1',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 580,
        y: 830,
        width: 50,
        height: 50,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    const clamped = clampOcrRegionToPage(region, {
      width: 595,
      height: 842,
    });

    expect(clamped.bbox.x).toBe(580);
    expect(clamped.bbox.y).toBe(830);
    expect(clamped.bbox.width).toBe(15);
    expect(clamped.bbox.height).toBe(12);
  });

  it('filters OCR blocks inside region and creates region result', async () => {
    const document = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-region',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const region = createOcrRegion({
      id: 'region-1',
      documentFingerprint: 'doc-region',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 60,
        y: 620,
        width: 420,
        height: 180,
      },
    });

    const blocks = filterOcrBlocksInsideRegion(document.pages[0], region);

    expect(blocks.length).toBeGreaterThan(0);

    const result = createOcrRegionResult({
      region,
      pageResult: document.pages[0],
      blocks,
    });

    expect(result.text).toContain('Writer OCR Demo');
    expect(result.confidence).toBeGreaterThan(0);
  });
});
