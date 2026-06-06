import type { PdfRect } from '../../writer-v2/types';
import type {
  OcrAnyBlock,
  OcrDocumentResult,
  OcrLine,
  OcrPageResult,
  OcrWord,
} from '../types';
import {
  clampOcrConfidence,
  normalizeOcrText,
  validateOcrDocumentResult,
} from '../types';
import type {
  OcrEngine,
  OcrEngineInput,
  OcrEnginePageInput,
} from './ocrEngineContract';

export interface TesseractJsEngineOptions {
  recognizer?: TesseractRecognizer;
  imageSourceFactory?: TesseractImageSourceFactory;
  workerFactory?: TesseractWorkerFactory;
  now?: () => string;
}

export type TesseractImageSource = string | Blob | Uint8Array;

export type TesseractImageSourceFactory = (
  page: OcrEnginePageInput,
) => Promise<{
  source: TesseractImageSource;
  dispose?: () => void;
}>;

export interface TesseractRecognizer {
  recognize(input: {
    image: TesseractImageSource;
    language: string;
    page: OcrEnginePageInput;
  }): Promise<TesseractRecognizeData>;
}

export type TesseractWorkerFactory = (language: string) => Promise<TesseractWorkerLike>;

export interface TesseractWorkerLike {
  recognize(image: TesseractImageSource): Promise<{
    data: TesseractRecognizeData;
  }>;
  terminate(): Promise<void>;
}

export interface TesseractRecognizeData {
  text?: string;
  confidence?: number;
  words?: TesseractTextNode[];
  lines?: TesseractTextNode[];
  paragraphs?: TesseractTextNode[];
  blocks?: TesseractTextNode[];
}

export interface TesseractTextNode {
  text?: string;
  confidence?: number;
  bbox?: TesseractBbox;
  words?: TesseractTextNode[];
  lines?: TesseractTextNode[];
  paragraphs?: TesseractTextNode[];
  blocks?: TesseractTextNode[];
}

export interface TesseractBbox {
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
}

export function createTesseractJsEngine(
  options: TesseractJsEngineOptions = {},
): OcrEngine {
  const recognizer = options.recognizer ?? createDefaultTesseractRecognizer({
    workerFactory: options.workerFactory,
  });

  const imageSourceFactory =
    options.imageSourceFactory ?? createDefaultTesseractImageSource;

  const now = options.now ?? (() => new Date().toISOString());

  return {
    id: 'tesseract-js',
    label: 'Tesseract.js OCR',
    supportsTables: false,
    supportsLayout: true,
    supportsSearchablePdf: false,

    async recognize(input: OcrEngineInput): Promise<OcrDocumentResult> {
      const language = resolveTesseractLanguage(input.profile.languageHints);
      const pages: OcrPageResult[] = [];

      for (const page of input.pages) {
        const imageSource = await imageSourceFactory(page);

        try {
          const data = await recognizer.recognize({
            image: imageSource.source,
            language,
            page,
          });

          pages.push(
            tesseractDataToOcrPageResult({
              data,
              page,
              language,
            }),
          );
        } catch (error) {
          pages.push(
            createFailedTesseractPageResult({
              page,
              language,
              message: error instanceof Error
                ? error.message
                : 'Tesseract.js OCR failed.',
            }),
          );
        } finally {
          imageSource.dispose?.();
        }
      }

      const result: OcrDocumentResult = {
        documentFingerprint: input.documentFingerprint,
        createdAt: now(),
        engineId: 'tesseract-js',
        profileId: input.profile.id,
        pages,
        diagnostics: [],
      };

      const validation = validateOcrDocumentResult(result);

      return {
        ...result,
        diagnostics: [
          ...result.diagnostics,
          ...validation.diagnostics,
        ],
      };
    },
  };
}

export const tesseractJsEngine = createTesseractJsEngine();

export function tesseractDataToOcrPageResult(input: {
  data: TesseractRecognizeData;
  page: OcrEnginePageInput;
  language: string;
}): OcrPageResult {
  const wordNodes = collectTesseractWords(input.data);
  const lineNodes = collectTesseractLines(input.data);
  const blockNodes = collectTesseractBlocks(input.data);

  const words = wordNodes.map((node, index) =>
    tesseractNodeToOcrWord({
      node,
      index,
      page: input.page,
      lineId: inferParentLineId(node, lineNodes, input.page.pageIndex),
      blockId: inferParentBlockId(node, blockNodes, input.page.pageIndex),
    }),
  );

  const lines = lineNodes.length > 0
    ? lineNodes.map((node, index) =>
        tesseractNodeToOcrLine({
          node,
          index,
          page: input.page,
          words,
        }),
      )
    : synthesizeLinesFromWords({
        page: input.page,
        words,
      });

  const blocks = blockNodes.length > 0
    ? blockNodes.map((node, index) =>
        tesseractNodeToOcrBlock({
          node,
          index,
          page: input.page,
          lines,
          words,
        }),
      )
    : synthesizeBlocksFromLines({
        page: input.page,
        lines,
        words,
        fallbackText: input.data.text ?? '',
        fallbackConfidence: normalizeTesseractConfidence(input.data.confidence),
      });

  return {
    pageIndex: input.page.pageIndex,
    status: words.length > 0 || lines.length > 0 || blocks.length > 0
      ? 'success'
      : 'partial',
    pageType: input.page.region ? 'mixed' : 'scanned',
    orientationDeg: 0,
    languageHints: [input.language],
    width: input.page.width,
    height: input.page.height,
    words,
    lines,
    blocks,
    diagnostics: [],
    pageNumber: input.page.pageIndex + 1,
  };
}

