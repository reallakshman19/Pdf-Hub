import type { WriterElementV2 } from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '../writerV2Store';
import {
  editorStateToPdfBlocks,
  type PdfBlock,
} from './richTextRenderer';
import { estimateRichContentMetrics } from './richContentMetrics';

export type WriterExportPreflightSeverity = 'error' | 'warning' | 'info';

export type WriterExportPreflightIssueCode =
  | 'NO_PDF_OPEN'
  | 'NO_WRITER_OBJECTS'
  | 'NO_VISIBLE_WRITER_OBJECTS'
  | 'OBJECT_OUTSIDE_PAGE_RANGE'
  | 'OBJECT_ZERO_SIZE'
  | 'OBJECT_OUTSIDE_PAGE_BOUNDS'
  | 'OBJECT_LOW_OPACITY'
  | 'EMPTY_TEXT_OBJECT'
  | 'MISSING_IMAGE_ASSET'
  | 'EMPTY_IMAGE_OBJECT'
  | 'EMPTY_TABLE_OBJECT'
  | 'TABLE_SHAPE_MISMATCH'
  | 'RICH_IMAGE_EMPTY_SOURCE'
  | 'RICH_IMAGE_UNSUPPORTED_FORMAT'
  | 'RICH_TABLE_EMPTY'
  | 'RICH_TABLE_LARGE'
  | 'RICH_CONTENT_MAY_CLIP'
  | 'HIDDEN_OBJECTS_EXCLUDED';

export interface WriterExportPreflightIssue {
  code: WriterExportPreflightIssueCode;
  severity: WriterExportPreflightSeverity;
  message: string;
  elementId?: string;
  pageIndex?: number;
}

export interface WriterExportPreflightPageSize {
  pageIndex: number;
  width: number;
  height: number;
}

export interface WriterExportPreflightInput {
  sourceBytes?: Uint8Array | null;
  pageCount: number;
  elements: WriterElementV2[];
  assets: WriterAssetRecordV2[];
}

export interface WriterExportPreflightResult {
  ok: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  pageCount: number;
  totalElementCount: number;
  visibleElementCount: number;
  hiddenElementCount: number;
  textElementCount: number;
  tableElementCount: number;
  imageElementCount: number;
  assetCount: number;
  issues: WriterExportPreflightIssue[];
  byPage: Array<{
    pageIndex: number;
    visibleElementCount: number;
    hiddenElementCount: number;
  }>;
}

const TEXT_TYPES = new Set<WriterElementV2['type']>([
  'richTextBox',
  'textCallout',
  'textStamp',
  'reviewLabel',
  'richNote',
]);

export async function runCurrentWriterExportPreflight(): Promise<WriterExportPreflightResult> {
  const session = useSessionStore.getState();
  const writer = useWriterV2Store.getState();

  return runWriterExportPreflight({
    sourceBytes: session.workingBytes ?? session.originalBytes,
    pageCount: session.pageCount,
    elements: writer.elements,
    assets: writer.assetRecords,
  });
}

