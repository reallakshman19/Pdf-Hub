import { pdfLib } from '@/core/pdf/lazyPdfLib';
import type {
  OcrAnyBlock,
  OcrDocumentResult,
  OcrLine,
  OcrPageResult,
  OcrWord,
} from '../types';
import type { OcrProjectPayloadV1 } from '../ocrProjectCodec';
import { createOcrProjectPayload } from '../ocrProjectCodec';
import {
  createOcrWriterInsertionQueue,
  createOcrWriterInsertionCandidate,
} from '../ocrWriterInsertion';
import type { WriterElementV2 } from '../../writer-v2/types';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;

export type OcrDemoFixtureId =
  | 'clean-text'
  | 'engineering-note'
  | 'simple-table';

export interface OcrDemoFixtureDescriptor {
  id: OcrDemoFixtureId;
  title: string;
  description: string;
  pageCount: number;
  hasTable: boolean;
  hasWriterCandidate: boolean;
}

export interface OcrDemoFixture {
  descriptor: OcrDemoFixtureDescriptor;
  documentFingerprint: string;
  fileName: string;
  pdfBytes: Uint8Array;
  ocrResult: OcrDocumentResult;
  projectPayload: OcrProjectPayloadV1;
}

export const OCR_DEMO_FIXTURES: OcrDemoFixtureDescriptor[] = [
  {
    id: 'clean-text',
    title: 'Clean Text OCR',
    description: 'One-page clean OCR text fixture for search, correction, and searchable PDF export.',
    pageCount: 1,
    hasTable: false,
    hasWriterCandidate: true,
  },
  {
    id: 'engineering-note',
    title: 'Engineering Note OCR',
    description: 'Piping-style OCR note with tag, line number, support reference, and review text.',
    pageCount: 1,
    hasTable: false,
    hasWriterCandidate: true,
  },
  {
    id: 'simple-table',
    title: 'Simple Table OCR',
    description: 'One-page OCR fixture with a small table block for table review and Writer insertion.',
    pageCount: 1,
    hasTable: true,
    hasWriterCandidate: true,
  },
];

export function listOcrDemoFixtureDescriptors(): OcrDemoFixtureDescriptor[] {
  return OCR_DEMO_FIXTURES.map((fixture) => ({ ...fixture }));
}

export function getOcrDemoFixtureDescriptor(
  id: OcrDemoFixtureId,
): OcrDemoFixtureDescriptor {
  const descriptor = OCR_DEMO_FIXTURES.find((fixture) => fixture.id === id);

  if (!descriptor) {
    throw new Error(`Unknown OCR demo fixture: ${id}`);
  }

  return { ...descriptor };
}

export async function createOcrDemoFixture(
  id: OcrDemoFixtureId,
): Promise<OcrDemoFixture> {
  const descriptor = getOcrDemoFixtureDescriptor(id);
  const documentFingerprint = `ocr-demo-${id}`;
  const fileName = `${documentFingerprint}.pdf`;

  const pdfBytes = await createOcrDemoPdfBytes(id);
  const ocrResult = createOcrDemoResult(id, documentFingerprint);

  const writerElement = createOcrDemoWriterElement(id, documentFingerprint);

  const projectPayload = createOcrProjectPayload({
    documentFingerprint,
    result: ocrResult,
    corrections: [],
    regions: [],
    writerInsertionQueue: createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: writerElement,
      }),
    ]),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  return {
    descriptor,
    documentFingerprint,
    fileName,
    pdfBytes,
    ocrResult,
    projectPayload,
  };
}

