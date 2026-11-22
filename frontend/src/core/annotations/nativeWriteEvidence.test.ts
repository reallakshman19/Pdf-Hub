import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfAnnotation } from './types';
import type { NativeDeletionTombstone, NativeHistoryMutation } from './nativeIntegrity';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  resolve: vi.fn(),
  transactions: [] as unknown[],
}));
vi.mock('@/core/pdf-annotations/nativeAnnotationReader', () => ({
  readNativePdfAnnotations: mocks.read,
}));
vi.mock('@/core/document-history/journal/registry', () => ({
  resolveHistoryJournalStore: mocks.resolve,
}));
vi.mock('@/core/document-history/store', () => ({
  useHistoryStore: { getState: () => ({ undoStack: mocks.transactions }) },
}));

import { attestNativeMutationChain, verifiedNativeWriteEvidence } from './nativeWriteEvidence';
import { issuedNativeMutations } from './nativeIntegrity';
import { materializePdfCommand } from '@/core/commands/types';

const revision = 'sha256:real-pdf';
const pageId = revision + '::page::1';
const source: PdfAnnotation = {
  id: 'original-stamp', type: 'stamp', pageNumber: 1, pageId,
  rect: { x: 15, y: 25, width: 40, height: 30 },
  data: { nativeSourceRef: '12 0 R', nativeOriginalName: 'original-stamp', text: 'Original' },
  createdAt: 1, updatedAt: 1,
};
const move = (x: number): PdfAnnotation => ({
  ...source,
  rect: { ...source.rect, x },
  updatedAt: 2,
  data: { ...source.data, nativeEditProvenance: {
    sourceRevision: revision, sourceRef: '12 0 R',
    commandId: 'plausible-cache-provenance', fields: ['rect'],
  } },
});
const tombstone: NativeDeletionTombstone = {
  sourceRevision: revision, sourceRef: '12 0 R',
  sourceName: 'original-stamp', pageNumber: 1, pageId, commandId: 'issued-delete',
};
const command = (id: string, action: string) => materializePdfCommand({
  type: 'ANNOTATION_CHANGE',
  payload: { action, annotationIds: [source.id] },
}, 'annotation-store', revision, { id });

const event = (mutation: NativeHistoryMutation) => ({
  mutation, timestamp: '2026-11-22T13:00:00.000Z', order: 'journal:0',
});
function journal(mutations: NativeHistoryMutation[], after: PdfAnnotation[]) {
  const entryId = 'transaction-1';
  return {
    originalRevisionId: revision,
    journalId: 'journal-original',
    activeTransactionId: entryId,
    entries: [{
      transactionId: entryId, command: command(mutations[0].commandId, 'Edit native'),
      nativeMutations: mutations, createdAt: '2026-11-22T13:00:00.000Z',
    }],
    checkpoints: [{ transactionId: entryId, statePayload: { annotations: after } }],
  };
}