export async function runWriterExportPreflight(
  input: WriterExportPreflightInput,
): Promise<WriterExportPreflightResult> {
  const issues: WriterExportPreflightIssue[] = [];

  if (!input.sourceBytes || input.pageCount <= 0) {
    issues.push({
      code: 'NO_PDF_OPEN',
      severity: 'error',
      message: 'Open a PDF before exporting Writer content.',
    });
  }

  const pageSizes = input.sourceBytes
    ? await safeReadPageSizes(input.sourceBytes)
    : [];

  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const hiddenElements = input.elements.filter((element) => element.hidden);
  const visibleElements = input.elements.filter((element) => !element.hidden);

  if (input.elements.length === 0) {
    issues.push({
      code: 'NO_WRITER_OBJECTS',
      severity: 'info',
      message: 'No Writer V2 objects exist in this document.',
    });
  }

  if (input.elements.length > 0 && visibleElements.length === 0) {
    issues.push({
      code: 'NO_VISIBLE_WRITER_OBJECTS',
      severity: 'warning',
      message: 'All Writer V2 objects are hidden; flattened export will not show Writer content.',
    });
  }

  if (hiddenElements.length > 0) {
    issues.push({
      code: 'HIDDEN_OBJECTS_EXCLUDED',
      severity: 'info',
      message: `${hiddenElements.length} hidden Writer object(s) will be excluded from flattened export.`,
    });
  }

  for (const element of input.elements) {
    collectElementIssues({
      element,
      assetsById,
      pageCount: input.pageCount,
      pageSize: pageSizes.find((page) => page.pageIndex === element.pageIndex),
      issues,
    });
  }

  const byPage = Array.from({ length: Math.max(0, input.pageCount) }, (_, pageIndex) => {
    const pageElements = input.elements.filter((element) => element.pageIndex === pageIndex);

    return {
      pageIndex,
      visibleElementCount: pageElements.filter((element) => !element.hidden).length,
      hiddenElementCount: pageElements.filter((element) => element.hidden).length,
    };
  });

  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const hasWarnings = issues.some((issue) => issue.severity === 'warning');

  return {
    ok: !hasErrors,
    hasErrors,
    hasWarnings,
    pageCount: input.pageCount,
    totalElementCount: input.elements.length,
    visibleElementCount: visibleElements.length,
    hiddenElementCount: hiddenElements.length,
    textElementCount: input.elements.filter((element) => TEXT_TYPES.has(element.type)).length,
    tableElementCount: input.elements.filter((element) => element.type === 'tableBox').length,
    imageElementCount: input.elements.filter((element) => element.type === 'imageBox').length,
    assetCount: input.assets.length,
    issues,
    byPage,
  };
}

function collectElementIssues({
  element,
  assetsById,
  pageCount,
  pageSize,
  issues,
}: {
  element: WriterElementV2;
  assetsById: Map<string, WriterAssetRecordV2>;
  pageCount: number;
  pageSize?: WriterExportPreflightPageSize;
  issues: WriterExportPreflightIssue[];
}): void {
  if (element.pageIndex < 0 || element.pageIndex >= pageCount) {
    issues.push({
      code: 'OBJECT_OUTSIDE_PAGE_RANGE',
      severity: 'error',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer object ${shortId(element.id)} targets page ${element.pageIndex + 1}, outside document page range.`,
    });
  }

  if (element.rect.width <= 0 || element.rect.height <= 0) {
    issues.push({
      code: 'OBJECT_ZERO_SIZE',
      severity: 'error',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer object ${shortId(element.id)} has zero or negative size.`,
    });
  }

  if (pageSize && isOutsidePageBounds(element, pageSize)) {
    issues.push({
      code: 'OBJECT_OUTSIDE_PAGE_BOUNDS',
      severity: 'warning',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer object ${shortId(element.id)} is partially outside page ${element.pageIndex + 1}.`,
    });
  }

  if ((element.style.opacity ?? 1) > 0 && (element.style.opacity ?? 1) < 0.05) {
    issues.push({
      code: 'OBJECT_LOW_OPACITY',
      severity: 'warning',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer object ${shortId(element.id)} has very low opacity and may be invisible after export.`,
    });
  }

  if (TEXT_TYPES.has(element.type) && !element.plainText?.trim() && !element.editorStateJson?.trim()) {
    issues.push({
      code: 'EMPTY_TEXT_OBJECT',
      severity: 'warning',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer text object ${shortId(element.id)} is empty.`,
    });
  }

  if (TEXT_TYPES.has(element.type)) {
    collectRichContentIssues(element, issues);
  }

  if (element.type === 'imageBox') {
    collectImageIssues(element, assetsById, issues);
  }

  if (element.type === 'tableBox') {
    collectTableIssues(element, issues);
  }
}

function collectImageIssues(
  element: WriterElementV2,
  assetsById: Map<string, WriterAssetRecordV2>,
  issues: WriterExportPreflightIssue[],
): void {
  const assetId = element.imageAssetId ?? element.assetIds?.[0];

  if (!assetId) {
    issues.push({
      code: 'EMPTY_IMAGE_OBJECT',
      severity: 'error',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer image object ${shortId(element.id)} has no image asset assigned.`,
    });
    return;
  }

  if (!assetsById.has(assetId)) {
    issues.push({
      code: 'MISSING_IMAGE_ASSET',
      severity: 'error',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer image object ${shortId(element.id)} references missing asset ${shortId(assetId)}.`,
    });
  }
}

function collectTableIssues(
  element: WriterElementV2,
  issues: WriterExportPreflightIssue[],
): void {
  const table = element.tableData;

  if (!table || table.columns.length === 0 || table.rows.length === 0) {
    issues.push({
      code: 'EMPTY_TABLE_OBJECT',
      severity: 'warning',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer table object ${shortId(element.id)} has no table data.`,
    });
    return;
  }

  const expectedCellCount = table.columns.length;
  const mismatchedRow = table.rows.find((row) => row.cells.length !== expectedCellCount);

  if (mismatchedRow) {
    issues.push({
      code: 'TABLE_SHAPE_MISMATCH',
      severity: 'error',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer table object ${shortId(element.id)} has a row/cell count mismatch.`,
    });
  }
}

function isOutsidePageBounds(
  element: WriterElementV2,
  pageSize: WriterExportPreflightPageSize,
): boolean {
  return element.rect.x < 0 ||
    element.rect.y < 0 ||
    element.rect.x + element.rect.width > pageSize.width ||
    element.rect.y + element.rect.height > pageSize.height;
}

async function safeReadPageSizes(
  bytes: Uint8Array,
): Promise<WriterExportPreflightPageSize[]> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(bytes);

    return pdf.getPages().map((page, pageIndex) => {
      const size = page.getSize();

      return {
        pageIndex,
        width: size.width,
        height: size.height,
      };
    });
  } catch {
    return [];
  }
}

function shortId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

function collectRichContentIssues(
  element: WriterElementV2,
  issues: WriterExportPreflightIssue[],
): void {
  const blocks = editorStateToPdfBlocks(element.editorStateJson, element.plainText ?? '');

  visitRichBlocks(blocks, (block) => {
    if (block.type === 'image') {
      collectRichImageIssues(element, block, issues);
    }

    if (block.type === 'table') {
      collectRichTableIssues(element, block, issues);
    }
  });

  const padding = element.style.padding ?? 8;
  const availableHeight = Math.max(1, element.rect.height - padding * 2);
  const metrics = estimateRichContentMetrics(blocks, {
    fontSize: element.style.fontSize ?? 11,
    availableWidth: Math.max(1, element.rect.width - padding * 2),
    padding,
  });

  if (metrics.estimatedHeight > availableHeight * 1.25) {
    issues.push({
      code: 'RICH_CONTENT_MAY_CLIP',
      severity: 'warning',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer rich box ${shortId(element.id)} may clip content during flattened export.`,
    });
  }
}

