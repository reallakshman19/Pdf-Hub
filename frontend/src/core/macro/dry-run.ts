import type {
  MacroCondition,
  MacroDryRunDiff,
  InsertPosition,
  MacroDryRunReport,
  MacroRecipe,
  MacroStep,
  PageSelector,
} from './types';
import { useSessionStore } from '@/core/session/store';
import {
  resolvePageSelector,
  remapSelectionAfterRemoval,
  remapSelectionAfterDuplication,
  remapSelectionAfterReorder,
  remapCurrentAfterRemoval,
  remapCurrentAfterDuplication,
  remapCurrentAfterReorder,
} from './steps/page-ops';
import { templateVarEngine } from './template-vars';

export async function simulateMacroDryRun(
  recipe: MacroRecipe,
  ctx: {
    workingBytes?: Uint8Array;
    pageCount?: number;
    selectedPages?: number[];
    currentPage?: number;
    fileName?: string;
    now?: Date;
  },
): Promise<MacroDryRunReport> {
  const sessionState = useSessionStore.getState();
  const initialPageCount = ctx.pageCount ?? sessionState.pageCount ?? 0;
  const initialSelectedPages = ctx.selectedPages ?? sessionState.selectedPages ?? [];
  const initialCurrentPage = ctx.currentPage ?? sessionState.viewState.currentPage;
  let currentPage = initialCurrentPage;
  const fileName = ctx.fileName ?? sessionState.fileName ?? '';
  const templateVars = templateVarEngine.buildDefaultVars({
    fileName,
    pageCount: initialPageCount,
    now: ctx.now,
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  const logs: string[] = [];
  const outputFiles: import('./types').MacroDryRunOutputFile[] = [];

  let finalPageCount = initialPageCount;
  let modifiedBytes = false;
  let finalSelectedPages = [...initialSelectedPages];
  let uncertainPageCount = false;

  const resolvePages = (selector: PageSelector, selection: number[]): number[] =>
    resolvePageSelector(selector, {
      pageCount: finalPageCount,
      selectedPages: selection,
      currentPage,
    });

  const blankInsertIndex = (position: InsertPosition): number => {
    if (position.mode === 'start') return 0;
    if (position.mode === 'end') return finalPageCount;
    if (position.mode === 'before') return Math.max(0, Math.min(position.page - 1, finalPageCount));
    if (position.mode === 'after') return Math.max(0, Math.min(position.page, finalPageCount));
    const current = Math.max(1, Math.min(currentPage ?? 1, Math.max(1, finalPageCount)));
    return position.mode === 'before-current'
      ? Math.max(0, Math.min(current - 1, finalPageCount))
      : Math.max(0, Math.min(current, finalPageCount));
  };

  const conditionMatches = (condition: MacroCondition): boolean => {
    switch (condition.type) {
      case 'page_count_gt':
        return finalPageCount > condition.value;
      case 'page_count_lt':
        return finalPageCount < condition.value;
      case 'filename_contains':
        return fileName.includes(condition.value);
      case 'custom_var_equals':
        return templateVars[condition.key] === condition.value;
      default:
        return false;
    }
  };

  // Nested conditional branches observe immediate page and selector effects.
  const simulateSteps = (
    rawSteps: MacroStep[],
    depth = 0,
    branchSelection?: number[],
    pendingSelections?: number[][],
    alreadyExpanded = false,
  ): void => {
    if (depth > 16) {
      errors.push('Conditional nesting exceeds dry-run safety depth.');
      return;
    }

    for (let i = 0; i < rawSteps.length; i += 1) {
      // Real execution expands the entire conditional step before running its branch.
      const step = alreadyExpanded ? rawSteps[i] : templateVarEngine.expandStep(rawSteps[i], templateVars);
      const op = step.op;
      const selection = branchSelection ?? finalSelectedPages;
      logs.push(`${depth > 0 ? '  '.repeat(depth) : ''}Step ${i + 1}: ${op}`);

      try {
        if (op === 'insert_blank_page') {
          const count = Math.max(1, Math.floor(step.count ?? 1));
          let nextSelection = [...selection];
          for (let index = 0; index < count; index += 1) {
            const insertedAt = blankInsertIndex(step.position);
            nextSelection = nextSelection.map((page) => (
              page > insertedAt ? page + 1 : page
            ));
            if (currentPage > insertedAt) currentPage += 1;
            finalPageCount += 1;
          }
          if (pendingSelections) pendingSelections.push(nextSelection);
          else finalSelectedPages = nextSelection;
          modifiedBytes = true;
        } else if (op === 'duplicate_pages') {
          const pages = resolvePages(step.selector, selection);
          const originalCount = finalPageCount;
          finalPageCount += pages.length;
          modifiedBytes ||= pages.length > 0;
          currentPage = remapCurrentAfterDuplication(currentPage, pages, originalCount);
          const nextSelection = remapSelectionAfterDuplication(selection, pages, originalCount);
          if (pendingSelections) pendingSelections.push(nextSelection);
          else finalSelectedPages = nextSelection;
        } else if (op === 'remove_pages' || op === 'split_pages') {
          if (uncertainPageCount) {
            errors.push(`${op}: cannot verify selected pages after a donor with unknown page count.`);
            continue;
          }
          const pages = resolvePages(step.selector, selection);
          if (pages.length > 0) {
            const resultingCount = finalPageCount - pages.length;
            if (resultingCount < 1) {
              // PdfEditAdapter.removePages fails closed if no pages remain.
              // Reject both remove_pages and split_pages before execution.
              errors.push(`${op}: Cannot remove all pages from the document.`);
              logs.push(`  → ERROR: ${op}: Cannot remove all pages from the document.`);
              return;
            }
            const originalCount = finalPageCount;
            finalPageCount = resultingCount;
            modifiedBytes = true;
            currentPage = remapCurrentAfterRemoval(currentPage, pages, originalCount);
            const nextSelection = op === 'split_pages'
              ? []
              : remapSelectionAfterRemoval(selection, pages, finalPageCount + pages.length);
            if (pendingSelections) pendingSelections.push(nextSelection);
            else finalSelectedPages = nextSelection;
            if (op === 'split_pages') {
              outputFiles.push({
                name: step.outputName?.trim() || `split-${fileName}`,
                reason: op,
                pageCount: pages.length,
              });
            }
          }
        } else if (op === 'select_pages') {
          const pages = resolvePages(step.selector, selection);
          if (pendingSelections) pendingSelections.push(pages);
          else finalSelectedPages = pages;
        } else if (op === 'insert_pdf' || op === 'merge_files') {
          // Donor page counts cannot be derived from the recipe alone.
          uncertainPageCount = true;
          warnings.push(`${op}: donor page count is unknown; final page count is only an estimate.`);
          finalPageCount += 1;
          modifiedBytes = true;
        } else if (op === 'extract_pages') {
          const pages = resolvePages(step.selector, selection);
          if (pages.length > 0) {
            outputFiles.push({
              name: step.outputName?.trim() || `extracted-${fileName}`,
              reason: op,
              pageCount: pages.length,
            });
          }
        } else if (op === 'add_content_page' || op === 'add_image_header_page') {
          finalPageCount += 1;
          modifiedBytes = true;
        } else if (op === 'conditional') {
          if (
            uncertainPageCount
            && (step.condition.type === 'page_count_gt' || step.condition.type === 'page_count_lt')
          ) {
            errors.push('Conditional page-count branch cannot be predicted after an unknown donor page count.');
            continue;
          }
          const matched = conditionMatches(step.condition);
          const selectedBranch = matched ? step.then : step.else ?? [];
          logs.push(`  → conditional: ${matched ? 'then' : 'else'} branch (${selectedBranch.length} step(s))`);
          // Nested execution now commits selector/current-page effects between
          // substeps; apply the same semantics during preflight.
          simulateSteps(selectedBranch, depth + 1, undefined, undefined, true);
        } else if (op === 'apply_template_vars') {
          Object.assign(templateVars, step.vars);
        } else if (op === 'replace_page') {
          modifiedBytes = true;
        } else if (op === 'reorder_pages') {
          if (step.order.length !== finalPageCount) {
            errors.push(`reorder_pages: expected ${finalPageCount} page indices, received ${step.order.length}.`);
          } else {
            modifiedBytes = true;
            currentPage = remapCurrentAfterReorder(currentPage, step.order);
            const nextSelection = remapSelectionAfterReorder(selection, step.order);
            if (pendingSelections) pendingSelections.push(nextSelection);
            else finalSelectedPages = nextSelection;
          }
        } else if (
          op === 'rotate_pages' || op === 'draw_text_on_pages'
          || op === 'header_footer_text' || op === 'inject_rich_text'
          || op === 'insert_image' || op === 'adjust_image'
          || op === 'draw_redaction_box' || op === 'place_rich_textbox'
          || op === 'place_professional_callout' || op === 'place_table'
        ) {
          modifiedBytes = true;
        } else {
          warnings.push(`Unknown step op: ${op} (step ${i + 1}) — skipped in dry-run`);
        }

        logs.push(`  → page count: ${finalPageCount}`);
      } catch (error) {
        errors.push(`Step ${i + 1} (${op}): ${String(error)}`);
        logs.push(`  → ERROR: ${String(error)}`);
      }
    }
  };

  simulateSteps(recipe.steps ?? []);

  const diff: MacroDryRunDiff = {
    initialPageCount,
    finalPageCount,
    modifiedBytes,
    selectedPagesBefore: initialSelectedPages,
    selectedPagesAfter: finalSelectedPages,
    currentPageBefore: initialCurrentPage,
    currentPageAfter: currentPage,
    outputFiles,
    annotationChanges: { added: 0, updated: 0, deleted: 0 },
    // Rich text, tables and callouts are committed into PDF bytes, not Writer state.
    writerChanges: { added: 0, updated: 0, deleted: 0 },
    warnings,
    logs,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    diff,
  };
}
