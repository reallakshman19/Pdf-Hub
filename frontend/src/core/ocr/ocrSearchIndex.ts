import type { PdfRect } from '../writer-v2/types';
import type { OcrCorrection } from './ocrCorrections';
import type {
  OcrAnyBlock,
  OcrDocumentResult,
  OcrLine,
  OcrPageResult,
  OcrWord,
} from './types';
import { normalizeOcrText } from './types';

export type OcrSearchIndexSource =
  | 'ocrWord'
  | 'ocrLine'
  | 'ocrBlock'
  | 'ocrTableCell'
  | 'ocrCorrection';

export type OcrSearchCorrection = OcrCorrection;

export interface OcrSearchIndexItem {
  id: string;
  documentFingerprint: string;
  pageIndex: number;
  source: OcrSearchIndexSource;
  targetId: string;
  text: string;
  normalizedText: string;
  confidence?: number;
  bbox?: PdfRect;
  blockType?: string;
}

export interface OcrSearchIndex {
  documentFingerprint: string;
  items: OcrSearchIndexItem[];
  builtAt: string;
}

export interface OcrSearchQuery {
  text: string;
  pageIndex?: number;
  source?: OcrSearchIndexSource;
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
}

export interface OcrSearchMatch {
  item: OcrSearchIndexItem;
  score: number;
  ranges: Array<{
    start: number;
    end: number;
  }>;
}

export interface BuildOcrSearchIndexInput {
  document: OcrDocumentResult;
  corrections?: OcrSearchCorrection[];
  includeWords?: boolean;
  includeLines?: boolean;
  includeBlocks?: boolean;
  includeTableCells?: boolean;
  includeCorrections?: boolean;
  now?: string;
}

export function buildOcrSearchIndex(
  input: BuildOcrSearchIndexInput,
): OcrSearchIndex {
  const includeWords = input.includeWords ?? true;
  const includeLines = input.includeLines ?? true;
  const includeBlocks = input.includeBlocks ?? true;
  const includeTableCells = input.includeTableCells ?? true;
  const includeCorrections = input.includeCorrections ?? true;

  const correctionsByTargetId = new Map(
    (input.corrections ?? []).map((correction) => [
      correction.targetId,
      correction,
    ]),
  );

  const items: OcrSearchIndexItem[] = [];

  for (const page of input.document.pages) {
    if (includeWords) {
      items.push(
        ...(page.words ?? []).map((word) =>
          wordToSearchItem(
            input.document.documentFingerprint,
            page,
            word,
            correctionsByTargetId.get(word.id),
          ),
        ),
      );
    }

    if (includeLines) {
      items.push(
        ...(page.lines ?? []).map((line) =>
          lineToSearchItem(
            input.document.documentFingerprint,
            page,
            line,
            correctionsByTargetId.get(line.id),
          ),
        ),
      );
    }

    if (includeBlocks) {
      items.push(
        ...page.blocks
          .filter((block) => block.type !== 'table')
          .map((block) =>
            blockToSearchItem(
              input.document.documentFingerprint,
              page,
              block,
              correctionsByTargetId.get(block.id),
            ),
          ),
      );
    }

    if (includeTableCells) {
      items.push(
        ...page.blocks.flatMap((block) => {
          if (block.type !== 'table') return [];

          return (block.rows ?? []).flatMap((row) =>
            row.cells.map((cell) => {
              const correction = correctionsByTargetId.get(cell.id);

              return {
                id: `ocr-table-cell:${page.pageIndex ?? 0}:${cell.id}`,
                documentFingerprint: input.document.documentFingerprint,
                pageIndex: page.pageIndex ?? 0,
                source: 'ocrTableCell' as const,
                targetId: cell.id,
                text: correction?.correctedText ?? cell.text,
                normalizedText: normalizeOcrText(
                  correction?.correctedText ?? cell.text,
                ),
                confidence: cell.confidence,
                bbox: cell.bbox,
                blockType: 'table',
              };
            }),
          );
        }),
      );
    }
  }

  if (includeCorrections) {
    items.push(
      ...(input.corrections ?? []).map((correction) =>
        correctionToSearchItem(correction),
      ),
    );
  }

  return {
    documentFingerprint: input.document.documentFingerprint,
    items: dedupeSearchItems(items),
    builtAt: input.now ?? new Date().toISOString(),
  };
}

