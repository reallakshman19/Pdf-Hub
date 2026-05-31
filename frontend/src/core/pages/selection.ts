/*
 * Page selection helpers for DocCraft.
 *
 * The selection logic here implements common behaviours found in
 * multi‑selection lists.  Shift‑click selects a continuous range,
 * Ctrl/Cmd‑click toggles individual pages, and a plain click selects a
 * single page.  The anchor is updated on plain and additive selections
 * but preserved during shift‑selection.
 */

import type { PageSelectionState } from './types';

/**
 * Resolves a new selection state based on user input.
 *
 * @param pageIds The ordered list of page identifiers in the current document.
 * @param current The current selection state.
 * @param clickedId The page identifier that was clicked.
 * @param event An object describing modifier keys held during the click.
 * @returns The new selection state.
 */
export function resolvePageSelection(
  pageIds: string[],
  current: PageSelectionState,
  clickedId: string,
  event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
): PageSelectionState {
  const additive = event.ctrlKey || event.metaKey;

  // If Shift is pressed and we have an anchor, select a range.
  if (event.shiftKey && current.anchorPageId) {
    const anchorIndex = pageIds.indexOf(current.anchorPageId);
    const clickedIndex = pageIds.indexOf(clickedId);

    // Fallback to single selection if indices are invalid.
    if (anchorIndex === -1 || clickedIndex === -1) {
      return {
        selectedPageIds: [clickedId],
        anchorPageId: clickedId,
        focusedPageId: clickedId,
      };
    }

    const [from, to] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
    const range = pageIds.slice(from, to + 1);

    const newSelection = additive
      ? Array.from(new Set([...current.selectedPageIds, ...range]))
      : range;

    return {
      selectedPageIds: newSelection,
      anchorPageId: current.anchorPageId,
      focusedPageId: clickedId,
    };
  }

  // If additive selection (Ctrl/Cmd) toggle the clicked page.
  if (additive) {
    const exists = current.selectedPageIds.includes(clickedId);
    const newSelected = exists
      ? current.selectedPageIds.filter((id) => id !== clickedId)
      : [...current.selectedPageIds, clickedId];

    return {
      selectedPageIds: newSelected,
      anchorPageId: clickedId,
      focusedPageId: clickedId,
    };
  }

  // Otherwise single selection.
  return {
    selectedPageIds: [clickedId],
    anchorPageId: clickedId,
    focusedPageId: clickedId,
  };
}