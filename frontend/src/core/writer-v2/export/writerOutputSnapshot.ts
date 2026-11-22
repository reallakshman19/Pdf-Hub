import { useAnnotationStore } from '@/core/annotations/store';
import { verifiedNativeWriteEvidence } from '@/core/annotations/nativeWriteEvidence';
import { isNativeAnnotationHydrationCurrent } from '@/core/annotations/sessionHydration';
import { useWriterStore } from '@/core/writer/store';
import { composeEditablePdf } from '@/core/document/commitPipeline';
import { captureWriterPersistenceOwner, isWriterPersistenceOwnerCurrent, ownsWriterSnapshot } from '../persistence/writerPersistenceOwner';
import { normalizeWriterPageAnchors } from '../writerPageAnchor';
import type { WriterElementV2 } from '../types';

/** Capture one authority and one model before any export await. Never retarget it. */
export function captureWriterOutputSnapshot() {
  const owner = captureWriterPersistenceOwner();
  const { writer, document } = owner;
  const { session } = document;
  const annotationState = useAnnotationStore.getState();
  const legacyElements = useWriterStore.getState().elements;
  const blank = writer.documentMeta?.mode === 'blankDocument';
  const fingerprint = writer.currentDocumentFingerprint;
  if (!fingerprint || !ownsWriterSnapshot(owner, fingerprint, writer)) {
    throw new Error('Cannot safely export: Writer content does not belong to the active document.');
  }
  if (blank ? Boolean(session.documentKey || session.workingBytes) : (
    session.documentKey !== fingerprint || !session.workingBytes || !session.pageGraph
    || annotationState.hydratedDocumentKey !== fingerprint
    || annotationState.nativeIntegrity.status !== 'COMPLETE'
    || annotationState.nativeIntegrity.documentKey !== fingerprint
    || !isNativeAnnotationHydrationCurrent(fingerprint)
  )) {
    throw new Error('Cannot safely export: source PDF or native annotations are not ready for this Writer session.');
  }
  const pageCount = blank ? writer.documentMeta!.pageCount : session.pageCount;
  const elements = blank ? writer.elements : normalizeWriterPageAnchors(writer.elements, session.pageGraph);
  validateWriterOutputElements(elements, writer.assetRecords, pageCount);
  if (!blank && writer.elements.some(element => element.pageId && !session.pageGraph?.pages.some(page => page.pageId === element.pageId))) {
    throw new Error('Cannot safely export: Writer element refers to a missing source page.');
  }
  return { owner, fingerprint, blank, elements, assets: writer.assetRecords,
    documentMeta: writer.documentMeta ? { ...writer.documentMeta, pageCount } : null,
    annotations: annotationState.annotations,
    nativeDeletionTombstones: annotationState.nativeDeletionTombstones,
    legacyElements };
}
export type WriterOutputSnapshot = ReturnType<typeof captureWriterOutputSnapshot>;

export function isWriterOutputSnapshotCurrent(snapshot: WriterOutputSnapshot): boolean {
  const annotations = useAnnotationStore.getState();
  return isWriterPersistenceOwnerCurrent(snapshot.owner)
    && (snapshot.blank || (annotations.hydratedDocumentKey === snapshot.fingerprint
      && annotations.nativeIntegrity.status === 'COMPLETE'
      && annotations.nativeIntegrity.documentKey === snapshot.fingerprint
      && annotations.nativeDeletionTombstones === snapshot.nativeDeletionTombstones
      && isNativeAnnotationHydrationCurrent(snapshot.fingerprint)
      && annotations.annotations === snapshot.annotations
      && useWriterStore.getState().elements === snapshot.legacyElements));
}

export function assertWriterOutputSnapshotCurrent(snapshot: WriterOutputSnapshot): void {
  if (!isWriterOutputSnapshotCurrent(snapshot)) {
    throw new Error('The document or Writer content changed during export. Please retry.');
  }
}

/** Native Save uses the same PR58 writer, never the flattened annotation pipeline. */
export async function materializeWriterOutputSource(snapshot: WriterOutputSnapshot): Promise<Uint8Array | null> {
  assertWriterOutputSnapshotCurrent(snapshot);
  if (snapshot.blank) return null;
  const baseBytes = snapshot.owner.document.session.workingBytes;
  if (!baseBytes) throw new Error('Cannot safely export without working PDF bytes.');
  const session = snapshot.owner.document.session;
  const evidence = await verifiedNativeWriteEvidence({
    sourceRevision: snapshot.fingerprint,
    baseBytes,
    annotations: snapshot.annotations,
    tombstones: snapshot.nativeDeletionTombstones,
    journalStoreId: session.historyJournalStoreId,
  });
  assertWriterOutputSnapshotCurrent(snapshot);
  const result = await composeEditablePdf({
    baseBytes,
    annotations: snapshot.annotations,
    writerElements: snapshot.legacyElements,
    replaceManagedAnnotations: true,
    nativeDeletionAuthorization: {
      sourceRevision: snapshot.fingerprint,
      sourcePageIds: session.pageGraph?.pages.map((page) => page.pageId) ?? [],
      tombstones: snapshot.nativeDeletionTombstones,
      ...evidence,
    },
  });
  assertWriterOutputSnapshotCurrent(snapshot);
  return result.bytes;
}

function validateWriterOutputElements(elements: WriterElementV2[], assets: WriterOutputSnapshotAsset[], pageCount: number): void {
  const assetIds = new Set(assets.map(asset => asset.id));
  if (assetIds.size !== assets.length || new Set(elements.map(element => element.id)).size !== elements.length) {
    throw new Error('Cannot safely export duplicate Writer element or asset IDs.');
  }
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('Cannot safely export an invalid page count.');
  for (const element of elements) {
    if (!Number.isInteger(element.pageIndex) || element.pageIndex < 0 || element.pageIndex >= pageCount) {
      throw new Error('Cannot safely export a Writer element outside the source page range.');
    }
    for (const id of [...(element.assetIds ?? []), ...(element.imageAssetId ? [element.imageAssetId] : [])]) {
      if (!assetIds.has(id)) throw new Error(`Cannot safely export missing Writer asset ${id}.`);
    }
  }
}
type WriterOutputSnapshotAsset = { id: string };
