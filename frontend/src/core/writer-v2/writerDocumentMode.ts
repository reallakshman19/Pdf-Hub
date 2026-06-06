import type {
  WriterDocumentMetaV2,
  WriterPagePreset,
  WriterPageSetupV2,
  WriterElementV2,
} from './types';
import { WRITER_PAGE_PRESETS } from './types';

export interface CreateBlankWriterDocumentInput {
  title?: string;
  pageSetup?: WriterPageSetupV2;
  pageCount?: number;
  documentFingerprint?: string;
  now?: string;
}

export interface DeleteWriterPageResult {
  elements: WriterElementV2[];
  pageCount: number;
  selectedIds: string[];
  activeId: string | null;
}

export interface DuplicateWriterPageResult {
  elements: WriterElementV2[];
  pageCount: number;
  duplicatedIds: string[];
}

export function createWriterPageSetup(
  preset: WriterPagePreset = 'A4',
  patch: Partial<WriterPageSetupV2> = {},
): WriterPageSetupV2 {
  const base = preset === 'Custom'
    ? WRITER_PAGE_PRESETS.A4
    : WRITER_PAGE_PRESETS[preset];

  const next: WriterPageSetupV2 = {
    ...base,
    ...patch,
    preset,
    unit: 'pt',
  };

  return normalizeWriterPageSetup(next);
}

export function normalizeWriterPageSetup(
  setup: WriterPageSetupV2,
): WriterPageSetupV2 {
  const width = clampFinite(setup.width, 144, 2400);
  const height = clampFinite(setup.height, 144, 2400);

  const marginTop = clampFinite(setup.marginTop, 0, height / 2 - 1);
  const marginBottom = clampFinite(setup.marginBottom, 0, height / 2 - 1);
  const marginLeft = clampFinite(setup.marginLeft, 0, width / 2 - 1);
  const marginRight = clampFinite(setup.marginRight, 0, width / 2 - 1);

  return {
    ...setup,
    width,
    height,
    unit: 'pt',
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    backgroundColor: setup.backgroundColor ?? '#ffffff',
  };
}

export function createBlankWriterDocumentMeta(
  input: CreateBlankWriterDocumentInput = {},
): WriterDocumentMetaV2 {
  const now = input.now ?? new Date().toISOString();

  return {
    documentFingerprint: input.documentFingerprint ?? createBlankWriterDocumentFingerprint(),
    mode: 'blankDocument',
    title: input.title?.trim() || 'Untitled document',
    pageSetup: normalizeWriterPageSetup(input.pageSetup ?? WRITER_PAGE_PRESETS.A4),
    pageCount: normalizeWriterPageCount(input.pageCount ?? 1),
    createdAt: now,
    updatedAt: now,
  };
}

