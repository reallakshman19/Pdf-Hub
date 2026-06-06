import type { PdfRect } from '../writer-v2/types';
import type {
  OcrAnyBlock,
  OcrDiagnostic,
  OcrPageResult,
} from './types';

export type OcrRegionMode =
  | 'text'
  | 'table'
  | 'note'
  | 'review'
  | 'metadata';

export interface OcrRegion {
  id: string;
  documentFingerprint: string;
  pageIndex: number;
  bbox: PdfRect;
  mode: OcrRegionMode;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOcrRegionInput {
  id: string;
  documentFingerprint: string;
  pageIndex: number;
  bbox: PdfRect;
  mode: OcrRegionMode;
  now?: string;
}

export interface OcrRegionResult {
  region: OcrRegion;
  pageResult: OcrPageResult;
  blocks: OcrAnyBlock[];
  text: string;
  confidence: number;
  diagnostics: OcrDiagnostic[];
}

export interface OcrRegionValidationResult {
  valid: boolean;
  diagnostics: OcrDiagnostic[];
}

export function createOcrRegion(
  input: CreateOcrRegionInput,
): OcrRegion {
  const now = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    documentFingerprint: input.documentFingerprint,
    pageIndex: input.pageIndex,
    bbox: normalizeRect(input.bbox),
    mode: input.mode,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateOcrRegion(
  region: OcrRegion,
  page: {
    pageIndex: number;
    width: number;
    height: number;
    region?: PdfRect;
  },
): OcrRegionValidationResult {
  const diagnostics: OcrDiagnostic[] = [];

  if (!region.id) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      pageIndex: region.pageIndex,
      message: 'OCR region has missing id.',
    });
  }

  if (!region.documentFingerprint) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      pageIndex: region.pageIndex,
      message: 'OCR region has missing documentFingerprint.',
    });
  }

  if (region.pageIndex !== page.pageIndex) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      pageIndex: region.pageIndex,
      message: 'OCR region pageIndex does not match page.',
    });
  }

  if (region.bbox.width <= 0 || region.bbox.height <= 0) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_RESULT',
      pageIndex: region.pageIndex,
      targetId: region.id,
      message: 'OCR region has invalid width/height.',
    });
  }

  const effectiveWidth = page.region
    ? Math.max(page.width, page.region.x + page.region.width)
    : page.width;

  const effectiveHeight = page.region
    ? Math.max(page.height, page.region.y + page.region.height)
    : page.height;

  const inside =
    region.bbox.x >= 0 &&
    region.bbox.y >= 0 &&
    region.bbox.width >= 0 &&
    region.bbox.height >= 0 &&
    region.bbox.x + region.bbox.width <= effectiveWidth &&
    region.bbox.y + region.bbox.height <= effectiveHeight;

  if (!inside) {
    diagnostics.push({
      level: 'error',
      code: 'OUT_OF_PAGE_BBOX',
      pageIndex: region.pageIndex,
      targetId: region.id,
      message: 'OCR region bbox is outside page bounds.',
    });
  }

  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    diagnostics,
  };
}

export function clampOcrRegionToPage(
  region: OcrRegion,
  page: {
    width: number;
    height: number;
  },
): OcrRegion {
  const x = clamp(region.bbox.x, 0, page.width);
  const y = clamp(region.bbox.y, 0, page.height);
  const right = clamp(region.bbox.x + region.bbox.width, 0, page.width);
  const top = clamp(region.bbox.y + region.bbox.height, 0, page.height);

  return {
    ...region,
    bbox: {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, top - y),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function filterOcrBlocksInsideRegion(
  pageResult: OcrPageResult,
  region: OcrRegion,
): OcrAnyBlock[] {
  const isCropped =
    pageResult.width !== undefined &&
    pageResult.height !== undefined &&
    Math.abs(pageResult.width - region.bbox.width) < 1.0 &&
    Math.abs(pageResult.height - region.bbox.height) < 1.0;

  if (isCropped) {
    return pageResult.blocks;
  }

  return pageResult.blocks.filter((block) =>
    rectIntersects(region.bbox, block.bbox ?? block.rect),
  );
}

export function createOcrRegionResult(input: {
  region: OcrRegion;
  pageResult: OcrPageResult;
  blocks?: OcrAnyBlock[];
}): OcrRegionResult {
  const blocks = input.blocks ?? filterOcrBlocksInsideRegion(
    input.pageResult,
    input.region,
  );

  const text = blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  const confidence = averageConfidence(
    blocks.map((block) => block.confidence),
  );

  return {
    region: input.region,
    pageResult: input.pageResult,
    blocks,
    text,
    confidence,
    diagnostics: [],
  };
}

function normalizeRect(rect: PdfRect): PdfRect {
  const x1 = Math.min(rect.x, rect.x + rect.width);
  const x2 = Math.max(rect.x, rect.x + rect.width);
  const y1 = Math.min(rect.y, rect.y + rect.height);
  const y2 = Math.max(rect.y, rect.y + rect.height);

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function rectIntersects(a: PdfRect, b: PdfRect): boolean {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  return a.x < bx2
    && ax2 > b.x
    && a.y < by2
    && ay2 > b.y;
}

function averageConfidence(values: (number | undefined)[]): number {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (finite.length === 0) {
    return 0;
  }

  const average = finite.reduce((sum, value) => sum + value, 0) / finite.length;

  return Math.round(average * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