export function resolveTesseractLanguage(
  languageHints: string[],
): string {
  const normalized = languageHints
    .map((language) => language.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return 'eng';
  }

  return normalized.join('+');
}

export async function createDefaultTesseractImageSource(
  page: OcrEnginePageInput,
): Promise<{
  source: TesseractImageSource;
  dispose?: () => void;
}> {
  if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    const blob = new Blob([page.imageBytes.buffer as ArrayBuffer], {
      type: inferImageMimeType(page.imageBytes),
    });
    const url = URL.createObjectURL(blob);

    return {
      source: url,
      dispose: () => URL.revokeObjectURL(url),
    };
  }

  return {
    source: page.imageBytes,
  };
}

export function createDefaultTesseractRecognizer(input: {
  workerFactory?: TesseractWorkerFactory;
} = {}): TesseractRecognizer {
  return {
    async recognize({ image, language }) {
      const workerFactory = input.workerFactory ?? createDefaultTesseractWorker;
      const worker = await workerFactory(language);

      try {
        const result = await worker.recognize(image);
        return result.data;
      } finally {
        await worker.terminate();
      }
    },
  };
}

export async function createDefaultTesseractWorker(
  language: string,
): Promise<TesseractWorkerLike> {
  const tesseract = await import('tesseract.js');

  const maybeWorker = await tesseract.createWorker(language);

  return maybeWorker as unknown as TesseractWorkerLike;
}

function collectTesseractWords(
  data: TesseractRecognizeData,
): TesseractTextNode[] {
  if (Array.isArray(data.words) && data.words.length > 0) {
    return data.words;
  }

  const fromLines = flattenNodes(data.lines, 'words');

  if (fromLines.length > 0) {
    return fromLines;
  }

  const fromParagraphs = flattenNodes(data.paragraphs, 'words');

  if (fromParagraphs.length > 0) {
    return fromParagraphs;
  }

  const fromBlocks = flattenNodes(data.blocks, 'words');

  if (fromBlocks.length > 0) {
    return fromBlocks;
  }

  return data.text
    ? createFallbackWordNodesFromText(data.text, data.confidence)
    : [];
}

function collectTesseractLines(
  data: TesseractRecognizeData,
): TesseractTextNode[] {
  if (Array.isArray(data.lines) && data.lines.length > 0) {
    return data.lines;
  }

  const fromParagraphs = flattenNodes(data.paragraphs, 'lines');

  if (fromParagraphs.length > 0) {
    return fromParagraphs;
  }

  const fromBlocks = flattenNodes(data.blocks, 'lines');

  if (fromBlocks.length > 0) {
    return fromBlocks;
  }

  if (data.text) {
    return data.text
      .split(/\r?\n/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({
        text,
        confidence: data.confidence,
      }));
  }

  return [];
}

function collectTesseractBlocks(
  data: TesseractRecognizeData,
): TesseractTextNode[] {
  if (Array.isArray(data.blocks) && data.blocks.length > 0) {
    return data.blocks;
  }

  if (Array.isArray(data.paragraphs) && data.paragraphs.length > 0) {
    return data.paragraphs;
  }

  if (data.text) {
    return [
      {
        text: data.text,
        confidence: data.confidence,
      },
    ];
  }

  return [];
}

function flattenNodes(
  nodes: TesseractTextNode[] | undefined,
  key: 'words' | 'lines' | 'paragraphs' | 'blocks',
): TesseractTextNode[] {
  return (nodes ?? []).flatMap((node) => node[key] ?? []);
}

function tesseractNodeToOcrWord(input: {
  node: TesseractTextNode;
  index: number;
  page: OcrEnginePageInput;
  lineId?: string;
  blockId?: string;
}): OcrWord {
  const text = sanitizeOcrText(input.node.text ?? '');
  const bbox = tesseractBboxToPdfRect(
    input.node.bbox,
    input.page,
    createFallbackWordRect(input.index, input.page),
  );

  return {
    id: `tess-word-${input.page.pageIndex}-${input.index + 1}`,
    pageIndex: input.page.pageIndex,
    text,
    normalizedText: normalizeOcrText(text),
    confidence: normalizeTesseractConfidence(input.node.confidence),
    bbox,
    lineId: input.lineId,
    blockId: input.blockId,
  };
}

