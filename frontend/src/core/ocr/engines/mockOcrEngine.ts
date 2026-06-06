import type { OcrEngine, OcrEngineInput } from './ocrEngineContract';
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

export const mockOcrEngine: OcrEngine = {
  id: 'mock',
  label: 'Mock OCR Engine',
  supportsTables: true,
  supportsLayout: true,
  supportsSearchablePdf: false,

  async recognize(input: OcrEngineInput): Promise<OcrDocumentResult> {
    const pages = input.pages.map((page) =>
      createMockPageResult({
        pageIndex: page.pageIndex,
        width: page.width,
        height: page.height,
        detectTables: input.profile.detectTables,
      }),
    );

    const result: OcrDocumentResult = {
      documentFingerprint: input.documentFingerprint,
      createdAt: '2026-01-01T00:00:00.000Z',
      engineId: 'mock',
      profileId: input.profile.id,
      pages,
      diagnostics: [
        {
          level: 'info',
          code: 'MOCK_ENGINE_USED',
          message: 'Mock OCR engine produced deterministic OCR output.',
        },
      ],
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

function createMockPageResult(input: {
  pageIndex: number;
  width: number;
  height: number;
  detectTables: boolean;
}): OcrPageResult {
  const headingWords = createWords({
    pageIndex: input.pageIndex,
    blockId: 'block-heading',
    lineId: 'line-heading',
    words: ['Writer', 'OCR', 'Demo'],
    startX: 72,
    startY: input.height - 96,
    confidence: 0.98,
  });

  const paragraphWords = createWords({
    pageIndex: input.pageIndex,
    blockId: 'block-paragraph',
    lineId: 'line-paragraph',
    words: ['This', 'scan', 'contains', 'editable', 'text'],
    startX: 72,
    startY: input.height - 140,
    confidence: 0.94,
  });

  const lowConfidenceWords = createWords({
    pageIndex: input.pageIndex,
    blockId: 'block-low-confidence',
    lineId: 'line-low-confidence',
    words: ['P1pe', 'Support'],
    startX: 72,
    startY: input.height - 184,
    confidence: 0.62,
  });

  const words = [
    ...headingWords,
    ...paragraphWords,
    ...lowConfidenceWords,
  ];

  const lines: OcrLine[] = [
    createLine({
      id: 'line-heading',
      pageIndex: input.pageIndex,
      words: headingWords,
    }),
    createLine({
      id: 'line-paragraph',
      pageIndex: input.pageIndex,
      words: paragraphWords,
    }),
    createLine({
      id: 'line-low-confidence',
      pageIndex: input.pageIndex,
      words: lowConfidenceWords,
    }),
  ];

  const blocks: OcrAnyBlock[] = [
    {
      id: 'block-heading',
      type: 'heading',
      pageIndex: input.pageIndex,
      bbox: unionWordRects(headingWords),
      rect: unionWordRects(headingWords),
      text: headingWords.map((word) => word.text).join(' '),
      confidence: averageConfidence(headingWords),
      lineIds: ['line-heading'],
      wordIds: headingWords.map((word) => word.id),
    },
    {
      id: 'block-paragraph',
      type: 'paragraph',
      pageIndex: input.pageIndex,
      bbox: unionWordRects(paragraphWords),
      rect: unionWordRects(paragraphWords),
      text: paragraphWords.map((word) => word.text).join(' '),
      confidence: averageConfidence(paragraphWords),
      lineIds: ['line-paragraph'],
      wordIds: paragraphWords.map((word) => word.id),
    },
    {
      id: 'block-low-confidence',
      type: 'paragraph',
      pageIndex: input.pageIndex,
      bbox: unionWordRects(lowConfidenceWords),
      rect: unionWordRects(lowConfidenceWords),
      text: lowConfidenceWords.map((word) => word.text).join(' '),
      confidence: averageConfidence(lowConfidenceWords),
      lineIds: ['line-low-confidence'],
      wordIds: lowConfidenceWords.map((word) => word.id),
    },
  ];

  if (input.detectTables) {
    blocks.push({
      id: 'block-table',
      type: 'table',
      pageIndex: input.pageIndex,
      bbox: {
        x: 72,
        y: input.height - 360,
        width: 360,
        height: 120,
      },
      rect: {
        x: 72,
        y: input.height - 360,
        width: 360,
        height: 120,
      },
      text: 'Item Quantity Pipe 2 Valve 1',
      confidence: 0.91,
      lineIds: [],
      wordIds: [],
      rows: [
        {
          id: 'row-header',
          cells: [
            {
              id: 'cell-h1',
              text: 'Item',
              confidence: 0.96,
              bbox: { x: 72, y: input.height - 280, width: 180, height: 30 },
            },
            {
              id: 'cell-h2',
              text: 'Quantity',
              confidence: 0.96,
              bbox: { x: 252, y: input.height - 280, width: 180, height: 30 },
            },
          ],
        },
        {
          id: 'row-1',
          cells: [
            {
              id: 'cell-a1',
              text: 'Pipe',
              confidence: 0.91,
              bbox: { x: 72, y: input.height - 310, width: 180, height: 30 },
            },
            {
              id: 'cell-b1',
              text: '2',
              confidence: 0.93,
              bbox: { x: 252, y: input.height - 310, width: 180, height: 30 },
            },
          ],
        },
        {
          id: 'row-2',
          cells: [
            {
              id: 'cell-a2',
              text: 'Valve',
              confidence: 0.88,
              bbox: { x: 72, y: input.height - 340, width: 180, height: 30 },
            },
            {
              id: 'cell-b2',
              text: '1',
              confidence: 0.9,
              bbox: { x: 252, y: input.height - 340, width: 180, height: 30 },
            },
          ],
        },
      ],
    });
  }

  return {
    pageIndex: input.pageIndex,
    status: 'success',
    pageType: input.detectTables ? 'tableHeavy' : 'scanned',
    orientationDeg: 0,
    languageHints: ['eng'],
    width: input.width,
    height: input.height,
    words,
    lines,
    blocks,
    diagnostics: lowConfidenceWords.length > 0
      ? [
          {
            level: 'warning',
            code: 'LOW_CONFIDENCE_WORDS',
            pageIndex: input.pageIndex,
            message: 'Mock OCR result contains low-confidence words for review workflow testing.',
          },
        ]
      : [],

    // Compatibility field:
    pageNumber: input.pageIndex + 1,
  };
}

function createWords(input: {
  pageIndex: number;
  blockId: string;
  lineId: string;
  words: string[];
  startX: number;
  startY: number;
  confidence: number;
}): OcrWord[] {
  let x = input.startX;

  return input.words.map((text, index) => {
    const width = Math.max(24, text.length * 7);
    const word: OcrWord = {
      id: `${input.lineId}-word-${index + 1}`,
      pageIndex: input.pageIndex,
      text,
      normalizedText: normalizeOcrText(text),
      confidence: clampOcrConfidence(input.confidence),
      bbox: {
        x,
        y: input.startY,
        width,
        height: 14,
      },
      lineId: input.lineId,
      blockId: input.blockId,
    };

    x += width + 8;

    return word;
  });
}

function createLine(input: {
  id: string;
  pageIndex: number;
  words: OcrWord[];
}): OcrLine {
  return {
    id: input.id,
    pageIndex: input.pageIndex,
    text: input.words.map((word) => word.text).join(' '),
    confidence: averageConfidence(input.words),
    bbox: unionWordRects(input.words),
    rect: unionWordRects(input.words),
    wordIds: input.words.map((word) => word.id),
    blockId: input.words[0]?.blockId,
  };
}

function unionWordRects(words: OcrWord[]) {
  const minX = Math.min(...words.map((word) => word.bbox.x));
  const minY = Math.min(...words.map((word) => word.bbox.y));
  const maxX = Math.max(...words.map((word) => word.bbox.x + word.bbox.width));
  const maxY = Math.max(...words.map((word) => word.bbox.y + word.bbox.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function averageConfidence(words: OcrWord[]): number {
  if (words.length === 0) {
    return 0;
  }

  return clampOcrConfidence(
    words.reduce((sum, word) => sum + word.confidence, 0) / words.length,
  );
}
