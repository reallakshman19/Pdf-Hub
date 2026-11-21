import { useSessionStore } from '@/core/session/store';
import { hasPublishedWriterProjectForSession } from './writerProjectPublication';
import { useWriterV2Store } from '../writerV2Store';
import { saveWriterSessionToPersistence } from './writerPersistenceController';
import { captureWriterPersistenceOwner, isWriterPersistenceOwnerCurrent, mayLoadWriterDocument, runWriterPersistenceMutation, waitForWriterPersistenceMutations } from './writerPersistenceOwner';
import {
  createWriterDocumentRecord,
  type WriterDocumentRecordV2,
  type WriterPersistenceAdapterV2,
} from './indexedDbWriterStore';
import { resolveWriterPersistenceAdapter } from './writerPersistenceRuntime';

export interface WriterAutosaveResult {
  changed: boolean;
  documentFingerprint: string | null;
  persistedAt: string | null;
  message: string;
}

export interface WriterDraftLoadResult {
  found: boolean;
  documentFingerprint: string;
  document: WriterDocumentRecordV2 | null;
  assetCount: number;
}

export interface WriterRecoverResult {
  changed: boolean;
  message: string;
}

/**
 * Persists the current Writer V2 document and image assets to browser storage.
 * Inputs: optional persistence adapter and explicit force flag.
 * Output: status metadata; no fallback beyond the adapter chosen by the caller.
 */
export async function autosaveCurrentWriterDraft(
  adapter?: WriterPersistenceAdapterV2,
  options?: {
    force?: boolean;
  },
): Promise<WriterAutosaveResult> {
  const persistence = adapter ?? resolveWriterPersistenceAdapter();
  const writer = useWriterV2Store.getState();
  const documentFingerprint = resolveCurrentWriterFingerprint();

  if (!documentFingerprint) {
    return {
      changed: false,
      documentFingerprint: null,
      persistedAt: null,
      message: 'No open document available for Writer autosave.',
    };
  }

  if (!options?.force && !writer.dirty) {
    return {
      changed: false,
      documentFingerprint,
      persistedAt: writer.lastPersistedAt,
      message: 'Writer autosave skipped because there are no changes.',
    };
  }

  const persistedAt = new Date().toISOString();

  await saveWriterSessionToPersistence(documentFingerprint, persistence, writer, persistedAt);

  return {
    changed: true,
    documentFingerprint,
    persistedAt,
    message: `Writer autosaved ${writer.elements.length} object(s).`,
  };
}

export async function loadWriterDraftForCurrentDocument(
  adapter?: WriterPersistenceAdapterV2,
): Promise<WriterDraftLoadResult | null> {
  const persistence = adapter ?? resolveWriterPersistenceAdapter();
  const documentFingerprint = resolveCurrentWriterFingerprint();

  if (!documentFingerprint || hasPublishedWriterProjectForSession(documentFingerprint)) {
    return null;
  }

  const owner = captureWriterPersistenceOwner();
  if (!mayLoadWriterDocument(owner, documentFingerprint)) return null;
  await waitForWriterPersistenceMutations(documentFingerprint);
  if (!isWriterPersistenceOwnerCurrent(owner)) return null;
  const document = await persistence.loadDocument(documentFingerprint);
  const assets = await persistence.listAssets(documentFingerprint);
  if (!isWriterPersistenceOwnerCurrent(owner)) return null;

  return {
    found: Boolean(document),
    documentFingerprint,
    document,
    assetCount: assets.length,
  };
}

export async function recoverWriterDraftForCurrentDocument(
  adapter?: WriterPersistenceAdapterV2,
): Promise<WriterRecoverResult> {
  const persistence = adapter ?? resolveWriterPersistenceAdapter();
  const documentFingerprint = resolveCurrentWriterFingerprint();

  if (!documentFingerprint) {
    return {
      changed: false,
      message: 'No open document available for Writer recovery.',
    };
  }

  if (hasPublishedWriterProjectForSession(documentFingerprint)) return { changed: false, message: 'Explicit Writer project already opened; older browser recovery is not applied.' };
  const owner = captureWriterPersistenceOwner();
  const stale = (): WriterRecoverResult => ({ changed: false, message: 'Writer recovery cancelled: document or draft changed.' });
  if (!mayLoadWriterDocument(owner, documentFingerprint)) return stale();
  await waitForWriterPersistenceMutations(documentFingerprint);
  if (!isWriterPersistenceOwnerCurrent(owner)) return stale();
  const document = await persistence.loadDocument(documentFingerprint);

  if (!document) {
    return {
      changed: false,
      message: 'No Writer draft found for this document.',
    };
  }

  const assets = await persistence.listAssets(documentFingerprint);
  if (!isWriterPersistenceOwnerCurrent(owner)) return stale();
  if (document.documentFingerprint !== documentFingerprint
    || document.elements.some((element) => element.documentFingerprint !== documentFingerprint)
    || assets.some((asset) => asset.documentFingerprint !== documentFingerprint)) {
    return { changed: false, message: 'Writer recovery rejected: foreign document content.' };
  }

  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint,
    elements: document.elements,
    assetRecords: assets,
    persistedAt: document.updatedAt,
    documentMeta: owner.writer.documentMeta?.mode === 'blankDocument' ? owner.writer.documentMeta : null,
  });

  const hydratedElements = useWriterV2Store.getState().elements;
  const anchorsChanged =
    hydratedElements.length !== document.elements.length
    || hydratedElements.some((element, index) =>
      element.pageId !== document.elements[index]?.pageId
      || element.pageIndex !== document.elements[index]?.pageIndex
    );
  if (anchorsChanged) {
    const hydratedOwner = captureWriterPersistenceOwner();
    await runWriterPersistenceMutation(documentFingerprint, async () => {
      if (!isWriterPersistenceOwnerCurrent(hydratedOwner)) return;
      await persistence.saveDocument(createWriterDocumentRecord(documentFingerprint, hydratedElements, document.updatedAt));
    });
  }

  return {
    changed: true,
    message: `Recovered ${hydratedElements.length} Writer object(s).`,
  };
}

export async function discardWriterDraftForCurrentDocument(
  adapter?: WriterPersistenceAdapterV2,
): Promise<WriterRecoverResult> {
  const persistence = adapter ?? resolveWriterPersistenceAdapter();
  const documentFingerprint = resolveCurrentWriterFingerprint();

  if (!documentFingerprint) {
    return {
      changed: false,
      message: 'No open document available for Writer draft discard.',
    };
  }

  const owner = captureWriterPersistenceOwner();
  if (!mayLoadWriterDocument(owner, documentFingerprint)) {
    return { changed: false, message: 'Writer discard rejected: document changed.' };
  }
  const changed = await runWriterPersistenceMutation(documentFingerprint, async () => {
    if (!isWriterPersistenceOwnerCurrent(owner)) return false;
    const assets = await persistence.listAssets(documentFingerprint);
    if (!isWriterPersistenceOwnerCurrent(owner)) return false;
    await persistence.deleteDocument(documentFingerprint);
    for (const asset of assets) {
      if (asset.documentFingerprint === documentFingerprint) await persistence.deleteAsset(asset.id, documentFingerprint);
    }
    return true;
  });
  if (!changed) return { changed: false, message: 'Writer discard cancelled: document or draft changed.' };

  return {
    changed: true,
    message: 'Discarded saved Writer draft for this document.',
  };
}

export function resolveCurrentWriterFingerprint(): string | null {
  const writer = useWriterV2Store.getState();
  const session = useSessionStore.getState();

  return writer.currentDocumentFingerprint ??
    session.documentKey ??
    session.fileName ??
    null;
}
