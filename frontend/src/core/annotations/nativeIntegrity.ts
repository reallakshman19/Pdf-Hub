import type { PdfAnnotation } from './types';
import type { PdfCommand } from '@/core/commands/types';

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

export type NativeEditableField =
  | 'rect' | 'text' | 'anchor' | 'knee' | 'leaderStyle' | 'arrowHead'
  | 'rotation' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'fontFamily'
  | 'textColor' | 'textAlign' | 'borderColor' | 'backgroundColor'
  | 'borderWidth' | 'borderStyle' | 'opacity';

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
  /** Issued annotation-history command IDs, verified independently from the
   * recovery-sidecar tombstones. Required for destructive native deletion.
   */
  verifiedCommandIds?: readonly string[];
}

export const nativeEditableFields: readonly NativeEditableField[] = [
  'rect', 'text', 'anchor', 'knee', 'leaderStyle', 'arrowHead',
  'rotation', 'fontSize', 'fontWeight', 'fontStyle', 'fontFamily',
  'textColor', 'textAlign', 'borderColor', 'backgroundColor',
  'borderWidth', 'borderStyle', 'opacity',
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
  const changed = nativeEditableFields.filter((field) =>
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
          nativeEditableFields.includes(field))
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


/** A native mutation witnessed by the canonical issued annotation transaction,
 * not copied from a mutable annotation sidecar or supplied by a PDF input.
 * Each field records the actual before/after transition; a forged cached
 * field that was already present before an unrelated edit cannot be certified.
 */
export interface NativeHistoryFieldChange {
  field: NativeEditableField;
  beforeValue?: unknown;
  afterValue?: unknown;
}
export interface NativeHistoryMutation {
  kind: 'EDIT' | 'DELETE';
  sourceRevision: string;
  sourceRef: string;
  sourceName: string;
  pageNumber: number;
  pageId: string;
  commandId: string;
  fields?: NativeHistoryFieldChange[];
}

export function issuedNativeMutations(
  command: PdfCommand,
  before: readonly PdfAnnotation[],
  after: readonly PdfAnnotation[],
  tombstones: readonly NativeDeletionTombstone[] = [],
): NativeHistoryMutation[] {
  if (command.type !== 'ANNOTATION_CHANGE') return [];
  const afterByKey = new Map(after.filter((item) =>
    item.data.nativeSourceRef && !item.data.nativeCopySource
  ).map((item) => [JSON.stringify([item.pageNumber, item.data.nativeSourceRef]), item]));
  const result: NativeHistoryMutation[] = [];
  for (const prior of before) {
    const sourceRef = prior.data.nativeSourceRef;
    if (!sourceRef || prior.data.nativeCopySource || !prior.pageId) continue;
    const current = afterByKey.get(JSON.stringify([prior.pageNumber, sourceRef]));
    if (!current) {
      const deleted = tombstones.find((item) => item.sourceRevision === command.documentKey
        && item.sourceRef === sourceRef && item.pageNumber === prior.pageNumber
        && item.pageId === prior.pageId && item.commandId === command.id
        && item.sourceName === (prior.data.nativeOriginalName ?? prior.id));
      if (deleted && command.payload.annotationIds.includes(prior.id)) result.push({
        kind: 'DELETE', sourceRevision: command.documentKey, sourceRef,
        sourceName: deleted.sourceName, pageNumber: prior.pageNumber,
        pageId: prior.pageId, commandId: command.id,
      });
      continue;
    }
    if (!command.payload.annotationIds.includes(prior.id)
      || current.id !== prior.id || current.pageId !== prior.pageId) continue;
    const fields: NativeHistoryFieldChange[] = [];
    for (const field of nativeEditableFields) {
      const a = field === 'rect' ? prior.rect : prior.data[field];
      const b = field === 'rect' ? current.rect : current.data[field];
      if (!same(a, b)) fields.push({ field, beforeValue: a, afterValue: b });
    }
    if (fields.length) result.push({
      kind: 'EDIT', sourceRevision: command.documentKey, sourceRef,
      sourceName: prior.data.nativeOriginalName ?? prior.id,
      pageNumber: prior.pageNumber, pageId: prior.pageId,
      commandId: command.id, fields,
    });
  }
  return result;
}

/** A tombstone is relevant only to the *exact* original PDF object. */
export function deletionKey(tombstone: NativeDeletionTombstone): string {
  return JSON.stringify([tombstone.pageNumber, tombstone.sourceRef]);
}

/** Verify a deletion against an actual before→after user command. Neither a
 * syntactically valid sidecar row nor an unrelated annotation history entry
 * authorizes deletion. If the history receipt was lost, fail closed.
 *
 * This is protection against corrupted recovery state, NOT cryptographic
 * authentication against an attacker controlling both IndexedDB and history.
 */
export function confirmedNativeDeletionCommandIds(
  tombstones: readonly NativeDeletionTombstone[],
  transactions: readonly {
    command: { id: string; type: string; documentKey: string };
    before: { annotations: PdfAnnotation[] };
    after: { annotations: PdfAnnotation[]; nativeDeletionTombstones?: NativeDeletionTombstone[] };
  }[],
  sourceRevision: string,
): string[] {
  const confirmed = new Set<string>();
  for (const tombstone of tombstones) {
    if (!isValidNativeDeletionTombstone(tombstone) || tombstone.sourceRevision !== sourceRevision) {
      throw new Error('Cannot safely delete native annotations with an invalid user command.');
    }
    const key = deletionKey(tombstone);
    const proved = transactions.some((transaction) => {
      if (transaction.command.id !== tombstone.commandId
        || transaction.command.documentKey !== sourceRevision
        || transaction.command.type !== 'ANNOTATION_CHANGE') return false;
      const wasPresent = transaction.before.annotations.some((item) =>
        !item.data.nativeCopySource && deletionKey({
          ...tombstone, pageNumber: item.pageNumber,
          sourceRef: item.data.nativeSourceRef ?? '',
        }) === key);
      const stillPresent = transaction.after.annotations.some((item) =>
        !item.data.nativeCopySource && item.pageNumber === tombstone.pageNumber
        && item.data.nativeSourceRef === tombstone.sourceRef);
      const inAfter = transaction.after.nativeDeletionTombstones?.some((item) =>
        item.commandId === tombstone.commandId && deletionKey(item) === key
        && item.sourceRevision === sourceRevision && item.pageId === tombstone.pageId
        && item.sourceName === tombstone.sourceName);
      return wasPresent && !stillPresent && Boolean(inAfter);
    });
    if (!proved) {
      throw new Error('Cannot safely delete native annotations: deletion command is not present in verified history.');
    }
    confirmed.add(tombstone.commandId);
  }
  return [...confirmed];
}

/** Verify native field edits at the final writer boundary, even if a caller
 * bypasses store.updateAnnotation. A source mismatch can never be "approved"
 * solely by a stale /PDFHubData or a missing cache entry.
 */
export function unprovenNativeEditFields(
  annotation: PdfAnnotation,
  source: PdfAnnotation,
  sourceRevision: string,
): NativeEditableField[] {
  const allowed = authorizedEditFields(annotation, source, sourceRevision);
  return nativeEditableFields.filter((field) =>
    !allowed.has(field) && (field === 'rect'
      ? !same(annotation.rect, source.rect)
      : !same(annotation.data[field], source.data[field])));
}
