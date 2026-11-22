import type { PdfAnnotation } from './types';

/** A missing sidecar entry is NEVER a deletion. Only a user deletion command
 * with a revision-scoped native object identity can authorize /Annots removal.
 */
export interface NativeDeletionTombstone {
  sourceRevision: string;
  sourceRef: string;
  sourceName: string;
  pageNumber: number;
  pageId: string;
  commandId: string;
}

export type NativeIntegrityStatus = 'LOADING' | 'COMPLETE' | 'INCOMPLETE' | 'FAILED';

export interface NativeIntegrityState {
  status: NativeIntegrityStatus;
  documentKey: string | null;
  reason?: string;
  cacheState?: 'EMPTY' | 'VALID' | 'UNAVAILABLE';
}

export type NativeEditableField = 'rect' | 'text' | 'anchor' | 'knee' | 'leaderStyle' | 'arrowHead';

export interface NativeEditProvenance {
  sourceRevision: string;
  sourceRef: string;
  commandId: string;
  fields: NativeEditableField[];
}

export interface NativeDeletionAuthorization {
  /** The source document fingerprint, before Writer element baking. */
  sourceRevision: string;
  /** PageGraph identity at the same source revision; in PDF page order. */
  sourcePageIds: readonly string[];
  tombstones: readonly NativeDeletionTombstone[];
}

const fields: readonly NativeEditableField[] = [
  'rect', 'text', 'anchor', 'knee', 'leaderStyle', 'arrowHead',
];

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Called from explicit annotation update actions, never during hydration. */
export function withNativeEditProvenance(
  previous: PdfAnnotation,
  next: PdfAnnotation,
  sourceRevision: string | null,
  commandId: string,
): PdfAnnotation {
  const sourceRef = previous.data.nativeSourceRef;
  if (!sourceRevision || !sourceRef || previous.data.nativeCopySource) return next;
  const changed = fields.filter((field) =>
    field === 'rect'
      ? !same(previous.rect, next.rect)
      : !same(previous.data[field], next.data[field]));
  if (!changed.length) return next;
  const existing = previous.data.nativeEditProvenance;
  const previouslyEdited = existing?.sourceRevision === sourceRevision
    && existing.sourceRef === sourceRef ? existing.fields : [];
  return {
    ...next,
    data: {
      ...next.data,
      nativeEditProvenance: {
        sourceRevision, sourceRef, commandId,
        fields: [...new Set([...previouslyEdited, ...changed])],
      },
    },
  };
}

export function authorizedEditFields(
  annotation: PdfAnnotation,
  source: PdfAnnotation,
  sourceRevision: string,
): ReadonlySet<NativeEditableField> {
  const proof = annotation.data.nativeEditProvenance;
  return new Set(
    proof?.sourceRevision === sourceRevision
      && proof.sourceRef === source.data.nativeSourceRef
      && typeof proof.commandId === 'string'
      && proof.commandId.length > 0
      && Array.isArray(proof.fields)
      ? proof.fields.filter((field): field is NativeEditableField =>
          fields.includes(field))
      : [],
  );
}

export function createNativeDeletionTombstone(
  annotation: PdfAnnotation,
  sourceRevision: string | null,
  pageId: string | undefined,
  commandId: string,
): NativeDeletionTombstone | null {
  if (!sourceRevision || !annotation.data.nativeSourceRef
    || annotation.data.nativeCopySource || !pageId) return null;
  return {
    sourceRevision,
    sourceRef: annotation.data.nativeSourceRef,
    sourceName: annotation.data.nativeOriginalName ?? annotation.id,
    pageNumber: annotation.pageNumber,
    pageId,
    commandId,
  };
}

export function isValidNativeDeletionTombstone(value: unknown): value is NativeDeletionTombstone {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<NativeDeletionTombstone>;
  return typeof t.sourceRevision === 'string' && t.sourceRevision.length > 0
    && typeof t.sourceRef === 'string' && /^\d+\s+\d+\s+R$/.test(t.sourceRef)
    && typeof t.sourceName === 'string' && t.sourceName.length > 0
    && Number.isInteger(t.pageNumber) && (t.pageNumber ?? 0) > 0
    && typeof t.pageId === 'string' && t.pageId.length > 0
    && typeof t.commandId === 'string' && t.commandId.length > 0;
}

/** A tombstone is relevant only to the *exact* original PDF object. */
export function deletionKey(tombstone: NativeDeletionTombstone): string {
  return JSON.stringify([tombstone.pageNumber, tombstone.sourceRef]);
}
