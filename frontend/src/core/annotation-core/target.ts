// src/core/annotation-core/target.ts
// ⚠️ INVARIANT: This module must NOT import any psIsonote workflow module (AD-05).

export interface AnnotationTarget {
  /** 1-indexed page number */
  pageNumber: number;
  /** Exact anchor point in PDF coordinate space (top-left origin, points) */
  anchor: { x: number; y: number };
  /** Source text bounding rect (optional — used for protection policy) */
  bounds?: { x: number; y: number; width: number; height: number };
  /** Discriminator for the target type (e.g., 'ps-number', 'weld-id', 'valve-tag') */
  kind: string;
  /** Original matched text from the PDF text layer */
  sourceText?: string;
}
