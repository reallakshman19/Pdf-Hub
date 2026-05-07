import { macroRegistry } from '../registry';
import type { StepResult, MacroMutableState } from '../registry';
import type { MacroExecutionContext, PageSelector, MacroStep } from '../types';
import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';

export function resolveSelector(
  selector: PageSelector | 'all' | 'odd' | 'even' | 'selected' | 'current' | number[],
  state: Pick<MacroMutableState, 'pageCount' | 'selectedPages'> & { currentPage?: number },
): number[] {
  if (selector === 'all' || (typeof selector === 'object' && !Array.isArray(selector) && selector?.mode === 'all'))
    return Array.from({ length: state.pageCount }, (_, i) => i + 1);

  if (selector === 'odd' || (typeof selector === 'object' && !Array.isArray(selector) && selector?.mode === 'odd'))
    return Array.from({ length: state.pageCount }, (_, i) => i + 1)
      .filter(p => p % 2 === 1);

  if (selector === 'even' || (typeof selector === 'object' && !Array.isArray(selector) && selector?.mode === 'even'))
    return Array.from({ length: state.pageCount }, (_, i) => i + 1)
      .filter(p => p % 2 === 0);

  if (selector === 'selected' || (typeof selector === 'object' && !Array.isArray(selector) && selector?.mode === 'selected'))
    return state.selectedPages && state.selectedPages.length > 0 ? Array.from(new Set(state.selectedPages)).filter((page: number) => page >= 1 && page <= state.pageCount).sort((a: number, b: number) => a - b) : (state.currentPage != null ? [Math.max(1, Math.min(state.currentPage, state.pageCount))] : []);

  if (selector === 'current' || (typeof selector === 'object' && !Array.isArray(selector) && selector?.mode === 'current'))
    return state.currentPage != null ? [state.currentPage] : [];

  if (Array.isArray(selector))
    // Clamp: remove page numbers outside valid range
    return selector.filter((p: number) => p >= 1 && p <= state.pageCount);

  if (typeof selector === 'object' && !Array.isArray(selector) && selector?.mode === 'list')
    return Array.from(new Set(selector.pages)).filter((page: number) => page >= 1 && page <= state.pageCount).sort((a: number, b: number) => a - b);

  if (typeof selector === 'object' && !Array.isArray(selector) && selector?.mode === 'range')
    return Array.from({ length: Math.min(Math.max(selector.from, selector.to), state.pageCount) - Math.max(Math.min(selector.from, selector.to), 1) + 1 }, (_, i) => Math.max(Math.min(selector.from, selector.to), 1) + i);

  return [];
}

type RotatePagesStep = Extract<MacroStep, { op: 'rotate_pages' }>;

