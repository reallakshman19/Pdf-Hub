/**
 * Types for redaction preview support.
 *
 * The redaction system in this front‑end only release is intentionally limited
 * to marking regions on pages and exporting a JSON plan. Final redaction (i.e.
 * removing underlying PDF content) is deferred to a future server‑side
 * implementation. See `docs/REMAINING_BACKEND_DEFERRED_REGISTER.md` for more
 * details.
 */

/** A rectangle in PDF coordinate space. */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A redaction region represents an area on a single page that the user wishes
 * to redact. Regions are purely advisory in this preview release.
 */
export interface RedactionRegion {
  /** Unique identifier for the region. */
  id: string;
  /** 1‑based page number. */
  pageNumber: number;
  /** Bounding box in PDF points. */
  rect: PdfRect;
  /** Optional reason or note supplied by the user. */
  reason?: string;
  /**
   * Status of the region. Only `preview` is permitted in the front‑end
   * implementation. Additional statuses may be added when server support
   * becomes available.
   */
  status: 'preview';
}

/**
 * Internal store state for redaction. Maintains a list of regions and an
 * incrementing numeric counter used to generate unique IDs.
 */
export interface RedactionState {
  regions: RedactionRegion[];
  nextId: number;
}