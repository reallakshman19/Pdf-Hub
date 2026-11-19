import { describe, expect, it } from 'vitest';
import { advanceMacroPageLineage, initialMacroPageLineage } from './pageLineage';
import type { MacroMutableState, StepResult } from './registry';
import type { MacroStep } from './types';

function start(pageCount = 3): MacroMutableState {
  return {
    workingBytes: new Uint8Array([1]),
    pageCount,
    selectedPages: [2],
    currentPage: 2,
    pageLineage: initialMacroPageLineage(pageCount),
    lineageOrdinal: 0,
    templateVars: {},
    logs: [],
    outputFiles: [],
  };
}
function applied(
  state: MacroMutableState,
  step: MacroStep,
  newCount?: number,
): void {
  const result: StepResult = {
    status: 'success',
    sideEffects: newCount === undefined
      ? []
      : [{ type: 'page_count_changed', newCount }],
  };
  advanceMacroPageLineage(state, step, result);
  if (newCount !== undefined) state.pageCount = newCount;
}

describe('WP07 source lineage from actual structural macro steps', () => {
  it('follows B after deleting A, duplicating B and reordering the resulting pages', () => {
    const state = start();
    applied(state, { op: 'remove_pages', selector: { mode: 'list', pages: [1] } }, 2);
    expect(state.pageLineage?.map((p) => p.sourceIndex)).toEqual([1, 2]);
    state.selectedPages = [1];
    state.currentPage = 1;
    applied(state, { op: 'duplicate_pages', selector: { mode: 'selected' } }, 3);
    expect(state.pageLineage?.map((p) => p.sourceIndex)).toEqual([1, 1, 2]);
    expect(new Set(state.pageLineage?.map((p) => p.instanceId)).size).toBe(3);
    applied(state, { op: 'reorder_pages', order: [3, 2, 1] });
    expect(state.pageLineage?.map((p) => p.sourceIndex)).toEqual([2, 1, 1]);
    expect(state.pageLineage?.[2].instanceId).toBe('source-1');
  });

  it('never attributes inserted or replaced pages to a previous owner', () => {
    const state = start();
    applied(state, { op: 'replace_page', targetPage: 2, donorFileId: 'donor', donorPage: 1 });
    expect(state.pageLineage?.[1].sourceIndex).toBeNull();
    applied(state, { op: 'insert_blank_page', position: { mode: 'start' }, size: 'a4', count: 2 }, 5);
    expect(state.pageLineage?.map((p) => p.sourceIndex)).toEqual([null, null, 0, null, 2]);
  });

  it('inserts a verified donor range rather than assuming donor length is one', () => {
    const state = start();
    applied(state, { op: 'insert_pdf', donorFileId: 'donor', atIndex: 1 }, 6);
    expect(state.pageLineage?.map((p) => p.sourceIndex)).toEqual([0, null, null, null, 1, 2]);
  });

  it('rejects unknown or contradictory output ownership before commit', () => {
    const state = start();
    expect(() => applied(state, { op: 'duplicate_pages', selector: { mode: 'selected' } }, 3))
      .toThrow(/does not match duplicate_pages output count/);
    expect(() => applied(start(), { op: 'reorder_pages', order: [1, 1, 3] }))
      .toThrow(/invalid or duplicate source page/);
    expect(() => applied(start(), { op: 'remove_pages', selector: { mode: 'all' } }, 1))
      .toThrow(/does not match remove_pages output count/);
  });

  it('is unchanged for a purely visual macro step', () => {
    const state = start();
    applied(state, { op: 'rotate_pages', selector: { mode: 'current' }, degrees: 90 });
    expect(state.pageLineage).toEqual(initialMacroPageLineage(3));
  });
});
