import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { useSessionStore } from '@/core/session/store';
import type {
  PdfRect,
  WriterElementV2,
  WriterReviewMetadata,
  WriterTableData,
} from './types';
import { createRichTextBoxElement } from './writerElementFactory';
import { useWriterV2Store } from './writerV2Store';

export interface WriterLegacyConsolidationResult {
  changed: boolean;
  id?: string;
  convertedCount: number;
  message: string;
}

const LEGACY_CONSOLIDATABLE_TYPES = new Set<WriterElementV2['type']>([
  'textCallout',
  'reviewLabel',
  'textStamp',
  'richNote',
  'tableBox',
  'imageBox',
]);

export async function consolidateCurrentPageLegacyWriterObjects(): Promise<WriterLegacyConsolidationResult> {
  const session = useSessionStore.getState();
  const sourceBytes = session.workingBytes ?? session.originalBytes;

  if (!sourceBytes || session.pageCount <= 0) {
    return {
      changed: false,
      convertedCount: 0,
      message: 'Open a PDF before consolidating Writer objects.',
    };
  }

  const { PDFDocument } = await pdfLib();
  const pdf = await PDFDocument.load(sourceBytes);
  const pageIndex = Math.max(
    0,
    Math.min(session.viewState.currentPage - 1, pdf.getPageCount() - 1),
  );

  return consolidateLegacyWriterObjectsOnPage(pageIndex, sourceBytes);
}

export async function consolidateLegacyWriterObjectsOnPage(
  pageIndex: number,
  sourceBytes: Uint8Array,
): Promise<WriterLegacyConsolidationResult> {
  const store = useWriterV2Store.getState();
  const candidates = store.elements
    .filter((element) =>
      element.pageIndex === pageIndex &&
      !element.hidden &&
      !element.locked &&
      LEGACY_CONSOLIDATABLE_TYPES.has(element.type),
    )
    .sort((a, b) => {
      const topDelta = (b.rect.y + b.rect.height) - (a.rect.y + a.rect.height);
      if (Math.abs(topDelta) > 2) return topDelta;
      return a.rect.x - b.rect.x;
    });

  if (candidates.length === 0) {
    return {
      changed: false,
      convertedCount: 0,
      message: 'No legacy Writer objects found on this page.',
    };
  }

  const { PDFDocument } = await pdfLib();
  const pdf = await PDFDocument.load(sourceBytes);
  const page = pdf.getPage(Math.max(0, Math.min(pageIndex, pdf.getPageCount() - 1)));
  const pageSize = page.getSize();
  const boundingRect = clampRectToPage(
    expandRect(unionRects(candidates.map((element) => element.rect)), 18),
    pageSize.width,
    pageSize.height,
  );
  const richBoxRect = normalizeRichBoxRect(boundingRect, pageSize.width, pageSize.height);
  const assetById = new Map(store.assetRecords.map((asset) => [asset.id, asset]));
  const editorStateJson = createConsolidatedEditorStateJson(candidates, assetById);
  const plainText = candidates
    .map((element) => element.plainText ?? element.type)
    .filter(Boolean)
    .join('\n');
  const maxZIndex = store.elements.reduce(
    (max, element) => Math.max(max, element.style.zIndex),
    0,
  );
  const documentFingerprint =
    store.currentDocumentFingerprint ??
    useSessionStore.getState().documentKey ??
    useSessionStore.getState().fileName ??
    'writer-v2-unsaved-document';
  const consolidated = createRichTextBoxElement({
    documentFingerprint,
    pageIndex,
    rect: richBoxRect,
    text: plainText,
    editorStateJson,
    zIndex: maxZIndex + 1,
  });

  const now = new Date().toISOString();
  const review = mergeReviewMetadata(candidates, now);

  for (const element of candidates) {
    store.dispatchWriterCommand({
      type: 'UPDATE_WRITER_ELEMENT',
      id: element.id,
      patch: {
        hidden: true,
        updatedAt: now,
      },
    });
  }

  const addResult = useWriterV2Store.getState().dispatchWriterCommand({
    type: 'ADD_WRITER_ELEMENT',
    element: {
      ...consolidated,
      review,
      style: {
        ...consolidated.style,
        backgroundColor: '#ffffff',
        borderColor: '#2563eb',
        borderWidth: 1,
        padding: 12,
        opacity: 1,
        zIndex: maxZIndex + 1,
      },
    },
  });

  if (!addResult.changed) {
    return {
      changed: false,
      convertedCount: 0,
      message: addResult.reason ?? 'Failed to add consolidated rich box.',
    };
  }

  useWriterV2Store.getState().beginEditingWriterElement(consolidated.id);

  return {
    changed: true,
    id: consolidated.id,
    convertedCount: candidates.length,
    message: `Consolidated ${candidates.length} legacy Writer object(s) into one rich box.`,
  };
}

function createConsolidatedEditorStateJson(
  elements: WriterElementV2[],
  assetById: Map<string, { dataUrl?: string; width?: number; height?: number }>,
): string {
  return JSON.stringify({
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: elements.flatMap((element) => legacyElementToLexicalNodes(element, assetById)),
    },
  });
}