export function createPdfOverlayWriterDocumentMeta(input: {
  documentFingerprint: string;
  title?: string;
  pageSetup?: WriterPageSetupV2;
  pageCount: number;
  now?: string;
}): WriterDocumentMetaV2 {
  const now = input.now ?? new Date().toISOString();

  return {
    documentFingerprint: input.documentFingerprint,
    mode: 'pdfOverlay',
    title: input.title,
    pageSetup: normalizeWriterPageSetup(input.pageSetup ?? WRITER_PAGE_PRESETS.A4),
    pageCount: normalizeWriterPageCount(input.pageCount),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateWriterDocumentPageSetup(
  meta: WriterDocumentMetaV2,
  patch: Partial<WriterPageSetupV2>,
  now = new Date().toISOString(),
): WriterDocumentMetaV2 {
  return {
    ...meta,
    pageSetup: normalizeWriterPageSetup({
      ...meta.pageSetup,
      ...patch,
      unit: 'pt',
    }),
    updatedAt: now,
  };
}

export function addWriterPage(
  meta: WriterDocumentMetaV2,
  elements: WriterElementV2[],
  input: {
    afterPageIndex?: number;
    now?: string;
  } = {},
): {
  meta: WriterDocumentMetaV2;
  elements: WriterElementV2[];
  insertedPageIndex: number;
} {
  const currentPageCount = normalizeWriterPageCount(meta.pageCount);
  const insertedPageIndex = input.afterPageIndex === undefined
    ? currentPageCount
    : clampInteger(input.afterPageIndex + 1, 0, currentPageCount);

  return {
    meta: {
      ...meta,
      pageCount: currentPageCount + 1,
      updatedAt: input.now ?? new Date().toISOString(),
    },
    insertedPageIndex,
    elements: elements.map((element) => element.pageIndex >= insertedPageIndex
      ? {
          ...element,
          pageIndex: element.pageIndex + 1,
          updatedAt: input.now ?? element.updatedAt,
        }
      : element),
  };
}

export function deleteWriterPage(
  meta: WriterDocumentMetaV2,
  elements: WriterElementV2[],
  input: {
    pageIndex: number;
    selectedIds?: string[];
    activeId?: string | null;
    now?: string;
  },
): {
  meta: WriterDocumentMetaV2;
  result: DeleteWriterPageResult;
} {
  const currentPageCount = normalizeWriterPageCount(meta.pageCount);

  if (currentPageCount <= 1) {
    return {
      meta,
      result: {
        elements,
        pageCount: currentPageCount,
        selectedIds: input.selectedIds ?? [],
        activeId: input.activeId ?? null,
      },
    };
  }

  const pageIndex = clampInteger(input.pageIndex, 0, currentPageCount - 1);
  const removedIds = new Set(
    elements
      .filter((element) => element.pageIndex === pageIndex)
      .map((element) => element.id),
  );

  const nextElements = elements
    .filter((element) => element.pageIndex !== pageIndex)
    .map((element) => element.pageIndex > pageIndex
      ? {
          ...element,
          pageIndex: element.pageIndex - 1,
          updatedAt: input.now ?? element.updatedAt,
        }
      : element);

  const selectedIds = (input.selectedIds ?? []).filter((id) => !removedIds.has(id));
  const activeId = input.activeId && !removedIds.has(input.activeId)
    ? input.activeId
    : selectedIds.at(-1) ?? null;

  return {
    meta: {
      ...meta,
      pageCount: currentPageCount - 1,
      updatedAt: input.now ?? new Date().toISOString(),
    },
    result: {
      elements: nextElements,
      pageCount: currentPageCount - 1,
      selectedIds,
      activeId,
    },
  };
}

export function duplicateWriterPage(
  meta: WriterDocumentMetaV2,
  elements: WriterElementV2[],
  input: {
    pageIndex: number;
    now?: string;
    idFactory?: (sourceId: string) => string;
  },
): {
  meta: WriterDocumentMetaV2;
  result: DuplicateWriterPageResult;
} {
  const currentPageCount = normalizeWriterPageCount(meta.pageCount);
  const pageIndex = clampInteger(input.pageIndex, 0, currentPageCount - 1);
  const duplicatedPageIndex = pageIndex + 1;
  const now = input.now ?? new Date().toISOString();
  const idFactory = input.idFactory ?? ((sourceId) => `${sourceId}-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const shifted = elements.map((element) => element.pageIndex >= duplicatedPageIndex
    ? {
        ...element,
        pageIndex: element.pageIndex + 1,
        updatedAt: now,
      }
    : element);

  const duplicated = elements
    .filter((element) => element.pageIndex === pageIndex)
    .map((element) => ({
      ...structuredCloneWriterElement(element),
      id: idFactory(element.id),
      pageIndex: duplicatedPageIndex,
      createdAt: now,
      updatedAt: now,
    }));

  return {
    meta: {
      ...meta,
      pageCount: currentPageCount + 1,
      updatedAt: now,
    },
    result: {
      elements: [...shifted, ...duplicated],
      pageCount: currentPageCount + 1,
      duplicatedIds: duplicated.map((element) => element.id),
    },
  };
}

export function normalizeWriterPageCount(pageCount: number): number {
  if (!Number.isFinite(pageCount)) {
    return 1;
  }

  return Math.max(1, Math.floor(pageCount));
}

export function getWriterPageContentBounds(
  pageSetup: WriterPageSetupV2,
) {
  const setup = normalizeWriterPageSetup(pageSetup);

  return {
    x: setup.marginLeft,
    y: setup.marginBottom,
    width: Math.max(1, setup.width - setup.marginLeft - setup.marginRight),
    height: Math.max(1, setup.height - setup.marginTop - setup.marginBottom),
  };
}

function createBlankWriterDocumentFingerprint(): string {
  return `writer-blank-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(value, max));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(Math.floor(value), max));
}

function structuredCloneWriterElement(element: WriterElementV2): WriterElementV2 {
  return {
    ...element,
    rect: { ...element.rect },
    style: { ...element.style },
    assetIds: element.assetIds ? [...element.assetIds] : undefined,
    review: element.review ? { ...element.review } : undefined,
    tableData: element.tableData
      ? {
          ...element.tableData,
          columns: element.tableData.columns.map((column) => ({ ...column })),
          rows: element.tableData.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell })),
          })),
        }
      : undefined,
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint: element.callout.anchorPoint
            ? { ...element.callout.anchorPoint }
            : undefined,
        }
      : undefined,
  };
}