function tesseractNodeToOcrLine(input: {
  node: TesseractTextNode;
  index: number;
  page: OcrEnginePageInput;
  words: OcrWord[];
}): OcrLine {
  const id = `tess-line-${input.page.pageIndex}-${input.index + 1}`;
  const text = sanitizeOcrText(input.node.text ?? '');
  const bbox = tesseractBboxToPdfRect(
    input.node.bbox,
    input.page,
    unionRectsOrFallback(
      input.words
        .filter((word) => word.text && text.includes(word.text))
        .map((word) => word.bbox),
      createFallbackLineRect(input.index, input.page),
    ),
  );

  const wordIds = input.words
    .filter((word) => rectsIntersect(word.bbox, bbox))
    .map((word) => word.id);

  return {
    id,
    pageIndex: input.page.pageIndex,
    text,
    confidence: normalizeTesseractConfidence(input.node.confidence),
    bbox,
    wordIds,
  };
}

function tesseractNodeToOcrBlock(input: {
  node: TesseractTextNode;
  index: number;
  page: OcrEnginePageInput;
  lines: OcrLine[];
  words: OcrWord[];
}): OcrAnyBlock {
  const id = `tess-block-${input.page.pageIndex}-${input.index + 1}`;
  const text = sanitizeOcrText(input.node.text ?? '');
  const bbox = tesseractBboxToPdfRect(
    input.node.bbox,
    input.page,
    unionRectsOrFallback(
      input.lines.map((line) => line.bbox),
      {
        x: 0,
        y: 0,
        width: input.page.width,
        height: input.page.height,
      },
    ),
  );

  return {
    id,
    type: 'paragraph',
    pageIndex: input.page.pageIndex,
    bbox,
    rect: bbox,
    text,
    confidence: normalizeTesseractConfidence(input.node.confidence),
    lineIds: input.lines
      .filter((line) => rectsIntersect(line.bbox, bbox))
      .map((line) => line.id),
    wordIds: input.words
      .filter((word) => rectsIntersect(word.bbox, bbox))
      .map((word) => word.id),
  };
}

function synthesizeLinesFromWords(input: {
  page: OcrEnginePageInput;
  words: OcrWord[];
}): OcrLine[] {
  if (input.words.length === 0) {
    return [];
  }

  const sorted = [...input.words].sort((a, b) => {
    const yDelta = b.bbox.y - a.bbox.y;
    if (Math.abs(yDelta) > 8) return yDelta;
    return a.bbox.x - b.bbox.x;
  });

  const groups: OcrWord[][] = [];

  for (const word of sorted) {
    const existing = groups.find((group) =>
      Math.abs(group[0].bbox.y - word.bbox.y) <= 8,
    );

    if (existing) {
      existing.push(word);
    } else {
      groups.push([word]);
    }
  }

  return groups.map((group, index) => {
    const ordered = [...group].sort((a, b) => a.bbox.x - b.bbox.x);
    const bbox = unionRectsOrFallback(
      ordered.map((word) => word.bbox),
      createFallbackLineRect(index, input.page),
    );

    return {
      id: `tess-line-${input.page.pageIndex}-${index + 1}`,
      pageIndex: input.page.pageIndex,
      text: ordered.map((word) => word.text).join(' '),
      confidence: averageConfidence(ordered.map((word) => word.confidence)),
      bbox,
      wordIds: ordered.map((word) => word.id),
    };
  });
}

function synthesizeBlocksFromLines(input: {
  page: OcrEnginePageInput;
  lines: OcrLine[];
  words: OcrWord[];
  fallbackText: string;
  fallbackConfidence: number;
}): OcrAnyBlock[] {
  const bbox = unionRectsOrFallback(
    input.lines.map((line) => line.bbox),
    {
      x: 0,
      y: 0,
      width: input.page.width,
      height: input.page.height,
    },
  );

  return [
    {
      id: `tess-block-${input.page.pageIndex}-1`,
      type: 'paragraph',
      pageIndex: input.page.pageIndex,
      bbox,
      rect: bbox,
      text: input.lines.length > 0
        ? input.lines.map((line) => line.text).join('\n')
        : sanitizeOcrText(input.fallbackText),
      confidence: input.lines.length > 0
        ? averageConfidence(input.lines.map((line) => line.confidence))
        : input.fallbackConfidence,
      lineIds: input.lines.map((line) => line.id),
      wordIds: input.words.map((word) => word.id),
    },
  ];
}

