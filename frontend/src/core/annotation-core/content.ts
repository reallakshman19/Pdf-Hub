// src/core/annotation-core/content.ts
// ⚠️ INVARIANT: AnnotationField.value MUST be the raw value WITHOUT display prefix (AD-01).
// The rendering layer alone applies "Tag: ", "ISO Note: " etc.

export interface AnnotationField {
  /** Machine-readable key (e.g., 'action', 'isoNote', 'confidence') */
  key: string;
  /** Human-readable label for the rendering layer to prepend (e.g., 'Tag', 'ISO Note') */
  label: string;
  /** Raw value without prefix. MUST NOT start with the label text. */
  value: string;
}

export interface AnnotationContent {
  /** Optional bold title line shown above all fields */
  title?: string;
  /** Ordered list of key/value fields to display */
  fields: readonly AnnotationField[];
  /** Severity hint for styling decisions */
  severity?: 'info' | 'warning' | 'critical';
}
