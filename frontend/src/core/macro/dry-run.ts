import type {
  MacroCondition,
  MacroDryRunDiff,
  MacroDryRunReport,
  MacroRecipe,
  MacroStep,
  PageSelector,
} from './types';
import { useSessionStore } from '@/core/session/store';
import { resolvePageSelector } from './steps/page-ops';
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
  const currentPage = ctx.currentPage ?? sessionState.viewState.currentPage;
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

  // A conditional operation applies its nested page-count effects immediately,
  // but its selection side-effects are delivered to the parent after the branch.
  // Keep the branch selection snapshot until that delivery to match the executor.
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
          finalPageCount += Math.max(1, Math.floor(step.count ?? 1));
          modifiedBytes = true;
        } else if (op === 'duplicate_pages') {
          const pages = resolvePages(step.selector, selection);
          finalPageCount += pages.length;
          modifiedBytes ||= pages.length > 0;
        } else if (op === 'remove_pages' || op === 'split_pages') {
          const pages = resolvePages(step.selector, selection);
          if (pages.length > 0) {
            const resultingCount = finalPageCount - pages.length;
            if (resultingCount < 1) {
              warnings.push(`${op}: removal of all pages may be rejected by the PDF engine.`);
            }
            finalPageCount = Math.max(1, resultingCount);
            modifiedBytes = true;
            const nextSelection = op === 'split_pages'
              ? []
              : selection.filter((page) => !pages.includes(page) && page <= finalPageCount);
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
          const selectedAtBranchStart = [...selection];
          const branchPending: number[][] = [];
          simulateSteps(selectedBranch, depth + 1, selectedAtBranchStart, branchPending, true);
          if (pendingSelections) pendingSelections.push(...branchPending);
          else for (const nextSelection of branchPending) finalSelectedPages = nextSelection;
        } else if (op === 'apply_template_vars') {
          Object.assign(templateVars, step.vars);
        } else if (op === 'replace_page') {
          modifiedBytes = true;
        } else if (op === 'reorder_pages') {
          if (step.order.length !== finalPageCount) {
            errors.push(`reorder_pages: expected ${finalPageCount} page indices, received ${step.order.length}.`);
          } else {
            modifiedBytes = true;
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
