/*
 * Selection store for DocCraft.
 *
 * This store manages the current editor selection across multiple
 * entity types (pages, annotations, writer overlays, OCR blocks,
 * bookmarks, redaction previews).  It exposes methods to set and
 * retrieve the selection state.  No external state management library
 * is required.
 */

import type { SelectionState, SelectionKind } from './types';

export class SelectionStore {
  private state: SelectionState;

  constructor() {
    this.state = { kind: 'none', ids: [] };
  }

  /**
   * Returns a shallow copy of the current selection state.
   */
  getState(): SelectionState {
    return { ...this.state, ids: [...this.state.ids] };
  }

  /**
   * Updates the selection to a new state.  Callers should specify the
   * kind and ids; pageNumber is optional depending on the selection kind.
   *
   * @param kind The kind of selection.
   * @param ids The identifiers of the selected objects.
   * @param pageNumber Optional page number associated with the selection.
   */
  setSelection(kind: SelectionKind, ids: string[], pageNumber?: number): void {
    this.state = { kind, ids: ids.slice(), pageNumber };
  }

  /**
   * Clears the current selection.
   */
  clear(): void {
    this.state = { kind: 'none', ids: [] };
  }
}