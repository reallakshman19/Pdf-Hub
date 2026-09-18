import {
  createWriterDocumentRecord,
  type WriterAssetRecordV2,
  type WriterPersistenceAdapterV2,
} from './indexedDbWriterStore';
import type { WriterElementV2 } from '../types';
import { normalizeWriterPageAnchors } from '../writerPageAnchor';
import { useSessionStore } from '@/core/session/store';
import {
  useWriterV2Store,
  type WriterV2StoreState,
} from '../writerV2Store';

export interface WriterPersistenceLoadResult {
  documentFingerprint: string;
  elements: WriterElementV2[];
  assetRecords: WriterAssetRecordV2[];
  loaded: boolean;
  updatedAt: string | null;
}

export interface WriterPersistenceSaveResult {
  documentFingerprint: string;
  elementCount: number;
  assetCount: number;
  savedAt: string;
}

export async function loadWriterSessionFromPersistence(
  documentFingerprint: string,
  adapter: WriterPersistenceAdapterV2,
): Promise<WriterPersistenceLoadResult> {
  const [documentRecord, assetRecords] = await Promise.all([
    adapter.loadDocument(documentFingerprint),
    adapter.listAssets(documentFingerprint),
  ]);

  const elements = documentRecord?.elements ?? [];

  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint,
    elements,
    assetRecords,
    persistedAt: documentRecord?.updatedAt ?? null,
  });
  const hydratedElements = useWriterV2Store.getState().elements;

  if (documentRecord && !writerElementsEquivalent(elements, hydratedElements)) {
    await adapter.saveDocument(
      createWriterDocumentRecord(
        documentFingerprint,
        hydratedElements,
        documentRecord.updatedAt,
      ),
    );
  }

  return {
    documentFingerprint,
    elements: hydratedElements,
    assetRecords,
    loaded: !!documentRecord,
    updatedAt: documentRecord?.updatedAt ?? null,
  };
}

export async function saveWriterSessionToPersistence(
  documentFingerprint: string,
  adapter: WriterPersistenceAdapterV2,
  state: Pick<WriterV2StoreState, 'elements' | 'assetRecords'> = useWriterV2Store.getState(),
  savedAt = new Date().toISOString(),
): Promise<WriterPersistenceSaveResult> {
  const writerState = useWriterV2Store.getState();
  const session = useSessionStore.getState();
  const elements =
    writerState.documentMeta?.mode === 'pdfOverlay'
      ? normalizeWriterPageAnchors(state.elements, session.pageGraph)
      : cloneElements(state.elements);
  const assetRecords = state.assetRecords.map((asset) => ({
    ...asset,
    documentFingerprint,
    updatedAt: savedAt,
  }));

  await adapter.saveDocument(
    createWriterDocumentRecord(
      documentFingerprint,
      elements.map((element) => ({
        ...element,
        documentFingerprint,
      })),
      savedAt,
    ),
  );

  for (const asset of assetRecords) {
    await adapter.saveAsset(asset);
  }

  useWriterV2Store.getState().markWriterPersisted(savedAt);

  return {
    documentFingerprint,
    elementCount: elements.length,
    assetCount: assetRecords.length,
    savedAt,
  };
}

export function createWriterPersistenceController(
  documentFingerprint: string,
  adapter: WriterPersistenceAdapterV2,
): {
  load: () => Promise<WriterPersistenceLoadResult>;
  save: () => Promise<WriterPersistenceSaveResult>;
  flush: () => Promise<WriterPersistenceSaveResult>;
} {
  return {
    load: () => loadWriterSessionFromPersistence(documentFingerprint, adapter),
    save: () => saveWriterSessionToPersistence(documentFingerprint, adapter),
    flush: () => saveWriterSessionToPersistence(documentFingerprint, adapter),
  };
}

function cloneElements(elements: WriterElementV2[]): WriterElementV2[] {
  return elements.map((element) => ({
    ...element,
    assetIds: element.assetIds ? [...element.assetIds] : undefined,
    rect: { ...element.rect },
    style: { ...element.style },
    tableData: element.tableData
      ? {
          columns: element.tableData.columns.map((column) => ({ ...column })),
          rows: element.tableData.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell })),
          })),
        }
      : undefined,
    callout: element.callout
      ? {
          ...element.callout,
          anchorPoint: element.callout.anchorPoint
            ? { ...element.callout.anchorPoint }
            : undefined,
        }
      : undefined,
  }));
}


function writerElementsEquivalent(
  left: WriterElementV2[],
  right: WriterElementV2[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((element, index) => {
    const other = right[index];
    return Boolean(
      other
      && element.id === other.id
      && element.pageIndex === other.pageIndex
      && element.pageId === other.pageId
    );
  });
}