export function searchOcrIndex(
  index: OcrSearchIndex,
  query: OcrSearchQuery,
): OcrSearchMatch[] {
  const normalizedQuery = normalizeOcrText(query.text);

  if (!normalizedQuery) {
    return [];
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const matches: OcrSearchMatch[] = [];

  for (const item of index.items) {
    if (query.pageIndex !== undefined && item.pageIndex !== query.pageIndex) {
      continue;
    }

    if (query.source && item.source !== query.source) {
      continue;
    }

    if (
      query.minConfidence !== undefined
      && (item.confidence ?? 1) < query.minConfidence
    ) {
      continue;
    }

    if (
      query.maxConfidence !== undefined
      && (item.confidence ?? 1) > query.maxConfidence
    ) {
      continue;
    }

    const ranges = findNormalizedRanges(item.normalizedText, normalizedQuery);

    if (ranges.length > 0) {
      matches.push({
        item,
        ranges,
        score: scoreExactMatch(item.normalizedText, normalizedQuery),
      });
      continue;
    }

    const tokenHitCount = tokens.filter((token) =>
      item.normalizedText.includes(token),
    ).length;

    if (tokenHitCount > 0) {
      matches.push({
        item,
        ranges: [],
        score: tokenHitCount / tokens.length,
      });
    }
  }

  matches.sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (scoreDelta !== 0) return scoreDelta;

    const pageDelta = a.item.pageIndex - b.item.pageIndex;
    if (pageDelta !== 0) return pageDelta;

    const ay = a.item.bbox?.y ?? 0;
    const by = b.item.bbox?.y ?? 0;
    const yDelta = by - ay;
    if (yDelta !== 0) return yDelta;

    const ax = a.item.bbox?.x ?? 0;
    const bx = b.item.bbox?.x ?? 0;
    return ax - bx;
  });

  return query.limit ? matches.slice(0, query.limit) : matches;
}

export function getOcrSearchItemsForPage(
  index: OcrSearchIndex,
  pageIndex: number,
): OcrSearchIndexItem[] {
  return index.items.filter((item) => item.pageIndex === pageIndex);
}

export function getLowConfidenceSearchItems(
  index: OcrSearchIndex,
  threshold = 0.7,
): OcrSearchIndexItem[] {
  return index.items.filter((item) =>
    item.confidence !== undefined && item.confidence < threshold,
  );
}

function wordToSearchItem(
  documentFingerprint: string,
  page: OcrPageResult,
  word: OcrWord,
  correction?: OcrSearchCorrection,
): OcrSearchIndexItem {
  const text = correction?.correctedText ?? word.text;

  return {
    id: `ocr-word:${page.pageIndex ?? 0}:${word.id}`,
    documentFingerprint,
    pageIndex: page.pageIndex ?? 0,
    source: correction ? 'ocrCorrection' : 'ocrWord',
    targetId: word.id,
    text,
    normalizedText: normalizeOcrText(text),
    confidence: word.confidence,
    bbox: word.bbox,
  };
}

function lineToSearchItem(
  documentFingerprint: string,
  page: OcrPageResult,
  line: OcrLine,
  correction?: OcrSearchCorrection,
): OcrSearchIndexItem {
  const text = correction?.correctedText ?? line.text;

  return {
    id: `ocr-line:${page.pageIndex ?? 0}:${line.id}`,
    documentFingerprint,
    pageIndex: page.pageIndex ?? 0,
    source: correction ? 'ocrCorrection' : 'ocrLine',
    targetId: line.id,
    text,
    normalizedText: normalizeOcrText(text),
    confidence: line.confidence,
    bbox: line.bbox,
  };
}

function blockToSearchItem(
  documentFingerprint: string,
  page: OcrPageResult,
  block: OcrAnyBlock,
  correction?: OcrSearchCorrection,
): OcrSearchIndexItem {
  const text = correction?.correctedText ?? block.text ?? '';

  return {
    id: `ocr-block:${page.pageIndex ?? 0}:${block.id}`,
    documentFingerprint,
    pageIndex: page.pageIndex ?? 0,
    source: correction ? 'ocrCorrection' : 'ocrBlock',
    targetId: block.id,
    text,
    normalizedText: normalizeOcrText(text),
    confidence: block.confidence,
    bbox: block.bbox,
    blockType: block.type,
  };
}

function correctionToSearchItem(
  correction: OcrSearchCorrection,
): OcrSearchIndexItem {
  return {
    id: `ocr-correction:${correction.pageIndex}:${correction.id}`,
    documentFingerprint: correction.documentFingerprint,
    pageIndex: correction.pageIndex,
    source: 'ocrCorrection',
    targetId: correction.targetId,
    text: correction.correctedText,
    normalizedText: normalizeOcrText(correction.correctedText),
    bbox: correction.bbox,
  };
}

function dedupeSearchItems(
  items: OcrSearchIndexItem[],
): OcrSearchIndexItem[] {
  const seen = new Set<string>();
  const result: OcrSearchIndexItem[] = [];

  for (const item of items) {
    const key = `${item.source}:${item.pageIndex}:${item.targetId}:${item.normalizedText}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function findNormalizedRanges(
  normalizedText: string,
  normalizedQuery: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  while (cursor < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedQuery, cursor);

    if (index === -1) {
      break;
    }

    ranges.push({
      start: index,
      end: index + normalizedQuery.length,
    });

    cursor = index + normalizedQuery.length;
  }

  return ranges;
}

function scoreExactMatch(
  normalizedText: string,
  normalizedQuery: string,
): number {
  if (normalizedText === normalizedQuery) {
    return 1;
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    return 0.95;
  }

  return 0.9;
}
