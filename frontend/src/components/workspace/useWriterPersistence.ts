import React from 'react';
import { captureDocumentMutationOwner, isDocumentSessionOwnerCurrent } from '@/core/session/mutationOwner';
import { getDocumentSessionGeneration, useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { hasPublishedWriterProjectForSession } from '@/core/writer-v2/persistence/writerProjectPublication';
import {
  resolveWriterPersistenceAdapter,
} from '@/core/writer-v2/persistence/writerPersistenceRuntime';
import {
  loadWriterSessionFromPersistence,
  saveWriterSessionToPersistence,
} from '@/core/writer-v2/persistence/writerPersistenceController';
import { error as logError } from '@/core/logger/service';

interface UseWriterPersistenceArgs {
  documentKey: string | null;
}

export function useWriterPersistence({ documentKey }: UseWriterPersistenceArgs): void {
  const generation = useSessionStore(() => getDocumentSessionGeneration());
  const elements = useWriterV2Store((state) => state.elements);
  const assetRecords = useWriterV2Store((state) => state.assetRecords);

  const adapter = React.useMemo(
    () => resolveWriterPersistenceAdapter(),
    [],
  );

  // Load writer session from IndexedDB on document change
  React.useEffect(() => {
    if (!documentKey || hasPublishedWriterProjectForSession(documentKey)) return;

    let cancelled = false;
    const loadStored = async () => {
      try {
        await loadWriterSessionFromPersistence(documentKey, adapter, () => cancelled);
      } catch (err) {
        logError('writer', 'Failed to load writer session from IndexedDB', {
          documentKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };
    void loadStored();
    return () => { cancelled = true; };
  }, [documentKey, generation, adapter]);

  // Autosave writer session when elements or assets change
  React.useEffect(() => {
    if (!documentKey) return;

    const owner = captureDocumentMutationOwner();
    const timer = window.setTimeout(() => {
      if (!isDocumentSessionOwnerCurrent(owner)) return;
      const state = useWriterV2Store.getState();
      if (state.currentDocumentFingerprint !== documentKey || state.documentMeta?.mode !== 'pdfOverlay' || !state.dirty) return;
      void saveWriterSessionToPersistence(documentKey, adapter, {
        elements: state.elements,
        assetRecords: state.assetRecords,
      }).catch((err) => {
        logError('writer', 'Writer autosave failed', {
          documentKey,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [elements, assetRecords, documentKey, generation, adapter]);

  // Flush writer session on pagehide
  React.useEffect(() => {
    if (!documentKey) return;

    const owner = captureDocumentMutationOwner();
    const flushNow = () => {
      if (!isDocumentSessionOwnerCurrent(owner)) return;
      const state = useWriterV2Store.getState();
      if (state.currentDocumentFingerprint !== documentKey || state.documentMeta?.mode !== 'pdfOverlay' || !state.dirty) return;
      void saveWriterSessionToPersistence(documentKey, adapter, {
        elements: state.elements,
        assetRecords: state.assetRecords,
      }).catch((err) => {
        logError('writer', 'Writer pagehide flush failed', {
          documentKey,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    };

    window.addEventListener('pagehide', flushNow);

    return () => {
      window.removeEventListener('pagehide', flushNow);
    };
  }, [documentKey, generation, adapter]);
}
