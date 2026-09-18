/*
 * Canonical page-domain types for PDF Hub.
 *
 * Page identity is stable; physical position is mutable.  Do not use the
 * current page index/number as identity.  PDF logical PageLabels are also a
 * separate concept from both identity and printed page-number content.
 */

export type PageId = string;

export type PageRotation = 0 | 90 | 180 | 270;

/**
 * Canonical page entity used by the future PageGraph/session model.
 *
 * Naming deliberately preserves the repository's established `pageId` and
 * `currentIndex` vocabulary so Phase 5 does not create a second page model.
 */
export interface PageNode {
  /** Stable identity for the page within the editing session. */
  pageId: PageId;

  /** The document identity from which this node was admitted. */
  documentKey: string;

  /**
   * Original one-based source page number, when the page came from the
   * admitted source PDF.  Inserted/generated pages may use 0.
   */
  originalPageNumber: number;

  /**
   * Current zero-based physical position.  This changes after structural
   * operations and must never be used as persistent identity.
   */
  currentIndex: number;

  /** Page dimensions in PDF points. */
  width: number;
  height: number;

  /** Page rotation in degrees. */
  rotation: PageRotation;

  /**
   * Resolved logical PDF page label for the current physical position.
   * This is metadata from /PageLabels, not stable identity, and does not draw
   * visible numbering on the page.
   */
  logicalLabel?: string;
}

export interface PageGraph<TPage extends PageNode = PageNode> {
  pages: TPage[];
}

/**
 * UI-enriched page descriptor used by the existing page organizer.
 *
 * It extends the canonical PageNode instead of defining a parallel identity
 * model.  Phase 5 migrations can therefore move page-dependent state onto
 * PageId incrementally without breaking the current thumbnail UI.
 */
export interface PageDescriptor extends PageNode {
  /**
   * Legacy/custom UI label.  This is NOT the PDF /PageLabels value.
   * Prefer logicalLabel for real PDF page-label semantics.
   */
  label?: string;

  /**
   * Optional OCR status used for thumbnail badges.  This is not persisted
   * into PDF page-label metadata.
   */
  ocrStatus?: 'none' | 'queued' | 'running' | 'complete' | 'failed' | 'low-confidence';

  /** Number of annotations on the page, for UI badges. */
  annotationCount: number;

  /** Optional cached thumbnail URL/data URI. */
  thumbnailUrl?: string;
}

/**
 * Page-organizer selection uses PageId, not physical page number.
 */
export interface PageSelectionState {
  selectedPageIds: PageId[];
  anchorPageId: PageId | null;
  focusedPageId: PageId | null;
}
