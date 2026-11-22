import type { MacroStep, PageSelector, InsertPosition } from './types';
import type { MacroMutableState, StepResult } from './registry';
import { resolvePageSelector } from './steps/page-ops';

/**
 * Each original source page has a unique instance. Copies preserve origin
 * ownership but get distinct instance IDs; replacements and donor pages have
 * no source owner. This is based on successful executed steps, NOT guessed from
 * final page counts or PDF content.
 */
export interface MacroPageLineageEntry {
  sourceIndex: number | null;
  instanceId: string;
}

export function initialMacroPageLineage(count: number): MacroPageLineageEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    sourceIndex: index,
    instanceId: `source-${index}`,
  }));
}

function inserted(state: MacroMutableState, sourceIndex: number | null): MacroPageLineageEntry {
  state.lineageOrdinal = (state.lineageOrdinal ?? 0) + 1;
  return {
    sourceIndex,
    instanceId: `new-${state.lineageOrdinal}`,
  };
}

function positionIndex(position: InsertPosition, count: number, currentPage: number): number {
  if (position.mode === 'start') return 0;
  if (position.mode === 'end') return count;
  if (position.mode === 'before') return Math.max(0, Math.min(position.page - 1, count));
  if (position.mode === 'after') return Math.max(0, Math.min(position.page, count));
  return position.mode === 'before-current'
    ? Math.max(0, Math.min(currentPage - 1, count))
    : Math.max(0, Math.min(currentPage, count));
}

function selected(state: MacroMutableState, selector: PageSelector): number[] {
  return resolvePageSelector(selector, {
    pageCount: state.pageCount,
    selectedPages: state.selectedPages,
    currentPage: state.currentPage,
  });
}

function changeCount(result: StepResult): number | undefined {
  return result.sideEffects
    .flatMap((effect) => effect.type === 'page_count_changed' ? [effect.newCount] : [])
    .at(-1);
}

/**
 * Advance only after an actual successful step result, before applying its
 * state effects. The resulting lineage must equal the executor's observed
 * page count. Conditional children call this directly during their run.
 */
export function advanceMacroPageLineage(
  state: MacroMutableState,
  step: MacroStep,
  result: StepResult,
): void {
  if (!state.pageLineage || result.status !== 'success') return;
  if (step.op === 'conditional') return; // children already advanced in sequence
  const before = state.pageLineage;
  if (before.length !== state.pageCount) {
    throw new Error('Macro PageId lineage is out of sync with its source page count.');
  }
  let next = before;
  const afterCount = changeCount(result);
  const currentPage = state.currentPage ?? 1;
  const addPages = (at: number, numberToInsert: number) => {
    if (numberToInsert < 0 || !Number.isInteger(numberToInsert)) {
      throw new Error('Macro donor page count is inconsistent with source lineage.');
    }
    next = [
      ...next.slice(0, at),
      ...Array.from({ length: numberToInsert }, () => inserted(state, null)),
      ...next.slice(at),
    ];
  };

  switch (step.op) {
    case 'remove_pages':
    case 'split_pages': {
      const removed = new Set(selected(state, step.selector));
      next = before.filter((_, index) => !removed.has(index + 1));
      break;
    }
    case 'duplicate_pages': {
      const duplicated = new Set(selected(state, step.selector));
      next = before.flatMap((origin, index) => (
        duplicated.has(index + 1)
          ? [origin, inserted(state, origin.sourceIndex)]
          : [origin]
      ));
      break;
    }
    case 'reorder_pages': {
      const numbers = step.order;
      if (
        numbers.length !== before.length
        || new Set(numbers).size !== before.length
        || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > before.length)
      ) {
        throw new Error('Macro reorder has invalid or duplicate source page indices.');
      }
      next = numbers.map((oneBased) => before[oneBased - 1]);
      break;
    }
    case 'insert_blank_page': {
      let current = currentPage;
      let count = before.length;
      const insertedCount = Math.max(1, Math.floor(step.count ?? 1));
      for (let index = 0; index < insertedCount; index += 1) {
        const at = positionIndex(step.position, count, current);
        addPages(at, 1);
        if (current > at) current += 1;
        count += 1;
      }
      break;
    }
    case 'insert_pdf': {
      if (afterCount === undefined) throw new Error('Inserted PDF omitted verified page count.');
      const at = Math.max(0, Math.min(step.atIndex, before.length));
      addPages(at, afterCount - before.length);
      break;
    }
    case 'merge_files': {
      if (afterCount === undefined) throw new Error('Merged PDF omitted verified page count.');
      addPages(before.length, afterCount - before.length);
      break;
    }
    case 'add_content_page':
    case 'add_image_header_page': {
      if (afterCount === undefined) throw new Error('Generated page omitted verified page count.');
      addPages(positionIndex(step.position, before.length, currentPage), afterCount - before.length);
      break;
    }
    case 'replace_page': {
      const target = step.targetPage - 1;
      if (target < 0 || target >= before.length || !Number.isInteger(target)) {
        throw new Error('Replacement page has no verified target page.');
      }
      next = [...before];
      next[target] = inserted(state, null);
      break;
    }
    default:
      if (afterCount !== undefined && afterCount !== before.length) {
        throw new Error(`Macro step ${step.op} changed page count without source lineage.`);
      }
  }

  if (afterCount !== undefined && next.length !== afterCount) {
    throw new Error(`Macro PageId lineage does not match ${step.op} output count.`);
  }
  const seen = new Set(next.map((entry) => entry.instanceId));
  if (seen.size !== next.length) {
    throw new Error('Macro PageId lineage contains repeated instance identities.');
  }
  state.pageLineage = next;
}
