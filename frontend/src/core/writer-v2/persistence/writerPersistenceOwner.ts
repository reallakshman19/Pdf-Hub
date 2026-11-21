import {
  captureDocumentMutationOwner,
  isDocumentMutationOwnerCurrent,
} from '../../session/mutationOwner';
import { useWriterV2Store, type WriterV2StoreState } from '../writerV2Store';

/** Capture the actual document revision and immutable Writer state references. */
export function captureWriterPersistenceOwner() {
  return { document: captureDocumentMutationOwner(), writer: useWriterV2Store.getState() };
}
export type WriterPersistenceOwner = ReturnType<typeof captureWriterPersistenceOwner>;

export function isWriterPersistenceOwnerCurrent(owner: WriterPersistenceOwner): boolean {
  const current = useWriterV2Store.getState();
  return isDocumentMutationOwnerCurrent(owner.document)
    && current.currentDocumentFingerprint === owner.writer.currentDocumentFingerprint
    && current.documentMeta === owner.writer.documentMeta
    && current.elements === owner.writer.elements
    && current.assetRecords === owner.writer.assetRecords;
}

/** PDF loads may start before Writer is hydrated; blank documents never borrow a PDF key. */
export function mayLoadWriterDocument(owner: WriterPersistenceOwner, fingerprint: string): boolean {
  const { writer, document } = owner;
  if (writer.documentMeta?.mode === 'blankDocument') return !writer.currentDocumentFingerprint || writer.currentDocumentFingerprint === fingerprint;
  const key = document.session.documentKey;
  return key ? key === fingerprint : true;
}

export function ownsWriterSnapshot(
  owner: WriterPersistenceOwner,
  fingerprint: string,
  snapshot: Pick<WriterV2StoreState, 'elements' | 'assetRecords'>,
): boolean {
  return mayLoadWriterDocument(owner, fingerprint)
    && snapshot.elements === owner.writer.elements
    && snapshot.assetRecords === owner.writer.assetRecords;
}

/** Serialize writes for a document so an older write cannot finish after its successor. */
const pendingWrites = new Map<string, Promise<unknown>>();
export function runWriterPersistenceMutation<T>(fingerprint: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingWrites.get(fingerprint);
  const next = previous ? previous.catch(() => undefined).then(operation) : operation();
  pendingWrites.set(fingerprint, next);
  const cleanup = () => { if (pendingWrites.get(fingerprint) === next) pendingWrites.delete(fingerprint); };
  void next.then(cleanup, cleanup);
  return next;
}

export async function waitForWriterPersistenceMutations(fingerprint: string): Promise<void> {
  while (pendingWrites.has(fingerprint)) {
    await pendingWrites.get(fingerprint)?.catch(() => undefined);
  }
}
