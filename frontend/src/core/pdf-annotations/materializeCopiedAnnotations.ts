import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

/**
 * Resolve in-memory native copies before a page mutation changes their source
 * or destination coordinate systems. The returned bytes are still local to
 * the enclosing document transaction; no separate save or revision occurs.
 */
export async function materializeCopiedAnnotations(
  bytes: Uint8Array,
  annotations: PdfAnnotation[],
): Promise<{ bytes: Uint8Array; annotations: PdfAnnotation[] }> {
  if (!annotations.some((annotation) => annotation.data.nativeCopySource)) return { bytes, annotations };
  const written = await writeNativePdfAnnotations(bytes, annotations, { replaceManagedAnnotations: true });
  const imported = (await readNativePdfAnnotations(written.bytes)).annotations;
  const key = (item: PdfAnnotation) => `${item.pageNumber}\u0000${item.data.nativeOriginalName ?? item.id}`;
  const byKey = new Map<string, PdfAnnotation>();
  for (const item of imported) {
    const identity = key(item);
    if (byKey.has(identity)) throw new Error('Cannot safely resolve copied annotations before changing pages: ambiguous identity.');
    byKey.set(identity, item);
  }
  if (imported.length !== annotations.length) throw new Error('Cannot safely resolve copied annotations before changing pages: annotation count changed.');
  const refreshed = annotations.map((item) => {
    const saved = byKey.get(key(item));
    if (!saved || saved.type !== item.type) throw new Error('Cannot safely resolve copied annotations before changing pages: annotation identity changed.');
    const data = { ...item.data };
    delete data.nativeCopySource;
    delete data.nativeSourceRef;
    delete data.nativeAppearanceRef;
    delete data.nativeAppearanceRotation;
    delete data.nativeAppearancePageRotation;
    delete data.nativeStampCopySourceBasisRotation;
    delete data.nativeDeletedReplyIds;
    // The freshly written native appearance and vertices already include the
    // rotation; retaining its pending marker would apply it twice on save.
    delete (data as typeof data & { nativePolygonQuarterTurns?: number }).nativePolygonQuarterTurns;
    delete (data as typeof data & { nativeInkQuarterTurns?: number }).nativeInkQuarterTurns;
    delete (data as typeof data & { nativeLineQuarterTurns?: number }).nativeLineQuarterTurns;
    delete data.nativeBoxShapeTurn;
    delete data.nativeBoxShapeImported;
    delete data.nativeBoxShapeHasAppearance;
    delete data.nativeBoxShapeSourceHash;
    delete data.nativeBoxShapeGenerated;
    delete data.nativeBoxShapeGeneratedOrientation;
    delete data.nativeInterop;
    delete data.review;
    return { ...item, rect: saved.rect, data: { ...data, ...saved.data } };
  });
  return { bytes: written.bytes, annotations: refreshed };
}