function collectRichImageIssues(
  element: WriterElementV2,
  block: Extract<PdfBlock, { type: 'image' }>,
  issues: WriterExportPreflightIssue[],
): void {
  if (!block.src) {
    issues.push({
      code: 'RICH_IMAGE_EMPTY_SOURCE',
      severity: 'error',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer rich box ${shortId(element.id)} contains an image block with no source.`,
    });
    return;
  }

  const supported =
    block.src.startsWith('data:image/png') ||
    block.src.startsWith('data:image/jpeg') ||
    block.src.startsWith('data:image/jpg');

  if (!supported) {
    issues.push({
      code: 'RICH_IMAGE_UNSUPPORTED_FORMAT',
      severity: 'warning',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer rich box ${shortId(element.id)} contains an image format that flattened export may replace with a placeholder.`,
    });
  }
}

function collectRichTableIssues(
  element: WriterElementV2,
  block: Extract<PdfBlock, { type: 'table' }>,
  issues: WriterExportPreflightIssue[],
): void {
  if (block.rows.length === 0 || block.rows.every((row) => row.cells.length === 0)) {
    issues.push({
      code: 'RICH_TABLE_EMPTY',
      severity: 'warning',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer rich box ${shortId(element.id)} contains an empty table.`,
    });
    return;
  }

  const maxColumns = Math.max(0, ...block.rows.map((row) => row.cells.length));

  if (block.rows.length > 20 || maxColumns > 8) {
    issues.push({
      code: 'RICH_TABLE_LARGE',
      severity: 'warning',
      elementId: element.id,
      pageIndex: element.pageIndex,
      message: `Writer rich box ${shortId(element.id)} contains a large table that may not fit inside the overlay box.`,
    });
  }
}

function visitRichBlocks(
  blocks: PdfBlock[],
  visitor: (block: PdfBlock) => void,
): void {
  for (const block of blocks) {
    visitor(block);

    if (block.type === 'table') {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          visitRichBlocks(cell.children, visitor);
        }
      }
    }
  }
}


