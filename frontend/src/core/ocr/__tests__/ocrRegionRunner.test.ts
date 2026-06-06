import { describe, expect, it } from 'vitest';
import type { OcrEngine } from '../engines/ocrEngineContract';
import { createOcrEngineRegistry } from '../engines/ocrEngineRegistry';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import {
  inferOcrRegionProfileId,
  inferWriterOutputModeFromRegion,
  OcrRegionRunCancelledError,
  OcrRegionRunnerError,
  runOcrRegion,
  runOcrRegionAndConvertToWriter,
} from '../ocrRegionRunner';
import { createOcrRegion } from '../ocrRegionModel';

describe('ocrRegionRunner', () => {
  it('infers profile and writer output mode from region mode', () => {
    expect(inferOcrRegionProfileId(makeRegion('table'))).toBe('table-heavy');
    expect(inferOcrRegionProfileId(makeRegion('metadata'))).toBe('engineering-drawing');
    expect(inferOcrRegionProfileId(makeRegion('text'))).toBe('region-only');

    expect(inferWriterOutputModeFromRegion(makeRegion('table'))).toBe('tableBox');
    expect(inferWriterOutputModeFromRegion(makeRegion('note'))).toBe('richNote');
    expect(inferWriterOutputModeFromRegion(makeRegion('review'))).toBe('reviewLabel');
    expect(inferWriterOutputModeFromRegion(makeRegion('text'))).toBe('richTextBox');
  });

  it('runs OCR region with mock engine and returns region result', async () => {
    const region = createOcrRegion({
      id: 'region-text',
      documentFingerprint: 'doc-region-run',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 60,
        y: 620,
        width: 420,
        height: 180,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    const result = await runOcrRegion({
      documentFingerprint: 'doc-region-run',
      region,
      page: {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
      engineId: 'mock',
    });

    expect(result.profile.id).toBe('region-only');
    expect(result.pageResult.status).toBe('success');
    expect(result.regionResult.text).toContain('Writer OCR Demo');
    expect(result.regionResult.blocks.length).toBeGreaterThan(0);
  });

  it('runs table OCR region and converts to Writer tableBox', async () => {
    const region = createOcrRegion({
      id: 'region-table',
      documentFingerprint: 'doc-region-table-run',
      pageIndex: 0,
      mode: 'table',
      bbox: {
        x: 60,
        y: 460,
        width: 420,
        height: 220,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    const result = await runOcrRegionAndConvertToWriter({
      documentFingerprint: 'doc-region-table-run',
      region,
      page: {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
      engineId: 'mock',
      writerOptions: {
        outputMode: 'tableBox',
        useFirstRowAsHeader: true,
      },
    });

    expect(result.run.profile.id).toBe('table-heavy');
    expect(result.writer.element?.type).toBe('tableBox');
    expect(result.writer.element?.tableData?.columns).toHaveLength(2);
    expect(result.writer.element?.tableData?.rows[0].cells[0].text).toBe('Pipe');
  });

  it('throws when engine is missing', async () => {
    const region = makeRegion('text');

    await expect(
      runOcrRegion({
        documentFingerprint: 'doc-missing-engine',
        region,
        page: {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
        engineId: 'missing',
      }),
    ).rejects.toBeInstanceOf(OcrRegionRunnerError);
  });

  it('throws when region is invalid', async () => {
    const region = createOcrRegion({
      id: 'region-invalid',
      documentFingerprint: 'doc-invalid',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 590,
        y: 800,
        width: 100,
        height: 100,
      },
    });

    await expect(
      runOcrRegion({
        documentFingerprint: 'doc-invalid',
        region,
        page: {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
        engineId: 'mock',
      }),
    ).rejects.toBeInstanceOf(OcrRegionRunnerError);
  });

  it('throws cancellation error when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runOcrRegion({
        documentFingerprint: 'doc-cancelled-region',
        region: makeRegion('text'),
        page: {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
        engineId: 'mock',
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(OcrRegionRunCancelledError);
  });

  it('reports missing page result from custom engine', async () => {
    const emptyEngine: OcrEngine = {
      id: 'empty',
      label: 'Empty engine',
      supportsTables: false,
      supportsLayout: false,
      supportsSearchablePdf: false,
      async recognize(input) {
        return {
          documentFingerprint: input.documentFingerprint,
          createdAt: '2026-01-01T00:00:00.000Z',
          engineId: 'empty',
          profileId: input.profile.id,
          pages: [],
          diagnostics: [],
        };
      },
    };

    const registry = createOcrEngineRegistry([
      mockOcrEngine,
      emptyEngine,
    ]);

    await expect(
      runOcrRegion({
        documentFingerprint: 'doc-empty-engine',
        region: makeRegion('text'),
        page: {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
        engineId: 'empty',
        registry,
      }),
    ).rejects.toThrow('OCR engine returned no result');
  });
});

function makeRegion(mode: 'text' | 'table' | 'note' | 'review' | 'metadata') {
  return createOcrRegion({
    id: `region-${mode}`,
    documentFingerprint: 'doc-region-runner',
    pageIndex: 0,
    mode,
    bbox: {
      x: 60,
      y: 620,
      width: 420,
      height: 180,
    },
    now: '2026-01-01T00:00:00.000Z',
  });
}
