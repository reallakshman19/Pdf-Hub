// src/core/annotation-core/annotation-identity.ts
// ⚠️ INVARIANT: Both geometrySha256 and contentSha256 must be computed
//   AFTER the rendering phase — not from planning-time data (AD-06).

export interface GeneratedAnnotationIdentity {
  /** Schema version for forward-compatibility */
  schemaVersion: number;
  /** Discriminator type string (e.g., 'ps-isonote-callout') */
  objectType: string;
  /** SHA-256 of source document bytes at time of annotation */
  sourceDocumentSha256: string;
  /** SHA-256 of the mapping row/data driving this annotation */
  mappingSha256: string;
  /** Unique ID stable across re-renders of the same mapping on the same document */
  occurrenceId: string;
  /** SHA-256 of the rendered text content (after typography wrapping) */
  contentSha256: string;
  /** SHA-256 of the committed box geometry and leader coordinates */
  geometrySha256: string;
  /** StyleContract version string (e.g., 'v1') */
  styleVersion: string;
  /** PlacementPolicy version string for audit traceability */
  placementProfileVersion: string;
}
