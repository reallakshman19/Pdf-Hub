/* 
 * Page types for DocCraft.
 *
 * These interfaces describe page descriptors and selection state used by
 * the organize mode.  The model is kept simple to avoid introducing
 * external dependencies and can be extended later for additional
 * metadata (e.g. labels, OCR status badges).
 */

export interface PageDescriptor {
  /**
   * A stable unique identifier for the page.  This does not change even
   * when the page is reordered within the document.
   */
  pageId: string;
  /**
   * The key identifying the underlying document.  Multiple documents may
   * be open simultaneously in future versions of DocCraft.
   */
  documentKey: string;
  /**
   * The original one-based page number in the source document.
   */
  originalPageNumber: number;
  /**
   * The current zero-based index of the page in the working page list.
   * This value changes when pages are reordered.
   */
  currentIndex: number;
  /**
   * Width of the page in PDF points.
   */
  width: number;
  /**
   * Height of the page in PDF points.
   */
  height: number;
  /**
   * Page rotation.  Valid values are 0, 90, 180 and 270 degrees.
   */
  rotation: 0 | 90 | 180 | 270;
  /**
   * Optional user‑defined page label.
   */
  label?: string;
  /**
   * Optional OCR status.  This is used to display badges in the thumbnail
   * panel and is not persisted into the PDF itself.
   */
  ocrStatus?: 'none' | 'queued' | 'running' | 'complete' | 'failed' | 'low-confidence';
  /**
   * Number of annotations on the page.  Used to display annotation
   * badges.
   */
  annotationCount: number;
  /**
   * Optional URL or data URI for a cached thumbnail image.  When
   * undefined the viewer should display a skeleton or generate a
   * thumbnail on the fly.
   */
  thumbnailUrl?: string;
}

/**
 * Selection state for the page panel.  Tracks which pages are selected,
 * which page is the anchor for range selection, and which page has
 * keyboard focus.
 */
export interface PageSelectionState {
  /**
   * The identifiers of all selected pages.  May be an empty array if no
   * pages are selected.
   */
  selectedPageIds: string[];
  /**
   * The anchor page for shift‑range selection.  When undefined or null,
   * range selection falls back to single selection behaviour.
   */
  anchorPageId: string | null;
  /**
   * The page that most recently received keyboard focus or click
   * interaction.  Used to support keyboard operations like delete or
   * rotate on the focused page.
   */
  focusedPageId: string | null;
}