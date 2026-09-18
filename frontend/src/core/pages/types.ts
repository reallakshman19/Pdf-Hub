/*
 * Canonical page-domain types for PDF Hub.
 *
 * Page identity is stable; physical position is mutable.  Do not use the
 * current page index/number as identity.  PDF logical PageLabels are also a
 * separate concept from both identity and printed page-number content.
 */

export type PageId = string;

export type PageRotation = 0 | 90 | 180 | 270;

export type PageLabelStyle =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'letters-lower'
  | 'letters-upper';

export interface PageLabelRange {
  /** Stable page identity where this logical-label range begins. */
  startPageId: PageId;
  /** Omit style for prefix-only labels such as "Cover". */
  style?: PageLabelStyle;
  prefix?: string;
  /** Positive starting value for styled ranges. Defaults to 1. */
  startNumber?: number;
}

export type PageLabelStyle =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'letters-lower'
  | 'letters-upper';

export interface PageLabelRange {
  /** Stable page identity where this label range begins. */
  startPageId: PageId;
  /** Omit for prefix-only labels. */
  style?: PageLabelStyle;
  prefix?: string;
  /** Positive start value; defaults to 1 when style is present. */
  startNumber?: number;
}

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
  /**
   * Canonical PDF Hub labeling rules. Undefined means no canonical range model
   * has been established (for example, third-party labels read only as resolved
   * strings). [] means the document is explicitly configured with no PageLabels.
   */
  pageLabelRanges?: PageLabelRange[];
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