export function normalizeTesseractConfidence(
  confidence: number | undefined,
): number {
  if (!Number.isFinite(confidence)) {
    return 0;
  }

  const value = confidence as number;

  return value > 1
    ? clampOcrConfidence(value / 100)
    : clampOcrConfidence(value);
}

export function tesseractBboxToPdfRect(
  bbox: TesseractBbox | undefined,
  page: Pick<OcrEnginePageInput, 'height'>,
  fallback: PdfRect,
): PdfRect {
  if (
    !bbox
    || !Number.isFinite(bbox.x0)
    || !Number.isFinite(bbox.y0)
    || !Number.isFinite(bbox.x1)
    || !Number.isFinite(bbox.y1)
  ) {
    return fallback;
  }

  const x0 = Number(bbox.x0);
  const y0 = Number(bbox.y0);
  const x1 = Number(bbox.x1);
  const y1 = Number(bbox.y1);

  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const topFromImage = Math.min(y0, y1);
  const bottomFromImage = Math.max(y0, y1);

  return {
    x: left,
    y: Math.max(0, page.height - bottomFromImage),
    width: Math.max(0, right - left),
    height: Math.max(0, bottomFromImage - topFromImage),
  };
}

function inferParentLineId(
  node: TesseractTextNode,
  lines: TesseractTextNode[],
  pageIndex: number,
): string | undefined {
  const index = lines.findIndex((line) =>
    line.text && node.text && line.text.includes(node.text),
  );

  return index >= 0
    ? `tess-line-${pageIndex}-${index + 1}`
    : undefined;
}

function inferParentBlockId(
  node: TesseractTextNode,
  blocks: TesseractTextNode[],
  pageIndex: number,
): string | undefined {
  const index = blocks.findIndex((block) =>
    block.text && node.text && block.text.includes(node.text),
  );

  return index >= 0
    ? `tess-block-${pageIndex}-${index + 1}`
    : undefined;
}

function createFailedTesseractPageResult(input: {
  page: OcrEnginePageInput;
  language: string;
  message: string;
}): OcrPageResult {
  return {
    pageIndex: input.page.pageIndex,
    status: 'failed',
    pageType: 'unknown',
    orientationDeg: 0,
    languageHints: [input.language],
    width: input.page.width,
    height: input.page.height,
    words: [],
    lines: [],
    blocks: [],
    diagnostics: [
      {
        level: 'error',
        code: 'OCR_ENGINE_FAILED',
        pageIndex: input.page.pageIndex,
        message: input.message,
      },
    ],
    pageNumber: input.page.pageIndex + 1,
  };
}

function createFallbackWordNodesFromText(
  text: string,
  confidence: number | undefined,
): TesseractTextNode[] {
  return sanitizeOcrText(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({
      text: word,
      confidence,
    }));
}

function createFallbackWordRect(
  index: number,
  page: OcrEnginePageInput,
): PdfRect {
  const x = 72 + (index % 8) * 56;
  const y = Math.max(24, page.height - 96 - Math.floor(index / 8) * 18);

  return {
    x,
    y,
    width: 48,
    height: 14,
  };
}

function createFallbackLineRect(
  index: number,
  page: OcrEnginePageInput,
): PdfRect {
  return {
    x: 72,
    y: Math.max(24, page.height - 96 - index * 18),
    width: Math.max(1, page.width - 144),
    height: 14,
  };
}

function unionRectsOrFallback(
  rects: PdfRect[],
  fallback: PdfRect,
): PdfRect {
  const validRects = rects.filter((rect) =>
    Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width >= 0
    && rect.height >= 0,
  );

  if (validRects.length === 0) {
    return fallback;
  }

  const minX = Math.min(...validRects.map((rect) => rect.x));
  const minY = Math.min(...validRects.map((rect) => rect.y));
  const maxX = Math.max(...validRects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...validRects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function rectsIntersect(
  a: PdfRect,
  b: PdfRect,
): boolean {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  return a.x < bx2
    && ax2 > b.x
    && a.y < by2
    && ay2 > b.y;
}

function averageConfidence(
  values: number[],
): number {
  const finite = values.filter((value) => Number.isFinite(value));

  if (finite.length === 0) {
    return 0;
  }

  return clampOcrConfidence(
    finite.reduce((sum, value) => sum + value, 0) / finite.length,
  );
}

function sanitizeOcrText(
  text: string,
): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0) continue;
    if (code >= 1 && code <= 8) continue;
    if (code === 11 || code === 12) continue;
    if (code >= 14 && code <= 31) continue;
    result += text[i];
  }
  return result.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function inferImageMimeType(
  bytes: Uint8Array,
): string {
  if (
    bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    return 'image/png';
  }

  if (
    bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  return 'image/png';
}