async function executeRotatePages(
  step: RotatePagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }
    const updatedBytes = await PdfEditAdapter.rotatePages(state.workingBytes, pages.map(p => p - 1), step.degrees);
    return {
      status: 'success',
      message: `Rotated ${pages.length} page(s) by ${step.degrees}°`,
      sideEffects: [{ type: 'bytes_updated', bytes: updatedBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
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
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }
    const outputName = step.outputName ?? `extracted-${ctx.fileName}`;
    const outputBytes = await PdfEditAdapter.extractPages(state.workingBytes, pages.map(p => p - 1));
    return {
      status: 'success',
      message: `Extracted ${pages.length} page(s) to ${outputName}`,
      sideEffects: [{ type: 'output_file', name: outputName, bytes: outputBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
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
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    const outputName = step.outputName ?? ctx.fileName;
    const extractedBytes = await PdfEditAdapter.extractPages(state.workingBytes, pages.map(p => p - 1));
    const updatedBytes = await PdfEditAdapter.removePages(state.workingBytes, pages.map(p => p - 1));
    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);

    // Clear selected pages since they were split out
    state.selectedPages = [];

    return {
      status: 'success',
      message: `Split ${pages.length} page(s)`,
      sideEffects: [
        { type: 'output_file',        name: outputName,            bytes: extractedBytes }, // 1
        { type: 'bytes_updated',      bytes: updatedBytes },                                 // 2
        { type: 'page_count_changed', newCount: newPageCount },                              // 3
      ],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
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
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }

    const updatedBytes = await PdfEditAdapter.duplicatePages(state.workingBytes, pages.map(p => p - 1));
    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);

    return {
      status: 'success',
      message: `Duplicated ${pages.length} page(s)`,
      sideEffects: [
        { type: 'bytes_updated', bytes: updatedBytes },
        { type: 'page_count_changed', newCount: newPageCount },
      ],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
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
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    if (pages.length === 0) {
      return { status: 'warning', message: 'No pages matched selector', sideEffects: [] };
    }
    const updatedBytes = await PdfEditAdapter.removePages(state.workingBytes, pages.map(p => p - 1));
    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);
    return {
      status: 'success',
      message: `Removed ${pages.length} page(s)`,
      sideEffects: [
        { type: 'bytes_updated', bytes: updatedBytes },
        { type: 'page_count_changed', newCount: newPageCount },
      ],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('remove_pages', executeRemovePages);

type SelectPagesStep = Extract<MacroStep, { op: 'select_pages' }>;
async function executeSelectPages(
  step: SelectPagesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pages = resolveSelector(step.selector, { ...state, currentPage: ctx.currentPage });
    state.selectedPages = pages; // Mutate state directly as this is a specific selection step not a PDF change
    return {
      status: 'success',
      message: `Selected ${pages.length} page(s)`,
      sideEffects: [],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('select_pages', executeSelectPages);

type InsertBlankPageStep = Extract<MacroStep, { op: 'insert_blank_page' }>;
async function executeInsertBlankPage(
  step: InsertBlankPageStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    let currentBytes = state.workingBytes;
    const count = step.count ?? 1;
    let size: { width: number; height: number };

    if (typeof step.size === 'object') {
      size = step.size;
    } else if (step.size === 'a4') {
      size = { width: 595, height: 842 };
    } else if (step.size === 'letter') {
      size = { width: 612, height: 792 };
    } else {
      // match-current
      const refPage = step.position.mode === 'after' || step.position.mode === 'before'
        ? Math.max(0, Math.min(step.position.page - 1, state.pageCount - 1))
        : 0;
      size = await PdfEditAdapter.getPageSize(currentBytes, refPage);
    }

    for (let i = 0; i < count; i++) {
      let insertIndex = 0;
      switch (step.position.mode) {
        case 'start': insertIndex = 0; break;
        case 'end': insertIndex = state.pageCount + i; break;
        case 'before': insertIndex = Math.max(0, step.position.page - 1); break;
        case 'after': insertIndex = Math.min(state.pageCount + i, step.position.page); break;
      }
      currentBytes = await PdfEditAdapter.insertBlankPage(currentBytes, insertIndex, size);
    }
    const newPageCount = await PdfEditAdapter.countPages(currentBytes);
    return {
      status: 'success',
      message: `Inserted ${count} blank page(s)`,
      sideEffects: [
        { type: 'bytes_updated', bytes: currentBytes },
        { type: 'page_count_changed', newCount: newPageCount },
      ],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
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
    const donor = ctx.donorFiles?.[step.donorFileId];
    if (!donor) {
      return { status: 'warning', message: `Skipped replace_page: missing donor file ${step.donorFileId}`, sideEffects: [] };
    }
    const updatedBytes = await PdfEditAdapter.replacePage(state.workingBytes, step.targetPage - 1, donor, step.donorPage - 1);
    return {
      status: 'success',
      message: `Replaced page ${step.targetPage} with donor page ${step.donorPage}`,
      sideEffects: [{ type: 'bytes_updated', bytes: updatedBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('replace_page', executeReplacePage);

type ReorderPagesStep = Extract<MacroStep, { op: 'reorder_pages' }>;
async function executeReorderPages(
  step: ReorderPagesStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    if (step.order.length !== state.pageCount) {
      return { status: 'warning', message: 'Skipped reorder_pages: order length does not match page count', sideEffects: [] };
    }
    const updatedBytes = await PdfEditAdapter.reorderPages(state.workingBytes, step.order.map((p) => p - 1));
    return {
      status: 'success',
      message: 'Reordered pages',
      sideEffects: [{ type: 'bytes_updated', bytes: updatedBytes }],
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), sideEffects: [] };
  }
}
macroRegistry.register('reorder_pages', executeReorderPages);
