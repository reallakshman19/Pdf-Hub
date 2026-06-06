import type {
  PdfRect,
  WriterElementV2,
  WriterTableData,
} from '../writer-v2/types';
import type { OcrRegion } from './ocrRegionModel';
import type { OcrTableReviewModel } from './ocrTableReviewModel';
import {
  ocrTableReviewModelToPlainText,
  ocrTableReviewModelToWriterTableData,
} from './ocrTableReviewModel';

export type OcrWriterInsertionSource =
  | 'ocrRegion'
  | 'ocrTableReview'
  | 'ocrCorrection'
  | 'ocrDocumentReconstruction';

export interface OcrWriterInsertionCandidate {
  id: string;
  source: OcrWriterInsertionSource;
  element: WriterElementV2;
  createdAt: string;
  diagnostics: OcrWriterInsertionDiagnostic[];
}

export interface OcrWriterInsertionDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'VALID_WRITER_ELEMENT'
    | 'MISSING_DOCUMENT_FINGERPRINT'
    | 'INVALID_RECT'
    | 'UNSUPPORTED_WRITER_ELEMENT_TYPE'
    | 'EMPTY_WRITER_TEXT'
    | 'MISSING_TABLE_DATA'
    | 'DUPLICATE_INSERTION_SKIPPED';
  message: string;
}

export interface CreateOcrWriterInsertionCandidateInput {
  source: OcrWriterInsertionSource;
  element: WriterElementV2;
  now?: string;
}

export interface OcrWriterInsertionQueueState {
  candidates: OcrWriterInsertionCandidate[];
}

export interface CreateReviewedOcrTableWriterElementInput {
  documentFingerprint: string;
  region: OcrRegion;
  tableData: WriterTableData;
  plainText?: string;
  now?: string;
}

export interface CreateReviewedOcrTableWriterElementFromModelInput {
  documentFingerprint: string;
  region: OcrRegion;
  model: OcrTableReviewModel;
  now?: string;
}

export interface OcrWriterInsertionResult {
  accepted: WriterElementV2[];
  rejected: OcrWriterInsertionCandidate[];
  diagnostics: OcrWriterInsertionDiagnostic[];
}

const SUPPORTED_OCR_INSERTION_TYPES: Array<WriterElementV2['type']> = [
  'richTextBox',
  'richNote',
  'reviewLabel',
  'textCallout',
  'textStamp',
  'tableBox',
  'imageBox',
];

export function createOcrWriterInsertionCandidate(
  input: CreateOcrWriterInsertionCandidateInput,
): OcrWriterInsertionCandidate {
  const diagnostics = validateOcrWriterElementForInsertion(input.element);

  return {
    id: `ocr-insert-${input.element.id}`,
    source: input.source,
    element: input.element,
    createdAt: input.now ?? new Date().toISOString(),
    diagnostics,
  };
}

export function createOcrWriterInsertionQueue(
  candidates: OcrWriterInsertionCandidate[] = [],
): OcrWriterInsertionQueueState {
  return {
    candidates: [...candidates],
  };
}

export function upsertOcrWriterInsertionCandidate(
  queue: OcrWriterInsertionQueueState,
  candidate: OcrWriterInsertionCandidate,
): OcrWriterInsertionQueueState {
  const exists = queue.candidates.some(
    (current) => current.id === candidate.id,
  );

  if (!exists) {
    return {
      candidates: [...queue.candidates, candidate],
    };
  }

  return {
    candidates: queue.candidates.map((current) =>
      current.id === candidate.id ? candidate : current,
    ),
  };
}

export function deleteOcrWriterInsertionCandidate(
  queue: OcrWriterInsertionQueueState,
  candidateId: string,
): OcrWriterInsertionQueueState {
  return {
    candidates: queue.candidates.filter(
      (candidate) => candidate.id !== candidateId,
    ),
  };
}

export function clearOcrWriterInsertionQueue(): OcrWriterInsertionQueueState {
  return {
    candidates: [],
  };
}

export function getInsertableOcrWriterCandidates(
  queue: OcrWriterInsertionQueueState,
): OcrWriterInsertionCandidate[] {
  return queue.candidates.filter((candidate) =>
    !candidate.diagnostics.some((diagnostic) => diagnostic.level === 'error'),
  );
}

export function buildOcrWriterInsertionResult(
  queue: OcrWriterInsertionQueueState,
): OcrWriterInsertionResult {
  const accepted: WriterElementV2[] = [];
  const rejected: OcrWriterInsertionCandidate[] = [];
  const diagnostics: OcrWriterInsertionDiagnostic[] = [];

  const seenElementIds = new Set<string>();

  for (const candidate of queue.candidates) {
    const hasError = candidate.diagnostics.some(
      (diagnostic) => diagnostic.level === 'error',
    );

    if (hasError) {
      rejected.push(candidate);
      diagnostics.push(...candidate.diagnostics);
      continue;
    }

    if (seenElementIds.has(candidate.element.id)) {
      rejected.push(candidate);
      diagnostics.push({
        level: 'warning',
        code: 'DUPLICATE_INSERTION_SKIPPED',
        message: `Duplicate OCR Writer insertion skipped: ${candidate.element.id}`,
      });
      continue;
    }

    seenElementIds.add(candidate.element.id);
    accepted.push(candidate.element);
    diagnostics.push(...candidate.diagnostics);
  }

  return {
    accepted: sortWriterElementsForInsertion(accepted),
    rejected,
    diagnostics,
  };
}

