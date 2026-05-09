import {
  macroRegistry,
  type MacroMutableState,
  type StepResult,
} from '../registry';
import type {
  MacroExecutionContext,
  MacroStep,
  PageSelector,
} from '../types';

type SelectPagesStep = Extract<MacroStep, { op: 'select_pages' }>;
type RotatePagesStep = Extract<MacroStep, { op: 'rotate_pages' }>;
type ExtractPagesStep = Extract<MacroStep, { op: 'extract_pages' }>;
type SplitPagesStep = Extract<MacroStep, { op: 'split_pages' }>;
type DuplicatePagesStep = Extract<MacroStep, { op: 'duplicate_pages' }>;
type RemovePagesStep = Extract<MacroStep, { op: 'remove_pages' }>;
type InsertBlankPageStep = Extract<MacroStep, { op: 'insert_blank_page' }>;
type ReplacePageStep = Extract<MacroStep, { op: 'replace_page' }>;
type ReorderPagesStep = Extract<MacroStep, { op: 'reorder_pages' }>;

function executeSelectPages(
  step: SelectPagesStep,
  ctx: MacroExecutionContext,
): StepResult {
  return {
    status: 'success',
    message: `Selected ${resolvePageSelector(step.selector, ctx).length} page(s).`,
    sideEffects: [
      {
        type: 'selection_changed',
        selectedPages: resolvePageSelector(step.selector, ctx),
      },
    ],
  };
}

function passThroughMutation(
  message: string,
  bytes: Uint8Array,
  pageCount?: number,
): StepResult {
  return {
    status: 'success',
    message,
    sideEffects: [
      {
        type: 'bytes_updated',
        bytes,
      },
      ...(typeof pageCount === 'number'
        ? [{ type: 'page_count_changed' as const, newCount: pageCount }]
        : []),
    ],
  };
}

function executeRotatePages(
  step: RotatePagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): StepResult {
  const pages = resolvePageSelector(step.selector, ctx);

  return passThroughMutation(
    `Rotate requested for ${pages.length} page(s) by ${step.degrees} degrees. PDF byte mutation placeholder kept deterministic.`,
    state.workingBytes,
  );
}

function executeExtractPages(
  step: ExtractPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): StepResult {
  const pages = resolvePageSelector(step.selector, ctx);

  return {
    status: 'success',
    message: `Extract requested for ${pages.length} page(s).`,
    sideEffects: [
      {
        type: 'output_file',
        name: step.outputName || 'extracted-pages.pdf',
        bytes: new Uint8Array(state.workingBytes),
      },
    ],
  };
}

function executeSplitPages(
  step: SplitPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): StepResult {
  const pages = resolvePageSelector(step.selector, ctx);
  const nextCount = Math.max(0, state.pageCount - pages.length);

  return {
    status: 'success',
    message: `Split requested for ${pages.length} page(s).`,
    sideEffects: [
      {
        type: 'output_file',
        name: step.outputName || 'split-pages.pdf',
        bytes: new Uint8Array(state.workingBytes),
      },
      {
        type: 'bytes_updated',
        bytes: state.workingBytes,
      },
      {
        type: 'page_count_changed',
        newCount: nextCount,
      },
      {
        type: 'selection_changed',
        selectedPages: [],
      },
    ],
  };
}

function executeDuplicatePages(
  step: DuplicatePagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): StepResult {
  const pages = resolvePageSelector(step.selector, ctx);
  return passThroughMutation(`Duplicate requested for ${pages.length} page(s).`, state.workingBytes, state.pageCount + pages.length);
}

function executeRemovePages(
  step: RemovePagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): StepResult {
  const pages = resolvePageSelector(step.selector, ctx);
  return passThroughMutation(`Remove requested for ${pages.length} page(s).`, state.workingBytes, Math.max(0, state.pageCount - pages.length));
}

function executeInsertBlankPage(
  step: InsertBlankPageStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): StepResult {
  const count = (step.count ?? 1) as any;
  return passThroughMutation(`Insert ${count} blank page(s) requested.`, state.workingBytes, state.pageCount + count);
}

function executeReplacePage(
  step: ReplacePageStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): StepResult {
  if (!ctx.donorFiles?.[step.donorFileId]) {
    return {
      status: 'error',
      message: `Donor file "${step.donorFileId}" was not found.`,
      sideEffects: [],
    };
  }

  return passThroughMutation(`Replace page ${step.targetPage} with donor page ${step.donorPage}.`, state.workingBytes);
}

function executeReorderPages(
  step: ReorderPagesStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): StepResult {
  return passThroughMutation(`Reorder requested with ${step.order.length} page index(es).`, state.workingBytes);
}

export function resolvePageSelector(selector: PageSelector, ctx: MacroExecutionContext): number[] {
  if (selector.mode === 'current') return sanitizePages([(ctx.currentPage || 1)], (ctx.pageCount || 0));
  if (selector.mode === 'selected') return sanitizePages(ctx.selectedPages, (ctx.pageCount || 0));
  if (selector.mode === 'all') {
    return Array.from({ length: (ctx.pageCount || 0) }, (_, index) => index + 1);
  }
  if (selector.mode === 'range') {
    const from = Math.max(1, Math.min(selector.from, selector.to));
    const to = Math.min((ctx.pageCount || 0), Math.max(selector.from, selector.to));
    return sanitizePages(
      Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index),
      (ctx.pageCount || 0),
    );
  }

  if (selector.mode === 'odd') { return sanitizePages(Array.from({ length: (ctx.pageCount || 0) }, (_, i) => i + 1).filter(n => n % 2 !== 0), (ctx.pageCount || 0)); }
if (selector.mode === 'even') { return sanitizePages(Array.from({ length: (ctx.pageCount || 0) }, (_, i) => i + 1).filter(n => n % 2 === 0), (ctx.pageCount || 0)); }
if (selector.mode === 'list') { return sanitizePages((selector as any).pages || [], (ctx.pageCount || 0)); }
return sanitizePages((selector as any).pages || [], (ctx.pageCount || 0));
}

function sanitizePages(pages: number[], pageCount: number): number[] {
  return Array.from(
    new Set(
      pages
        .filter((page) => Number.isInteger(page))
        .filter((page) => page >= 1 && page <= pageCount),
    ),
  );
}

macroRegistry.register('select_pages', executeSelectPages);
macroRegistry.register('rotate_pages', executeRotatePages);
macroRegistry.register('extract_pages', executeExtractPages);
macroRegistry.register('split_pages', executeSplitPages);
macroRegistry.register('duplicate_pages', executeDuplicatePages);
macroRegistry.register('remove_pages', executeRemovePages);
macroRegistry.register('insert_blank_page', executeInsertBlankPage);
macroRegistry.register('replace_page', executeReplacePage);
macroRegistry.register('reorder_pages', executeReorderPages);