function legacyElementToLexicalNodes(
  element: WriterElementV2,
  assetById: Map<string, { dataUrl?: string; width?: number; height?: number }>,
): Record<string, unknown>[] {
  if (element.type === 'tableBox') {
    return tableDataToLexicalNodes(element.tableData);
  }

  if (element.type === 'imageBox') {
    const assetId = element.imageAssetId ?? element.assetIds?.[0];
    const asset = assetId ? assetById.get(assetId) : null;

    if (!asset?.dataUrl) {
      return [
        paragraphNode(`Image placeholder: ${element.plainText ?? assetId ?? element.id}`),
      ];
    }

    return [
      {
        type: 'inline-image',
        version: 1,
        src: asset.dataUrl,
        altText: element.plainText ?? 'Image',
        width: Math.max(60, Math.min(element.rect.width, asset.width ?? element.rect.width)),
        height: Math.max(40, Math.min(element.rect.height, asset.height ?? element.rect.height)),
        caption: element.plainText,
      },
    ];
  }

  if (element.type === 'textStamp') {
    return [
      headingNode(element.plainText ?? 'Stamp', 'h2', styleFromElement(element)),
    ];
  }

  if (element.type === 'reviewLabel') {
    return [
      headingNode(element.plainText ?? 'Review', 'h3', styleFromElement(element)),
      paragraphNode(reviewLine(element.review)),
      paragraphNode('Comment: '),
    ];
  }

  if (element.type === 'richNote') {
    return [
      headingNode(element.plainText ?? 'Note', 'h3', styleFromElement(element)),
      paragraphNode('Details: '),
    ];
  }

  if (element.type === 'textCallout') {
    return [
      paragraphNode(`Callout: ${element.plainText ?? ''}`, styleFromElement(element)),
      paragraphNode('Resolution: '),
    ];
  }

  return [paragraphNode(element.plainText ?? '')];
}

function tableDataToLexicalNodes(tableData?: WriterTableData): Record<string, unknown>[] {
  if (!tableData || tableData.rows.length === 0) {
    return [paragraphNode('Empty table')];
  }

  const headerRow = {
    type: 'tablerow',
    version: 1,
    children: tableData.columns.map((column) => ({
      type: 'tablecell',
      version: 1,
      children: [paragraphNode(column.label ?? '')],
    })),
  };

  const rows = tableData.rows.map((row) => ({
    type: 'tablerow',
    version: 1,
    children: row.cells.map((cell) => ({
      type: 'tablecell',
      version: 1,
      colSpan: cell.colSpan,
      rowSpan: cell.rowSpan,
      children: [paragraphNode(cell.text)],
    })),
  }));

  return [
    {
      type: 'table',
      version: 1,
      children: [headerRow, ...rows],
    },
  ];
}

function headingNode(
  text: string,
  tag: 'h1' | 'h2' | 'h3',
  style = '',
): Record<string, unknown> {
  return {
    type: 'heading',
    tag,
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [textNode(text, style)],
  };
}

function paragraphNode(text: string, style = ''): Record<string, unknown> {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: text ? [textNode(text, style)] : [],
  };
}

function textNode(text: string, style = ''): Record<string, unknown> {
  return {
    type: 'text',
    version: 1,
    text,
    format: 0,
    style,
    mode: 'normal',
    detail: 0,
  };
}

function styleFromElement(element: WriterElementV2): string {
  const parts: string[] = [];

  if (element.style.textColor) {
    parts.push(`color: ${element.style.textColor}`);
  }

  if (element.style.fontSize) {
    parts.push(`font-size: ${element.style.fontSize}px`);
  }

  if (element.style.backgroundColor && element.style.backgroundColor !== 'transparent') {
    parts.push(`background-color: ${element.style.backgroundColor}`);
  }

  return parts.join('; ');
}

function reviewLine(review?: WriterReviewMetadata): string {
  if (!review) return 'Status: open';
  return `Status: ${review.status} | Priority: ${review.priority} | Category: ${review.category}`;
}

function mergeReviewMetadata(
  elements: WriterElementV2[],
  now: string,
): WriterReviewMetadata | undefined {
  const first = elements.find((element) => element.review)?.review;

  if (!first) return undefined;

  return {
    ...first,
    commentId: first.commentId ?? createReviewId(),
    createdAt: first.createdAt ?? now,
    updatedAt: now,
  };
}

function unionRects(rects: PdfRect[]): PdfRect {
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function expandRect(rect: PdfRect, amount: number): PdfRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function normalizeRichBoxRect(
  rect: PdfRect,
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  const width = Math.min(Math.max(rect.width, 320), Math.max(120, pageWidth - 48));
  const height = Math.min(Math.max(rect.height, 180), Math.max(120, pageHeight - 48));

  return clampRectToPage(
    {
      x: rect.x,
      y: rect.y,
      width,
      height,
    },
    pageWidth,
    pageHeight,
  );
}

function clampRectToPage(
  rect: PdfRect,
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  const width = Math.min(rect.width, pageWidth);
  const height = Math.min(rect.height, pageHeight);

  return {
    x: Math.max(0, Math.min(rect.x, pageWidth - width)),
    y: Math.max(0, Math.min(rect.y, pageHeight - height)),
    width,
    height,
  };
}

function createReviewId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `review-${globalThis.crypto.randomUUID()}`;
  }

  return `review-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}
