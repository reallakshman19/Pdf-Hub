import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '../writerV2Store';
import { normalizeWriterPageAnchors } from '../writerPageAnchor';
import {
  createBestAvailableWriterPersistence,
  createWriterDocumentRecord,
  type WriterDocumentRecordV2,
  type WriterPersistenceAdapterV2,
} from './indexedDbWriterStore';

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
  const persistence = adapter ?? createBestAvailableWriterPersistence();
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

  const elements =
    writer.documentMeta?.mode === 'pdfOverlay'
      ? normalizeWriterPageAnchors(
          writer.elements,
          useSessionStore.getState().pageGraph,
        )
      : writer.elements;

  await persistence.saveDocument(
    createWriterDocumentRecord(
      documentFingerprint,
      elements,
      persistedAt,
    ),
  );

  for (const asset of writer.assetRecords) {
    await persistence.saveAsset({
      ...asset,
      documentFingerprint,
      updatedAt: persistedAt,
    });
  }

  useWriterV2Store.getState().markWriterPersisted(persistedAt);

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
  const persistence = adapter ?? createBestAvailableWriterPersistence();
  const documentFingerprint = resolveCurrentWriterFingerprint();

  if (!documentFingerprint) {
    return null;
  }

  const document = await persistence.loadDocument(documentFingerprint);
  const assets = await persistence.listAssets(documentFingerprint);

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
  const persistence = adapter ?? createBestAvailableWriterPersistence();
  const documentFingerprint = resolveCurrentWriterFingerprint();

  if (!documentFingerprint) {
    return {
      changed: false,
      message: 'No open document available for Writer recovery.',
    };
  }

  const document = await persistence.loadDocument(documentFingerprint);

  if (!document) {
    return {
      changed: false,
      message: 'No Writer draft found for this document.',
    };
  }

  const assets = await persistence.listAssets(documentFingerprint);

  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint,
    elements: document.elements,
    assetRecords: assets,
    persistedAt: document.updatedAt,
  });

  const hydratedElements = useWriterV2Store.getState().elements;
  const anchorsChanged =
    hydratedElements.length !== document.elements.length
    || hydratedElements.some((element, index) =>
      element.pageId !== document.elements[index]?.pageId
      || element.pageIndex !== document.elements[index]?.pageIndex
    );
  if (anchorsChanged) {
    await persistence.saveDocument(
      createWriterDocumentRecord(
        documentFingerprint,
        hydratedElements,
        document.updatedAt,
      ),
    );
  }

  return {
    changed: true,
    message: `Recovered ${hydratedElements.length} Writer object(s).`,
  };
}

export async function discardWriterDraftForCurrentDocument(
  adapter?: WriterPersistenceAdapterV2,
): Promise<WriterRecoverResult> {
  const persistence = adapter ?? createBestAvailableWriterPersistence();
  const documentFingerprint = resolveCurrentWriterFingerprint();

  if (!documentFingerprint) {
    return {
      changed: false,
      message: 'No open document available for Writer draft discard.',
    };
  }

  const assets = await persistence.listAssets(documentFingerprint);

  await persistence.deleteDocument(documentFingerprint);

  for (const asset of assets) {
    await persistence.deleteAsset(asset.id);
  }

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
