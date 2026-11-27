/**
 * Types for secure redaction and content sanitization.
 *
 * Implements Phase 9 true cryptographic & content stream redaction,
 * irreversible text and annotation purging, and verifiable audit manifests.
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
 * to redact.
 */
export interface RedactionRegion {
  /** Unique identifier for the region. */
  id: string;
  /** 1‑based page number. */
  pageNumber: number;
  /** Bounding box in PDF points. */
  rect: PdfRect;
  /** Optional reason or note supplied by the user (e.g. 'PII', 'HIPAA', 'Confidential'). */
  reason?: string;
  /** Visual burn-in color ('black' or 'white'). */
  fillColor?: 'black' | 'white';
  /** Status of the region. */
  status: 'preview' | 'applied';
  /** Linked canvas annotation ID when created from the Redact drawing tool. */
  sourceAnnotationId?: string;
}

/**
 * Specification of a target redaction to be executed by the sanitization engine.
 */
export interface RedactionTarget {
  id?: string;
  /** 0-based page index. */
  pageIndex: number;
  /** Bounding box in PDF points. */
  rect: PdfRect;
  /** Optional reason for auditing. */
  reason?: string;
  /** Fill color for the burn-in rectangle (default: 'black'). */
  fillColor?: 'black' | 'white';
}

/**
 * Per-region audit record tracking what content was permanently removed.
 */
export interface RedactionAuditRecord {
  regionId: string;
  pageIndex: number; // 0-based
  pageNumber: number; // 1-based
  rect: PdfRect;
  reason?: string;
  purgedTextCharacters: number;
  purgedAnnotationsCount: number;
  purgedImagesCount?: number;
  timestamp: string;
}

/**
 * Machine-readable cryptographic audit manifest accompanying redacted exports.
 */
export interface RedactionAuditManifest {
  schemaVersion: 1;
  documentKey: string;
  originalFileName: string;
  originalSha256: string;
  redactedSha256: string;
  timestamp: string;
  totalRedactionsApplied: number;
  purgedTextCharacterCount: number;
  purgedAnnotationsCount: number;
  purgedImagesCount?: number;
  metadataScrubbed?: boolean;
  redactedPages: number[];
  records: RedactionAuditRecord[];
}

/**
 * Result of executing irreversible content sanitization.
 */
export interface RedactionSanitizationResult {
  sanitizedBytes: Uint8Array;
  purgedTextCharacterCount: number;
  purgedAnnotationsCount: number;
  purgedImagesCount?: number;
  metadataScrubbed?: boolean;
  appliedRedactionCount: number;
  redactedPages: number[];
  records: RedactionAuditRecord[];
}

/**
 * Internal store state for redaction. Maintains a list of regions and an
 * incrementing numeric counter used to generate unique IDs.
 */
export interface RedactionState {
  regions: RedactionRegion[];
  nextId: number;
}
