import type { PdfAnnotation } from '@/core/annotations/types';

/** Evidence comes from the actual PDF /Annots tree, before parser filtering. */
export interface NativeSourceRootEvidence {
  pageNumber: number;
  /** Indirect PDF object ref, or a stable page/index fallback for direct objects. */
  sourceRef: string;
  subtype: string;
  visible: boolean;
  supported: boolean;
  hasAppearance: boolean;
  /** Set only when the native reader successfully materialized this root. */
  parsedId?: string;
}

export interface NativeAnnotationCoverageReport {
  sourceCount: number;
  parsedCount: number;
  modelCount: number;
  intentionalDeletions: number;
  /** PDF roots of a recognized subtype that the parser could not import. */
  missingFromParser: string[];
  /** Parsed source roots missing from the hydrated overlay, excluding tombstones. */
  missingFromModel: string[];
  /** The same PDF source ref appears more than once in the active model. */
  duplicateInModel: string[];
  /** Visible supported native roots lacking a normal /AP; a viewer may draw an icon. */
  noSourceAppearance: string[];
  /** Present in /Annots but not a supported visible interactive root. */
  excludedRoots: string[];
}

export function nativeAnnotationIdentity(item: PdfAnnotation): string {
  return JSON.stringify([
    item.pageNumber,
    item.data.nativeSourceRef ?? item.data.nativeOriginalName ?? item.id,
  ]);
}

function evidenceKey(pageNumber: number, sourceRef: string): string {
  return JSON.stringify([pageNumber, sourceRef]);
}

/**
 * Pure stage-by-stage check. Never treats a copied annotation as the original
 * object, and never labels an intentional deletion as a hydration failure.
 * Source object keys (not counts) reveal equal-count substitutions.
 */
export function summarizeNativeAnnotationCoverage(
  roots: readonly NativeSourceRootEvidence[],
  parsed: readonly PdfAnnotation[],
  model: readonly PdfAnnotation[],
  previousSourceKeys: readonly string[] | null,
): NativeAnnotationCoverageReport {
  const eligible = roots.filter((item) => item.visible && item.supported);
  const parsedSourceKeys = new Set(parsed
    .filter((item) => !item.data.nativeCopySource)
    .map(nativeAnnotationIdentity));
  const sourceKeys = roots.length
    ? eligible.filter((root) => root.parsedId)
      .map((root) => evidenceKey(root.pageNumber, root.sourceRef))
    : [...parsedSourceKeys];

  const modelKeys = new Map<string, number>();
  for (const item of model) {
    if (item.data.nativeCopySource) continue;
    const key = nativeAnnotationIdentity(item);
    modelKeys.set(key, (modelKeys.get(key) ?? 0) + 1);
  }

  const tombstones = new Set(previousSourceKeys ?? []);
  const missingFromModel = sourceKeys.filter((key) =>
    !modelKeys.has(key) && !tombstones.has(key));
  const intentionalDeletions = sourceKeys.filter((key) =>
    !modelKeys.has(key) && tombstones.has(key)).length;

  return {
    sourceCount: roots.length ? eligible.length : parsedSourceKeys.size,
    parsedCount: parsed.length,
    modelCount: model.length,
    intentionalDeletions,
    missingFromParser: eligible.filter((root) => !root.parsedId)
      .map((root) => evidenceKey(root.pageNumber, root.sourceRef)),
    missingFromModel,
    duplicateInModel: [...modelKeys.entries()]
      .filter(([, count]) => count > 1).map(([key]) => key),
    noSourceAppearance: eligible.filter((root) => !root.hasAppearance)
      .map((root) => evidenceKey(root.pageNumber, root.sourceRef)),
    excludedRoots: roots.filter((root) => !root.visible || !root.supported)
      .map((root) => evidenceKey(root.pageNumber, root.sourceRef)),
  };
}
