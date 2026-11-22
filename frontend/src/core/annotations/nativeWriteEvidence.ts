import { readNativePdfAnnotations } from '@/core/pdf-annotations/nativeAnnotationReader';
import { resolveHistoryJournalStore } from '@/core/document-history/journal/registry';
import { useHistoryStore } from '@/core/document-history/store';
import type { PdfAnnotation } from './types';
import {
  issuedNativeMutations, nativeEditableFields,
  type NativeDeletionTombstone,
  type NativeHistoryMutation, type NativeEditableField, type VerifiedNativeEditField,
} from './nativeIntegrity';

export interface NativeWriteEvidence {
  verifiedCommandIds: string[];
  verifiedEditFields: VerifiedNativeEditField[];
}

interface EvidenceEvent {
  mutation: NativeHistoryMutation;
  timestamp: string;
  order: string;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sourceKey = (page: number, ref: string) => JSON.stringify([page, ref]);
const value = (annotation: PdfAnnotation, field: NativeEditableField): unknown =>
  field === 'rect' ? annotation.rect : annotation.data[field];

/**
 * Fail-closed replay of issued before/after deltas, starting at the actual
 * PDF source state. A field introduced in a forged cache cannot be authorized
 * by an unrelated later command: it has no matching user-issued field delta.
 */
export function attestNativeMutationChain(
  sourceRevision: string,
  sourceAnnotations: readonly PdfAnnotation[],
  model: readonly PdfAnnotation[],
  tombstones: readonly NativeDeletionTombstone[],
  events: readonly EvidenceEvent[],
): NativeWriteEvidence {
  const sources = new Map<string, PdfAnnotation>();
  const tracked = new Map<string, Map<NativeEditableField, unknown>>();
  for (const annotation of sourceAnnotations) {
    const ref = annotation.data.nativeSourceRef;
    if (!ref || annotation.data.nativeCopySource) continue;
    const key = sourceKey(annotation.pageNumber, ref);
    if (sources.has(key)) throw new Error('Cannot certify duplicate source-native annotation identities.');
    sources.set(key, annotation);
    tracked.set(key, new Map(nativeEditableFields.map((field) => [field, value(annotation, field)])));
  }
  const edited = new Map<string, Set<NativeEditableField>>();
  const deletions = new Map<string, string>();
  const seen = new Set<string>();
  for (const { mutation: event } of [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp) || a.order.localeCompare(b.order))) {
    if (event.sourceRevision !== sourceRevision) continue;
    const key = sourceKey(event.pageNumber, event.sourceRef);
    const source = sources.get(key);
    if (!source || event.sourceName !== (source.data.nativeOriginalName ?? source.id)) {
      throw new Error('Cannot certify a native command for an unknown source object.');
    }
    const dedupe = JSON.stringify([event.commandId, event.kind, key, event.fields ?? []]);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    if (event.kind === 'DELETE') {
      if (deletions.has(key)) {
        throw new Error('Cannot certify repeated native deletion without a restored source.');
      }
      deletions.set(key, event.commandId);
      continue;
    }
    if (deletions.has(key) || !Array.isArray(event.fields) || !event.fields.length) {
      throw new Error('Cannot certify an edit after deletion or without changed fields.');
    }
    const state = tracked.get(key)!;
    for (const change of event.fields) {
      if (!nativeEditableFields.includes(change.field)
        || !equal(state.get(change.field), change.beforeValue)) {
        throw new Error('Cannot certify native edits: issued history does not match the preceding source state.');
      }
      state.set(change.field, change.afterValue);
      const fields = edited.get(key) ?? new Set<NativeEditableField>();
      fields.add(change.field);
      edited.set(key, fields);
    }
  }