export function createReviewedOcrTableWriterElement(
  input: CreateReviewedOcrTableWriterElementInput,
): WriterElementV2 {
  const now = input.now ?? new Date().toISOString();

  return {
    id: `ocr-tableBox-${input.region.id}`,
    documentFingerprint: input.documentFingerprint,
    pageIndex: input.region.pageIndex,
    type: 'tableBox',
    rect: input.region.bbox,
    plainText: input.plainText ?? writerTableDataToPlainText(input.tableData),
    tableData: input.tableData,
    style: {
      zIndex: 10,
      fontFamily: 'Aptos',
      fontSize: 10,
      textColor: '#111827',
      backgroundColor: '#FFFFFF',
      borderColor: '#CBD5E1',
      borderWidth: 1,
      padding: 0,
      opacity: 1,
    },
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };
}

export function createReviewedOcrTableWriterElementFromModel(
  input: CreateReviewedOcrTableWriterElementFromModelInput,
): WriterElementV2 {
  const tableData = ocrTableReviewModelToWriterTableData(input.model);

  return createReviewedOcrTableWriterElement({
    documentFingerprint: input.documentFingerprint,
    region: input.region,
    tableData,
    plainText: ocrTableReviewModelToPlainText(input.model),
    now: input.now,
  });
}

export function validateOcrWriterElementForInsertion(
  element: WriterElementV2,
): OcrWriterInsertionDiagnostic[] {
  const diagnostics: OcrWriterInsertionDiagnostic[] = [];

  if (!element.documentFingerprint) {
    diagnostics.push({
      level: 'error',
      code: 'MISSING_DOCUMENT_FINGERPRINT',
      message: 'OCR Writer element is missing documentFingerprint.',
    });
  }

  if (!SUPPORTED_OCR_INSERTION_TYPES.includes(element.type)) {
    diagnostics.push({
      level: 'error',
      code: 'UNSUPPORTED_WRITER_ELEMENT_TYPE',
      message: `Unsupported OCR Writer insertion type: ${element.type}`,
    });
  }

  if (!isValidRect(element.rect)) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_RECT',
      message: 'OCR Writer element has invalid rect.',
    });
  }

  if (
    isTextLikeElement(element)
    && !element.plainText?.trim()
    && !element.editorStateJson
  ) {
    diagnostics.push({
      level: 'warning',
      code: 'EMPTY_WRITER_TEXT',
      message: 'OCR Writer text element has no plainText/editorStateJson.',
    });
  }

  if (element.type === 'tableBox' && !element.tableData) {
    diagnostics.push({
      level: 'error',
      code: 'MISSING_TABLE_DATA',
      message: 'OCR Writer tableBox is missing tableData.',
    });
  }

  if (!diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
    diagnostics.push({
      level: 'info',
      code: 'VALID_WRITER_ELEMENT',
      message: 'OCR Writer element is valid for insertion.',
    });
  }

  return diagnostics;
}

export function sortWriterElementsForInsertion(
  elements: WriterElementV2[],
): WriterElementV2[] {
  return [...elements].sort((a, b) => {
    const pageDelta = a.pageIndex - b.pageIndex;
    if (pageDelta !== 0) return pageDelta;

    const yDelta = b.rect.y - a.rect.y;
    if (yDelta !== 0) return yDelta;

    const xDelta = a.rect.x - b.rect.x;
    if (xDelta !== 0) return xDelta;

    const zDelta = (a.style.zIndex ?? 0) - (b.style.zIndex ?? 0);
    if (zDelta !== 0) return zDelta;

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function writerTableDataToPlainText(
  tableData: WriterTableData,
): string {
  const header = tableData.hasHeaderRow !== false
    ? `${tableData.columns.map((column) => column.label ?? '').join('\t')}\n`
    : '';

  const body = tableData.rows
    .map((row) =>
      row.cells.map((cell) => cell.text ?? '').join('\t'),
    )
    .join('\n');

  return `${header}${body}`.trim();
}

function isTextLikeElement(
  element: WriterElementV2,
): boolean {
  return element.type === 'richTextBox'
    || element.type === 'richNote'
    || element.type === 'reviewLabel'
    || element.type === 'textCallout'
    || element.type === 'textStamp';
}

function isValidRect(
  rect: PdfRect,
): boolean {
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}