describe('issued native history evidence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transactions = [];
    mocks.read.mockResolvedValue({ annotations: [source] });
    mocks.resolve.mockReturnValue({ listByOriginalRevision: vi.fn().mockResolvedValue([]) });
  });

  it('derives real editable fields from a source-to-output mutation, not the sidecar claim', () => {
    const mutation = issuedNativeMutations(command('actual-move', 'Move annotation'),
      [source], [move(42)]);
    expect(mutation).toHaveLength(1);
    expect(mutation[0].fields).toEqual([{ field: 'rect',
      beforeValue: source.rect, afterValue: move(42).rect }]);
    expect(attestNativeMutationChain(revision, [source], [move(42)], [],
      mutation.map(event)).verifiedEditFields).toEqual([{
        pageNumber: 1, sourceRef: '12 0 R', field: 'rect', value: move(42).rect,
      }]);
  });

  it('rejects a well-formed forged source move without any issued field change', () => {
    expect(() => attestNativeMutationChain(revision, [source], [move(77)], [], []))
      .toThrow('without issued user history for: rect');
  });

  it('rejects a forged prior rectangle even when an unrelated real text edit occurs', () => {
    const fraudulentBefore = move(77);
    const actualAfter: PdfAnnotation = {
      ...fraudulentBefore,
      data: { ...fraudulentBefore.data, text: 'Legitimate new text' },
    };
    const events = issuedNativeMutations(command('real-text', 'Edit text'),
      [fraudulentBefore], [actualAfter]);
    expect(events[0].fields?.map((field) => field.field)).toEqual(['text']);
    expect(() => attestNativeMutationChain(revision, [source], [actualAfter], [],
      events.map(event))).toThrow('without issued user history for: rect');
  });

  it('verifies an issued deletion, then rejects a plausible forged command ID', () => {
    const deleted = issuedNativeMutations(command('issued-delete', 'Delete annotations'),
      [source], [], [tombstone]);
    expect(deleted.map((item) => item.kind)).toEqual(['DELETE']);
    expect(attestNativeMutationChain(revision, [source], [], [tombstone],
      deleted.map(event)).verifiedCommandIds).toEqual(['issued-delete']);
    expect(() => attestNativeMutationChain(revision, [source], [],
      [{ ...tombstone, commandId: 'forged-delete' }], deleted.map(event)))
      .toThrow('issued deletion history is unavailable');
  });

  it('accepts the exact issued durable journal edit after a fresh browser admission', async () => {
    const mutation = issuedNativeMutations(command('issued-move', 'Move annotation'),
      [source], [move(48)]);
    mocks.resolve.mockReturnValue({
      listByOriginalRevision: vi.fn().mockResolvedValue([journal(mutation, [move(48)])]),
    });
    const result = await verifiedNativeWriteEvidence({
      sourceRevision: revision, baseBytes: Uint8Array.of(1),
      annotations: [move(48)], tombstones: [],
      journalStoreId: 'registered-history-store',
    });
    expect(result.verifiedEditFields).toEqual([{
      sourceRef: '12 0 R', pageNumber: 1, field: 'rect', value: move(48).rect,
    }]);
  });

  it('rejects sidecar edits that differ from the durable issued checkpoint', async () => {
    const mutation = issuedNativeMutations(command('issued-move', 'Move annotation'),
      [source], [move(48)]);
    mocks.resolve.mockReturnValue({
      listByOriginalRevision: vi.fn().mockResolvedValue([journal(mutation, [move(48)])]),
    });
    await expect(verifiedNativeWriteEvidence({
      sourceRevision: revision, baseBytes: Uint8Array.of(1),
      annotations: [move(90)], tombstones: [],
      journalStoreId: 'registered-history-store',
    })).rejects.toThrow('without issued user history for: rect');
  });

  it('permits recovered deletion only when the original durable journal retains its issued command', async () => {
    const mutation = issuedNativeMutations(command('issued-delete', 'Delete annotations'),
      [source], [], [tombstone]);
    mocks.resolve.mockReturnValue({
      listByOriginalRevision: vi.fn().mockResolvedValue([journal(mutation, [])]),
    });
    const result = await verifiedNativeWriteEvidence({
      sourceRevision: revision, baseBytes: Uint8Array.of(1),
      annotations: [], tombstones: [tombstone],
      journalStoreId: 'fresh-browser-journal-store',
    });
    expect(result.verifiedCommandIds).toEqual(['issued-delete']);
  });

  it('does not authorize a prior journal command after Undo withdrew its active cursor', async () => {
    const mutation = issuedNativeMutations(command('issued-delete', 'Delete annotations'),
      [source], [], [tombstone]);
    const historical = { ...journal(mutation, []), activeTransactionId: null };
    mocks.resolve.mockReturnValue({
      listByOriginalRevision: vi.fn().mockResolvedValue([historical]),
    });
    await expect(verifiedNativeWriteEvidence({
      sourceRevision: revision, baseBytes: Uint8Array.of(1),
      annotations: [], tombstones: [tombstone],
      journalStoreId: 'fresh-browser-journal-store',
    })).rejects.toThrow('issued deletion history is unavailable');
  });

  it('fails closed when journal history is missing or has no matching source witness', async () => {
    await expect(verifiedNativeWriteEvidence({
      sourceRevision: revision, baseBytes: Uint8Array.of(1),
      annotations: [move(42)], tombstones: [],
      journalStoreId: 'fresh-browser-journal-store',
    })).rejects.toThrow('without issued user history for: rect');
  });
});