  const verifiedCommandIds: string[] = [];
  for (const deletion of tombstones) {
    if (deletion.sourceRevision !== sourceRevision
      || deletions.get(sourceKey(deletion.pageNumber, deletion.sourceRef)) !== deletion.commandId) {
      throw new Error('Cannot safely delete native annotations: issued deletion history is unavailable or inconsistent.');
    }
    verifiedCommandIds.push(deletion.commandId);
  }
  const verifiedEditFields: VerifiedNativeEditField[] = [];
  for (const annotation of model) {
    const ref = annotation.data.nativeSourceRef;
    if (!ref || annotation.data.nativeCopySource) continue;
    const key = sourceKey(annotation.pageNumber, ref);
    const source = sources.get(key);
    if (!source) continue; // The writer separately rejects missing source identities.
    for (const field of nativeEditableFields) {
      const actual = value(annotation, field);
      if (equal(actual, value(source, field))) continue;
      if (!edited.get(key)?.has(field)
        || !equal(tracked.get(key)?.get(field), actual)) {
        throw new Error(`Cannot safely edit native annotation without issued user history for: ${field}.`);
      }
      verifiedEditFields.push({ pageNumber: annotation.pageNumber, sourceRef: ref, field, value: actual });
    }
  }
  return { verifiedCommandIds: [...new Set(verifiedCommandIds)], verifiedEditFields };
}

export async function verifiedNativeWriteEvidence(input: {
  sourceRevision: string;
  baseBytes: Uint8Array;
  annotations: readonly PdfAnnotation[];
  tombstones: readonly NativeDeletionTombstone[];
  journalStoreId: string | null;
}): Promise<NativeWriteEvidence> {
  // Ordinary native Save without pending source mutations needs no expensive
  // second source parse. The final writer still compares all source fields.
  const hasClaims = input.tombstones.length > 0
    || input.annotations.some((annotation) =>
      Boolean(annotation.data.nativeSourceRef && annotation.data.nativeEditProvenance));
  if (!hasClaims) return { verifiedCommandIds: [], verifiedEditFields: [] };

  const imported = await readNativePdfAnnotations(input.baseBytes);
  const events: EvidenceEvent[] = [];
  const journal = input.journalStoreId
    ? resolveHistoryJournalStore(input.journalStoreId)
    : null;
  if (journal) {
    const manifests = await journal.listByOriginalRevision(input.sourceRevision);
    for (const manifest of manifests) {
      const active = manifest.activeTransactionId;
      const last = active === null || active === undefined ? -1
        : manifest.entries.findIndex((entry) => entry.transactionId === active);
      if (active && last < 0) {
        throw new Error('Cannot certify a native edit: history cursor is inconsistent.');
      }
      for (const [index, entry] of manifest.entries.entries()) {
        if (index > last || entry.command.type !== 'ANNOTATION_CHANGE'
          || entry.command.documentKey !== input.sourceRevision) continue;
        const checkpoint = manifest.checkpoints.find((item) =>
          item.transactionId === entry.transactionId && item.statePayload);
        for (const mutation of entry.nativeMutations ?? []) {
          if (mutation.commandId !== entry.command.id
            || mutation.sourceRevision !== input.sourceRevision || !checkpoint?.statePayload) {
            throw new Error('Cannot certify malformed issued native annotation history.');
          }
          const after = checkpoint.statePayload.annotations.find((annotation) =>
            annotation.pageNumber === mutation.pageNumber
            && annotation.data.nativeSourceRef === mutation.sourceRef
            && !annotation.data.nativeCopySource);
          if (mutation.kind === 'DELETE' ? Boolean(after)
            : !after || !mutation.fields?.every((field) =>
              equal(value(after, field.field), field.afterValue))) {
            throw new Error('Cannot certify issued native history against its durable checkpoint.');
          }
          events.push({ mutation, timestamp: entry.createdAt,
            order: `${manifest.journalId}:${index.toString().padStart(8, '0')}` });
        }
      }
    }
  }
  // Nonpersistent compatibility sessions still record canonical in-memory
  // before/after transactions. The issued event must match that transaction;
  // never accept sidecar command IDs as evidence.
  for (const [index, transaction] of useHistoryStore.getState().undoStack.entries()) {
    for (const mutation of issuedNativeMutations(transaction.command,
      transaction.before.annotations, transaction.after.annotations,
      transaction.after.nativeDeletionTombstones ?? [])) {
      events.push({ mutation, timestamp: new Date(transaction.timestamp).toISOString(),
        order: `live:${index.toString().padStart(8, '0')}` });
    }
  }
  return attestNativeMutationChain(input.sourceRevision, imported.annotations,
    input.annotations, input.tombstones, events);
}
