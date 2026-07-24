import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import type { PdfEditOperationOptions } from '../../../adapters/pdf-edit/PdfEditAdapter';
import { macroRegistry } from '../registry';
import type {
  MacroMutableState,
  SideEffect,
  StepResult,
} from '../registry';
import type {
  InsertPosition,
  MacroExecutionContext,
  MacroStep,
  PageSelector,
} from '../types';

export interface PageSelectionState {
  pageCount: number;
  selectedPages: number[];
  currentPage?: number;
}

function operationArgs(
  signal: AbortSignal | undefined,
): [] | [PdfEditOperationOptions] {
  return signal ? [{ signal }] : [];
}

export function resolvePageSelector(
  selector: PageSelector,
  state: PageSelectionState,
): number[] {
  const pageCount = Math.max(0, Math.floor(state.pageCount));

  if (pageCount <= 0) return [];

  if (selector.mode === 'all') {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  if (selector.mode === 'odd') {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
      .filter((page) => page % 2 === 1);
  }

  if (selector.mode === 'even') {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
      .filter((page) => page % 2 === 0);
  }

  if (selector.mode === 'current') {
    return [clampPage(state.currentPage ?? 1, pageCount)];
  }

  if (selector.mode === 'selected') {
    const selected = sanitizeOneBasedPages(state.selectedPages, pageCount);

    return selected.length > 0
      ? selected
      : [clampPage(state.currentPage ?? 1, pageCount)];
  }

  if (selector.mode === 'list') {
    return sanitizeOneBasedPages(selector.pages, pageCount);
  }

  if (selector.mode === 'range') {
    const from = clampPage(Math.min(selector.from, selector.to), pageCount);
    const to = clampPage(Math.max(selector.from, selector.to), pageCount);

    if (to < from) return [];

    return Array.from(
      { length: to - from + 1 },
      (_, index) => from + index,
    );
  }

  return [];
}

/**
 * Compatibility alias for older code/tests.
 */
export const resolveSelector = resolvePageSelector;

export function toZeroBasedPageIndices(oneBasedPages: number[]): number[] {
  return oneBasedPages.map((page) => page - 1);
}

function sanitizeOneBasedPages(
  pages: number[],
  pageCount: number,
): number[] {
  return Array.from(
    new Set(
      pages
        .filter((page) => Number.isInteger(page))
        .filter((page) => page >= 1 && page <= pageCount),
    ),
  ).sort((a, b) => a - b);
}

function clampPage(
  page: number,
  pageCount: number,
): number {
  if (!Number.isInteger(page)) return 1;
  return Math.max(1, Math.min(page, pageCount));
}

function getSelectionState(
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): PageSelectionState {
  return {
    pageCount: state.pageCount,
    selectedPages: state.selectedPages,
    currentPage: ctx.currentPage,
  };
}

function success(
  message: string,
  sideEffects: SideEffect[],
): StepResult {
  return {
    status: 'success',
    message,
    sideEffects: [
      ...sideEffects,
      {
        type: 'log',
        message,
      },
    ],
  };
}

function warning(
  message: string,
): StepResult {
  return {
    status: 'warning',
    message,
    sideEffects: [
      {
        type: 'log',
        message,
      },
    ],
  };
}

function failure(
  err: unknown,
): StepResult {
  return {
    status: 'error',
    message: err instanceof Error ? err.message : String(err),
    sideEffects: [],
  };
}

function pageCountEffect(
  newCount: number,
): SideEffect {
  return {
    type: 'page_count_changed',
    newCount,
  };
}

function bytesEffect(
  bytes: Uint8Array,
): SideEffect {
  return {
    type: 'bytes_updated',
    bytes,
  };
}

function selectionEffect(
  selectedPages: number[],
): SideEffect {
  return {
    type: 'selection_changed',
    selectedPages,
  };
}

function outputFileEffect(
  name: string,
  bytes: Uint8Array,
): SideEffect {
  return {
    type: 'output_file',
    name,
    bytes,
  };
}

function resolveInsertIndex(
  position: InsertPosition,
  pageCount: number,
): number {
  if (position.mode === 'start') return 0;
  if (position.mode === 'end') return pageCount;
  if (position.mode === 'before') return Math.max(0, Math.min(position.page - 1, pageCount));
  if (position.mode === 'after') return Math.max(0, Math.min(position.page, pageCount));

  return pageCount;
}

function resolveBlankPageSize(
  size: Extract<MacroStep, { op: 'insert_blank_page' }>['size'],
  currentBytes: Uint8Array,
  state: MacroMutableState,
  position: InsertPosition,
  signal?: AbortSignal,
): Promise<{ width: number; height: number }> | { width: number; height: number } {
  if (typeof size === 'object') {
    return {
      width: Math.max(1, size.width),
      height: Math.max(1, size.height),
    };
  }

  if (size === 'a4') {
    return {
      width: 595,
      height: 842,
    };
  }

  if (size === 'letter') {
    return {
      width: 612,
      height: 792,
    };
  }

  const referencePage =
    position.mode === 'before' || position.mode === 'after'
      ? Math.max(0, Math.min(position.page - 1, state.pageCount - 1))
      : 0;

  return PdfEditAdapter.getPageSize(currentBytes, referencePage, ...operationArgs(signal));
}

type SelectPagesStep = Extract<MacroStep, { op: 'select_pages' }>;

async function executeSelectPages(
  step: SelectPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    return success(
      `Selected ${pages.length} page(s)`,
      [
        selectionEffect(pages),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('select_pages', executeSelectPages);

type RotatePagesStep = Extract<MacroStep, { op: 'rotate_pages' }>;

async function executeRotatePages(
  step: RotatePagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched rotate_pages selector.');
    }

    const updatedBytes = await PdfEditAdapter.rotatePages(
      state.workingBytes,
      toZeroBasedPageIndices(pages),
      step.degrees,
      ...operationArgs(ctx.options?.abortSignal),
    );

    return success(
      `Rotated ${pages.length} page(s) by ${step.degrees}°`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('rotate_pages', executeRotatePages);

type ExtractPagesStep = Extract<MacroStep, { op: 'extract_pages' }>;

async function executeExtractPages(
  step: ExtractPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched extract_pages selector.');
    }

    const outputName = step.outputName?.trim() || `extracted-${ctx.fileName}`;
    const outputBytes = await PdfEditAdapter.extractPages(
      state.workingBytes,
      toZeroBasedPageIndices(pages),
      ...operationArgs(ctx.options?.abortSignal),
    );

    return success(
      `Extracted ${pages.length} page(s) to ${outputName}`,
      [
        outputFileEffect(outputName, outputBytes),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('extract_pages', executeExtractPages);

type SplitPagesStep = Extract<MacroStep, { op: 'split_pages' }>;

async function executeSplitPages(
  step: SplitPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched split_pages selector.');
    }

    const outputName = step.outputName?.trim() || `split-${ctx.fileName}`;
    const zeroBasedPages = toZeroBasedPageIndices(pages);

    const extractedBytes = await PdfEditAdapter.extractPages(
      state.workingBytes,
      zeroBasedPages,
      ...operationArgs(ctx.options?.abortSignal),
    );

    const updatedBytes = await PdfEditAdapter.removePages(
      state.workingBytes,
      zeroBasedPages,
      ...operationArgs(ctx.options?.abortSignal),
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes, ...operationArgs(ctx.options?.abortSignal));

    return success(
      `Split ${pages.length} page(s) to ${outputName}`,
      [
        outputFileEffect(outputName, extractedBytes),
        bytesEffect(updatedBytes),
        pageCountEffect(newPageCount),
        selectionEffect([]),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('split_pages', executeSplitPages);

type DuplicatePagesStep = Extract<MacroStep, { op: 'duplicate_pages' }>;

async function executeDuplicatePages(
  step: DuplicatePagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched duplicate_pages selector.');
    }

    const updatedBytes = await PdfEditAdapter.duplicatePages(
      state.workingBytes,
      toZeroBasedPageIndices(pages),
      ...operationArgs(ctx.options?.abortSignal),
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes, ...operationArgs(ctx.options?.abortSignal));

    return success(
      `Duplicated ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
        pageCountEffect(newPageCount),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('duplicate_pages', executeDuplicatePages);

type RemovePagesStep = Extract<MacroStep, { op: 'remove_pages' }>;

async function executeRemovePages(
  step: RemovePagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolvePageSelector(step.selector, getSelectionState(ctx, state));

    if (pages.length === 0) {
      return warning('No pages matched remove_pages selector.');
    }

    const updatedBytes = await PdfEditAdapter.removePages(
      state.workingBytes,
      toZeroBasedPageIndices(pages),
      ...operationArgs(ctx.options?.abortSignal),
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes, ...operationArgs(ctx.options?.abortSignal));
    const selectedPages = state.selectedPages.filter(
      (page) => !pages.includes(page) && page <= newPageCount,
    );

    return success(
      `Removed ${pages.length} page(s)`,
      [
        bytesEffect(updatedBytes),
        pageCountEffect(newPageCount),
        selectionEffect(selectedPages),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('remove_pages', executeRemovePages);

type InsertBlankPageStep = Extract<MacroStep, { op: 'insert_blank_page' }>;

async function executeInsertBlankPage(
  step: InsertBlankPageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const count = Math.max(1, Math.floor(step.count ?? 1));
    let currentBytes = state.workingBytes;
    let currentPageCount = state.pageCount;

    const size = await resolveBlankPageSize(
      step.size,
      currentBytes,
      state,
      step.position,
      ctx.options?.abortSignal,
    );

    for (let index = 0; index < count; index += 1) {
      const insertIndex = resolveInsertIndex(step.position, currentPageCount);
      currentBytes = await PdfEditAdapter.insertBlankPage(
        currentBytes,
        insertIndex,
        size,
        ...operationArgs(ctx.options?.abortSignal),
      );
      currentPageCount += 1;
    }

    const newPageCount = await PdfEditAdapter.countPages(currentBytes, ...operationArgs(ctx.options?.abortSignal));

    return success(
      `Inserted ${count} blank page(s)`,
      [
        bytesEffect(currentBytes),
        pageCountEffect(newPageCount),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('insert_blank_page', executeInsertBlankPage);

type ReplacePageStep = Extract<MacroStep, { op: 'replace_page' }>;

async function executeReplacePage(
  step: ReplacePageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const donorBytes = ctx.donorFiles?.[step.donorFileId];

    if (!donorBytes) {
      return {
        status: 'error',
        message: `replace_page failed: donor file "${step.donorFileId}" was not provided.`,
        sideEffects: [],
      };
    }

    const updatedBytes = await PdfEditAdapter.replacePage(
      state.workingBytes,
      step.targetPage - 1,
      donorBytes,
      step.donorPage - 1,
      ...operationArgs(ctx.options?.abortSignal),
    );

    return success(
      `Replaced page ${step.targetPage} with donor page ${step.donorPage}`,
      [
        bytesEffect(updatedBytes),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('replace_page', executeReplacePage);

type ReorderPagesStep = Extract<MacroStep, { op: 'reorder_pages' }>;

async function executeReorderPages(
  step: ReorderPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    if (step.order.length !== state.pageCount) {
      return {
        status: 'error',
        message:
          `Skipped reorder_pages: order length ${step.order.length} ` +
          `does not match page count ${state.pageCount}.`,
        sideEffects: [],
      };
    }

    const zeroBasedOrder = step.order.map((page) => page - 1);
    const updatedBytes = await PdfEditAdapter.reorderPages(
      state.workingBytes,
      zeroBasedOrder,
      ...operationArgs(ctx.options?.abortSignal),
    );

    const selectedPages = sanitizeOneBasedPages(
      state.selectedPages,
      state.pageCount,
    );

    return success(
      'Reordered pages',
      [
        bytesEffect(updatedBytes),
        selectionEffect(selectedPages),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('reorder_pages', executeReorderPages);