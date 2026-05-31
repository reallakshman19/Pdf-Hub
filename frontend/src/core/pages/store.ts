/*
 * Page store for DocCraft.
 *
 * This simple store manages the list of pages for the current document
 * and the selection state for organize mode.  It exposes methods for
 * updating pages and selection without relying on external state
 * libraries.  Additional operations (reorder, rotate, extract) are
 * provided as standalone functions in separate modules to keep this
 * store focused.
 */

import type { PageDescriptor, PageSelectionState } from './types';
import { resolvePageSelection } from './selection';

export class PageStore {
  private pages: PageDescriptor[] = [];
  private selection: PageSelectionState = {
    selectedPageIds: [],
    anchorPageId: null,
    focusedPageId: null,
  };

  /**
   * Loads a new set of pages into the store.  The current selection is
   * reset.
   */
  setPages(pages: PageDescriptor[]): void {
    this.pages = pages.map((p, i) => ({ ...p, currentIndex: i }));
    this.selection = {
      selectedPageIds: [],
      anchorPageId: null,
      focusedPageId: null,
    };
  }

  /**
   * Returns a shallow copy of the page descriptors.
   */
  getPages(): PageDescriptor[] {
    return this.pages.slice();
  }

  /**
   * Returns the current selection state.
   */
  getSelection(): PageSelectionState {
    return { ...this.selection, selectedPageIds: [...this.selection.selectedPageIds] };
  }

  /**
   * Handles a click on a page.  Applies selection logic and updates the
   * internal selection state.
   *
   * @param clickedId The identifier of the clicked page.
   * @param event The click event modifiers (shift, ctrl, meta).
   */
  clickPage(clickedId: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void {
    this.selection = resolvePageSelection(
      this.pages.map((p) => p.pageId),
      this.selection,
      clickedId,
      event
    );
  }

  /**
   * Clears the current selection.
   */
  clearSelection(): void {
    this.selection = {
      selectedPageIds: [],
      anchorPageId: null,
      focusedPageId: null,
    };
  }

  /**
   * Updates the stored pages array.  Accepts an updated list and
   * reassigns currentIndex automatically.
   */
  updatePages(pages: PageDescriptor[]): void {
    this.pages = pages.map((p, i) => ({ ...p, currentIndex: i }));
    // Strip out any selections that no longer exist.
    const validIds = new Set(pages.map((p) => p.pageId));
    this.selection.selectedPageIds = this.selection.selectedPageIds.filter((id) => validIds.has(id));
    if (this.selection.anchorPageId && !validIds.has(this.selection.anchorPageId)) {
      this.selection.anchorPageId = null;
    }
    if (this.selection.focusedPageId && !validIds.has(this.selection.focusedPageId)) {
      this.selection.focusedPageId = null;
    }
  }
}