export async function createOcrDemoPdfBytes(
  id: OcrDemoFixtureId,
): Promise<Uint8Array> {
  const descriptor = getOcrDemoFixtureDescriptor(id);
  const lib = await pdfLib();
  const { PDFDocument, StandardFonts, rgb } = lib;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([595, 842]);

  page.drawText(descriptor.title, {
    x: 72,
    y: 760,
    size: 18,
    font: bold,
    color: rgb(0.05, 0.05, 0.05),
  });

  const lines = getDemoTextLines(id);

  lines.forEach((line, index) => {
    page.drawText(line, {
      x: 72,
      y: 720 - index * 24,
      size: 12,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  });

  if (id === 'simple-table') {
    drawDemoTable(page, font, bold, lib);
  }

  return pdf.save({
    useObjectStreams: false,
  });
}

export function createOcrDemoResult(
  id: OcrDemoFixtureId,
  documentFingerprint = `ocr-demo-${id}`,
): OcrDocumentResult {
  const page = createOcrDemoPageResult(id);

  return {
    documentFingerprint,
    createdAt: '2026-01-01T00:00:00.000Z',
    engineId: 'demo-fixture',
    profileId: 'clean-scan',
    pages: [page],
    diagnostics: [],
  };
}

export function createOcrDemoPageResult(
  id: OcrDemoFixtureId,
): OcrPageResult {
  const linesText = getDemoTextLines(id);

  const words: OcrWord[] = [];
  const lines: OcrLine[] = [];
  const blocks: OcrAnyBlock[] = [];

  linesText.forEach((text, lineIndex) => {
    const y = 720 - lineIndex * 24;
    const lineWords = text.split(/\s+/).filter(Boolean);
    const wordIds: string[] = [];

    let x = 72;

    lineWords.forEach((wordText, wordIndex) => {
      const width = Math.max(18, wordText.length * 7);
      const word: OcrWord = {
        id: `demo-word-${lineIndex + 1}-${wordIndex + 1}`,
        pageIndex: 0,
        text: wordText,
        normalizedText: wordText.toLowerCase(),
        confidence: 0.96,
        bbox: {
          x,
          y,
          width,
          height: 14,
        },
        lineId: `demo-line-${lineIndex + 1}`,
        blockId: 'demo-block-1',
      };

      words.push(word);
      wordIds.push(word.id);
      x += width + 8;
    });

    lines.push({
      id: `demo-line-${lineIndex + 1}`,
      pageIndex: 0,
      text,
      confidence: 0.96,
      bbox: {
        x: 72,
        y,
        width: Math.max(120, text.length * 7),
        height: 16,
      },
      wordIds,
    });
  });

  const blockBbox = {
    x: 72,
    y: 720 - Math.max(0, linesText.length - 1) * 24,
    width: 440,
    height: Math.max(32, linesText.length * 24),
  };

  blocks.push({
    id: 'demo-block-1',
    type: 'paragraph',
    pageIndex: 0,
    bbox: blockBbox,
    rect: blockBbox,
    text: linesText.join('\n'),
    confidence: 0.96,
    lineIds: lines.map((line) => line.id),
    wordIds: words.map((word) => word.id),
  });

  if (id === 'simple-table') {
    blocks.push(createDemoTableBlock());
  }

  return {
    pageIndex: 0,
    pageNumber: 1,
    status: 'success',
    pageType: id === 'simple-table' ? 'mixed' : 'scanned',
    orientationDeg: 0,
    languageHints: ['eng'],
    width: 595,
    height: 842,
    words,
    lines,
    blocks,
    diagnostics: [],
  };
}

export function createOcrDemoWriterElement(
  id: OcrDemoFixtureId,
  documentFingerprint = `ocr-demo-${id}`,
): WriterElementV2 {
  const text = getDemoTextLines(id).join('\n');

  if (id === 'simple-table') {
    return {
      id: 'demo-writer-table-1',
      documentFingerprint,
      pageIndex: 0,
      type: 'tableBox',
      rect: {
        x: 72,
        y: 500,
        width: 360,
        height: 120,
      },
      plainText: 'Tag | Description | Status\nPS-001 | Support near tie-in | Open\nPS-002 | Guide support | Closed',
      tableData: {
        hasHeaderRow: true,
        columns: [
          { id: 'col-1', label: 'Tag', width: 100 },
          { id: 'col-2', label: 'Description', width: 160 },
          { id: 'col-3', label: 'Status', width: 100 },
        ],
        rows: [
          {
            id: 'row-1',
            cells: [
              { id: 'cell-1-1', text: 'PS-001' },
              { id: 'cell-1-2', text: 'Support near tie-in' },
              { id: 'cell-1-3', text: 'Open' },
            ],
          },
          {
            id: 'row-2',
            cells: [
              { id: 'cell-2-1', text: 'PS-002' },
              { id: 'cell-2-2', text: 'Guide support' },
              { id: 'cell-2-3', text: 'Closed' },
            ],
          },
        ],
      },
      style: {
        zIndex: 10,
        fontFamily: 'Aptos',
        fontSize: 10,
        textColor: '#111827',
        backgroundColor: '#ffffff',
        borderColor: '#111827',
        borderWidth: 1,
        padding: 4,
        opacity: 1,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      locked: false,
      hidden: false,
    } as unknown as WriterElementV2;
  }

  return {
    id: `demo-writer-text-${id}`,
    documentFingerprint,
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 620,
      width: 420,
      height: 120,
    },
    plainText: text,
    style: {
      zIndex: 10,
      fontFamily: 'Aptos',
      fontSize: 11,
      textColor: '#111827',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 4,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  } as WriterElementV2;
}

export function getDemoTextLines(
  id: OcrDemoFixtureId,
): string[] {
  if (id === 'engineering-note') {
    return [
      'Line No: 12-P-1001-CS150',
      'Support: PS-001 near tie-in location',
      'Review note: verify guide gap before IFC issue',
      'Status: open for stress review',
    ];
  }

  if (id === 'simple-table') {
    return [
      'OCR table review fixture',
      'Below table shall be checked before Writer insertion',
    ];
  }

  return [
    'Writer OCR Demo',
    'This page verifies searchable text export',
    'The corrected OCR layer should remain selectable',
    'Ready for PDF Hub QA certification',
  ];
}

function createDemoTableBlock(): OcrAnyBlock {
  const tableBbox = {
    x: 72,
    y: 500,
    width: 360,
    height: 96,
  };

  return {
    id: 'demo-table-block-1',
    type: 'table',
    pageIndex: 0,
    bbox: tableBbox,
    rect: tableBbox,
    text: 'Tag Description Status\nPS-001 Support near tie-in Open\nPS-002 Guide support Closed',
    confidence: 0.94,
    lineIds: [],
    wordIds: [],
    rows: [
      {
        id: 'demo-table-row-1',
        cells: [
          {
            id: 'demo-cell-1-1',
            text: 'Tag',
            bbox: {
              x: 72,
              y: 570,
              width: 80,
              height: 24,
            },
            confidence: 0.96,
          },
          {
            id: 'demo-cell-1-2',
            text: 'Description',
            bbox: {
              x: 152,
              y: 570,
              width: 180,
              height: 24,
            },
            confidence: 0.96,
          },
          {
            id: 'demo-cell-1-3',
            text: 'Status',
            bbox: {
              x: 332,
              y: 570,
              width: 100,
              height: 24,
            },
            confidence: 0.96,
          },
        ],
      },
      {
        id: 'demo-table-row-2',
        cells: [
          {
            id: 'demo-cell-2-1',
            text: 'PS-001',
            bbox: {
              x: 72,
              y: 546,
              width: 80,
              height: 24,
            },
            confidence: 0.95,
          },
          {
            id: 'demo-cell-2-2',
            text: 'Support near tie-in',
            bbox: {
              x: 152,
              y: 546,
              width: 180,
              height: 24,
            },
            confidence: 0.95,
          },
          {
            id: 'demo-cell-2-3',
            text: 'Open',
            bbox: {
              x: 332,
              y: 546,
              width: 100,
              height: 24,
            },
            confidence: 0.95,
          },
        ],
      },
      {
        id: 'demo-table-row-3',
        cells: [
          {
            id: 'demo-cell-3-1',
            text: 'PS-002',
            bbox: {
              x: 72,
              y: 522,
              width: 80,
              height: 24,
            },
            confidence: 0.95,
          },
          {
            id: 'demo-cell-3-2',
            text: 'Guide support',
            bbox: {
              x: 152,
              y: 522,
              width: 180,
              height: 24,
            },
            confidence: 0.95,
          },
          {
            id: 'demo-cell-3-3',
            text: 'Closed',
            bbox: {
              x: 332,
              y: 522,
              width: 100,
              height: 24,
            },
            confidence: 0.95,
          },
        ],
      },
    ],
  } as OcrAnyBlock;
}

function drawDemoTable(
  page: ReturnType<import('pdf-lib').PDFDocument['addPage']>,
  font: Awaited<ReturnType<import('pdf-lib').PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<import('pdf-lib').PDFDocument['embedFont']>>,
  lib: PdfLibNs,
): void {
  const { rgb } = lib;
  const rows = [
    ['Tag', 'Description', 'Status'],
    ['PS-001', 'Support near tie-in', 'Open'],
    ['PS-002', 'Guide support', 'Closed'],
  ];

  const x = 72;
  const y = 590;
  const colWidths = [80, 180, 100];
  const rowHeight = 24;

  rows.forEach((row, rowIndex) => {
    let cursorX = x;

    row.forEach((cell, colIndex) => {
      page.drawRectangle({
        x: cursorX,
        y: y - rowIndex * rowHeight,
        width: colWidths[colIndex],
        height: rowHeight,
        borderWidth: 1,
        borderColor: rgb(0.2, 0.2, 0.2),
        color: rowIndex === 0 ? rgb(0.92, 0.92, 0.92) : rgb(1, 1, 1),
      });

      page.drawText(cell, {
        x: cursorX + 4,
        y: y - rowIndex * rowHeight + 7,
        size: 9,
        font: rowIndex === 0 ? bold : font,
        color: rgb(0.05, 0.05, 0.05),
      });

      cursorX += colWidths[colIndex];
    });
  });
}
