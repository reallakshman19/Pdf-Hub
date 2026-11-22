import { describe, expect, it, vi } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import {
  createDefaultTesseractImageSource,
  createDefaultTesseractRecognizer,
  createTesseractJsEngine,
  normalizeTesseractConfidence,
  resolveTesseractLanguage,
  tesseractBboxToPdfRect,
  tesseractDataToOcrPageResult,
  type TesseractRecognizer,
} from '../engines/tesseractJsEngine';
import { createOcrEngineRegistry } from '../engines/ocrEngineRegistry';

describe('tesseractJsEngine', () => {
  it('normalizes Tesseract confidence values', () => {
    expect(normalizeTesseractConfidence(95)).toBe(0.95);
    expect(normalizeTesseractConfidence(0.95)).toBe(0.95);
    expect(normalizeTesseractConfidence(-10)).toBe(0);
    expect(normalizeTesseractConfidence(200)).toBe(1);
    expect(normalizeTesseractConfidence(undefined)).toBe(0);
  });

  it('resolves language hints to Tesseract language string', () => {
    expect(resolveTesseractLanguage([])).toBe('eng');
    expect(resolveTesseractLanguage(['eng'])).toBe('eng');
    expect(resolveTesseractLanguage(['eng', 'ara'])).toBe('eng+ara');
    expect(resolveTesseractLanguage([' eng ', '', 'ara'])).toBe('eng+ara');
  });

  it('converts Tesseract top-left bbox to PDF bottom-left rect', () => {
    const rect = tesseractBboxToPdfRect(
      {
        x0: 10,
        y0: 20,
        x1: 60,
        y1: 40,
      },
      {
        height: 100,
      },
      {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    );

    expect(rect).toEqual({
      x: 10,
      y: 60,
      width: 50,
      height: 20,
    });
  });

  it('restores cropped 2x Tesseract word boxes to original PDF points', () => {
    const result = tesseractBboxToPdfRect(
      { x0: 20, y0: 10, x1: 60, y1: 30 },
      {
        height: 40,
        pixelToPdfTransform: [0.5, 0, 0, -0.5, 100, 240],
      },
      { x: 0, y: 0, width: 1, height: 1 },
    );
    expect(result).toEqual({ x: 110, y: 225, width: 20, height: 10 });
  });

  it('maps a 90-degree rotated OCR image box through both affine axes', () => {
    const result = tesseractBboxToPdfRect(
      { x0: 20, y0: 10, x1: 60, y1: 30 },
      {
        height: 40,
        pixelToPdfTransform: [0, 0.5, 0.5, 0, 70, 100],
      },
      { x: 0, y: 0, width: 1, height: 1 },
    );
    expect(result).toEqual({ x: 75, y: 110, width: 10, height: 20 });
  });

  it('extracts native nested v7 block/paragraph/line/word bboxes at 2x', () => {
    const result = tesseractDataToOcrPageResult({
      language: 'eng',
      page: {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 500,
        height: 600,
        pixelToPdfTransform: [0.5, 0, 0, -0.5, 0, 600],
      },
      data: {
        text: 'ALPHA VALVE',
        confidence: 96,
        blocks: [{
          text: 'ALPHA VALVE',
          confidence: 96,
          bbox: { x0: 80, y0: 180, x1: 460, y1: 260 },
          paragraphs: [{
            text: 'ALPHA VALVE',
            lines: [{
              text: 'ALPHA VALVE',
              bbox: { x0: 100, y0: 200, x1: 460, y1: 250 },
              words: [
                { text: 'ALPHA', confidence: 97, bbox: { x0: 100, y0: 200, x1: 230, y1: 250 } },
                { text: 'VALVE', confidence: 96, bbox: { x0: 240, y0: 200, x1: 450, y1: 250 } },
              ],
            }],
          }],
        }],
      },
    });
    expect(result.words?.map((word) => word.text)).toEqual(['ALPHA', 'VALVE']);
    expect(result.words?.[0]?.bbox).toEqual({ x: 50, y: 475, width: 65, height: 25 });
    expect(result.words?.[1]?.bbox).toEqual({ x: 120, y: 475, width: 105, height: 25 });
    expect(result.lines).toHaveLength(1);
    expect(result.blocks).toHaveLength(1);
    expect(result.geometryProvenance).toBe('pdf-user-space-v2');
  });

  it('requests v7 native blocks from default Tesseract worker, not text-only fallback', async () => {
    let observed: { blocks?: boolean } | undefined;
    const terminate = vi.fn().mockResolvedValue(undefined);
    const recognizer = createDefaultTesseractRecognizer({
      workerFactory: async () => ({
        async recognize(_image, _options, output) {
          observed = output;
          return {
            data: { text: 'ALPHA VALVE', confidence: 96 },
          };
        },
        terminate,
      }),
    });
    const result = await recognizer.recognize({
      image: new Uint8Array([1, 2, 3]),
      language: 'eng',
      page: { pageIndex: 0, imageBytes: new Uint8Array([1, 2, 3]), width: 500, height: 600 },
    });
    expect(observed).toEqual({ blocks: true });
    expect(result.text).toBe('ALPHA VALVE');
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('uses PSM AUTO for quarter-turn PDF raster without rotating recognized pixel boxes', async () => {
    const order: string[] = [];
    const setParameters = vi.fn(async (params: Record<string, string>) => {
      expect(params).toEqual({ tessedit_pageseg_mode: '3' });
      order.push('psm3');
    });
    const recognizer = createDefaultTesseractRecognizer({
      workerFactory: async () => ({
        setParameters,
        async recognize(_image, _options, output) {
          order.push('recognize');
          expect(output).toEqual({ blocks: true });
          return {
            data: {
              text: 'ANCHOR',
              confidence: 96,
              blocks: [{
                text: 'ANCHOR',
                bbox: { x0: 20, y0: 10, x1: 60, y1: 30 },
              }],
            },
          };
        },
        async terminate() { order.push('terminate'); },
      }),
    });
    const page = {
      pageIndex: 1, imageBytes: new Uint8Array([1, 2, 3]),
      width: 80, height: 40,
      pixelToPdfTransform: [0, 0.5, 0.5, 0, 70, 100] as [number, number, number, number, number, number],
    };
    const result = await recognizer.recognize({
      image: page.imageBytes, language: 'eng', page,
    });
    expect(result.text).toBe('ANCHOR');
    expect(order).toEqual(['psm3', 'recognize', 'terminate']);
    expect(setParameters).toHaveBeenCalledTimes(1);
    expect(
      tesseractBboxToPdfRect(
        { x0: 20, y0: 10, x1: 60, y1: 30 },
        page,
        { x: 0, y: 0, width: 1, height: 1 },
      ),
    ).toEqual({ x: 75, y: 110, width: 10, height: 20 });
  });

  it('falls back when Tesseract bbox is missing', () => {
    const fallback = {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    };

    expect(
      tesseractBboxToPdfRect(
        undefined,
        {
          height: 100,
        },
        fallback,
      ),
    ).toBe(fallback);
  });

  it('maps Tesseract data into OCR page result', () => {
    const pageResult = tesseractDataToOcrPageResult({
      language: 'eng',
      page: {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
      data: {
        text: 'Pipe Support',
        confidence: 91,
        words: [
          {
            text: 'Pipe',
            confidence: 90,
            bbox: {
              x0: 72,
              y0: 100,
              x1: 110,
              y1: 114,
            },
          },
          {
            text: 'Support',
            confidence: 80,
            bbox: {
              x0: 120,
              y0: 100,
              x1: 180,
              y1: 114,
            },
          },
        ],
        lines: [
          {
            text: 'Pipe Support',
            confidence: 86,
            bbox: {
              x0: 72,
              y0: 100,
              x1: 180,
              y1: 114,
            },
          },
        ],
        blocks: [
          {
            text: 'Pipe Support',
            confidence: 86,
            bbox: {
              x0: 72,
              y0: 100,
              x1: 180,
              y1: 114,
            },
          },
        ],
      },
    });

    expect(pageResult.status).toBe('success');
    expect(pageResult.pageType).toBe('scanned');
    expect(pageResult.words).toHaveLength(2);
    expect(pageResult.words![0].text).toBe('Pipe');
    expect(pageResult.words![0].confidence).toBe(0.9);
    expect(pageResult.lines).toHaveLength(1);
    expect(pageResult.blocks).toHaveLength(1);
    expect(pageResult.blocks[0]!.text).toBe('Pipe Support');
  });

  it('synthesizes words/lines/blocks from plain text fallback', () => {
    const pageResult = tesseractDataToOcrPageResult({
      language: 'eng',
      page: {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
      data: {
        text: 'Fallback OCR text',
        confidence: 75,
      },
    });

    expect(pageResult.words!.length).toBeGreaterThan(0);
    expect(pageResult.lines!.length).toBeGreaterThan(0);
    expect(pageResult.blocks.length).toBeGreaterThan(0);
    expect(pageResult.blocks[0]!.text).toContain('Fallback OCR text');
  });

  it('runs fake Tesseract recognizer through OcrEngine contract', async () => {
    const recognizer: TesseractRecognizer = {
      async recognize({ language, page }) {
        expect(language).toBe('eng');
        expect(page.pageIndex).toBe(0);

        return {
          text: 'Pipe Support',
          confidence: 91,
          words: [
            {
              text: 'Pipe',
              confidence: 90,
              bbox: {
                x0: 72,
                y0: 100,
                x1: 110,
                y1: 114,
              },
            },
            {
              text: 'Support',
              confidence: 80,
              bbox: {
                x0: 120,
                y0: 100,
                x1: 180,
                y1: 114,
              },
            },
          ],
        };
      },
    };

    const engine = createTesseractJsEngine({
      recognizer,
      now: () => '2026-01-01T00:00:00.000Z',
    });

    const result = await engine.recognize({
      documentFingerprint: 'doc-tesseract',
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

    expect(result.engineId).toBe('tesseract-js');
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.words).toHaveLength(2);
    expect(result.pages[0]!.words![0].text).toBe('Pipe');
  });

  it('returns failed page when recognizer throws', async () => {
    const engine = createTesseractJsEngine({
      recognizer: {
        async recognize() {
          throw new Error('Synthetic Tesseract failure.');
        },
      },
    });

    const result = await engine.recognize({
      documentFingerprint: 'doc-fail',
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

    expect(result.pages[0]!.status).toBe('failed');
    expect(result.pages[0]!.diagnostics![0].code).toBe('OCR_ENGINE_FAILED');
    expect(result.pages[0]!.diagnostics![0].message).toContain('Synthetic Tesseract failure');
  });

  it('passes region input through fake recognizer', async () => {
    let receivedRegion = false;

    const engine = createTesseractJsEngine({
      recognizer: {
        async recognize({ page }) {
          receivedRegion = Boolean(page.region);

          return {
            text: 'Region OCR',
            confidence: 90,
          };
        },
      },
    });

    await engine.recognize({
      documentFingerprint: 'doc-region-tesseract',
      profile: getOcrProfile('region-only'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          region: {
            x: 60,
            y: 620,
            width: 420,
            height: 180,
          },
        },
      ],
    });

    expect(receivedRegion).toBe(true);
  });

  it('uses injected image source factory and disposes resources', async () => {
    let disposed = false;

    const engine = createTesseractJsEngine({
      imageSourceFactory: async () => ({
        source: 'fake://image',
        dispose: () => {
          disposed = true;
        },
      }),
      recognizer: {
        async recognize({ image }) {
          expect(image).toBe('fake://image');

          return {
            text: 'Image source OCR',
            confidence: 90,
          };
        },
      },
    });

    await engine.recognize({
      documentFingerprint: 'doc-image-source',
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

    expect(disposed).toBe(true);
  });

  it('rethrows cancellation and still disposes the OCR image source', async () => {
    const controller = new AbortController();
    const dispose = vi.fn();
    const engine = createTesseractJsEngine({
      imageSourceFactory: async () => ({ source: 'fake://cancel', dispose }),
      recognizer: {
        recognize: () => new Promise(() => undefined),
      },
    });

    const pending = engine.recognize({
      documentFingerprint: 'doc-cancel',
      profile: getOcrProfile('clean-scan'),
      abortSignal: controller.signal,
      pages: [{
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      }],
    });
    await Promise.resolve();
    controller.abort('cancel OCR');

    await expect(pending).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('terminates the default Tesseract worker exactly once on cancellation', async () => {
    const controller = new AbortController();
    const terminate = vi.fn().mockResolvedValue(undefined);
    const recognizer = createDefaultTesseractRecognizer({
      workerFactory: async () => ({
        recognize: () => new Promise(() => undefined),
        terminate,
      }),
    });

    const pending = recognizer.recognize({
      image: new Uint8Array([1]),
      language: 'eng',
      page: { pageIndex: 0, imageBytes: new Uint8Array([1]), width: 10, height: 10 },
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort('cancel worker');

    await expect(pending).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' });
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('default image source returns bytes in non-browser test runtime when Blob/URL unavailable', async () => {
    const source = await createDefaultTesseractImageSource({
      pageIndex: 0,
      imageBytes: new Uint8Array([1, 2, 3]),
      width: 595,
      height: 842,
    });

    expect(source.source).toBeTruthy();
    source.dispose?.();
  });

  it('registers tesseract-js engine in registry', () => {
    const registry = createOcrEngineRegistry();

    expect(registry.getEngine('mock')).not.toBeNull();
    expect(registry.getEngine('tesseract-js')).not.toBeNull();
    expect(registry.listEngines().map((engine) => engine.id)).toContain('tesseract-js');
  });

  it('preserves recognized currencies, labels and separators for review', () => {
    const values = ['¥600', '₹600', 'A 0.56%', 'V 0.26%', 'OMR ~ INR'];
    const result = tesseractDataToOcrPageResult({
      language: 'eng',
      page: { pageIndex: 0, imageBytes: new Uint8Array([1]), width: 500, height: 600 },
      data: {
        text: values.join('\n'),
        confidence: 90,
        lines: values.map((value, index) => ({
          text: value,
          confidence: 90,
          bbox: { x0: 10, y0: index * 20, x1: 160, y1: index * 20 + 16 },
        })),
      },
    });

    expect(result.lines?.map((line) => line.text)).toEqual(values);
  });
});
