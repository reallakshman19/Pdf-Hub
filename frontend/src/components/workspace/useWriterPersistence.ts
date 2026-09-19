import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
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
  const elements = useWriterV2Store((state) => state.elements);
  const assetRecords = useWriterV2Store((state) => state.assetRecords);

  const adapter = React.useMemo(
    () => resolveWriterPersistenceAdapter(),
    [],
  );

  // Load writer session from IndexedDB on document change
  React.useEffect(() => {
    if (!documentKey) return;

    const loadStored = async () => {
      try {
        await loadWriterSessionFromPersistence(documentKey, adapter);
      } catch (err) {
        logError('writer', 'Failed to load writer session from IndexedDB', {
          documentKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };
    void loadStored();
  }, [documentKey, adapter]);

  // Autosave writer session when elements or assets change
  React.useEffect(() => {
    if (!documentKey) return;

    const timer = window.setTimeout(() => {
      const state = useWriterV2Store.getState();
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
  }, [elements, assetRecords, documentKey, adapter]);

  // Flush writer session on pagehide
  React.useEffect(() => {
    if (!documentKey) return;

    const flushNow = () => {
      const state = useWriterV2Store.getState();
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
  }, [documentKey, adapter]);
}
