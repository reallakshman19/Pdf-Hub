import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { autosaveCurrentWriterDraft } from '@/core/writer-v2/persistence/writerAutosave';

const AUTOSAVE_INTERVAL_MS = 5000;

/**
 * Watches Writer V2 dirty state and schedules browser-storage autosaves.
 * Parameters: none; output: no UI; fallback: persistence helper chooses IndexedDB or memory in tests.
 */
export const WriterAutosaveController: React.FC = () => {
  const dirty = useWriterV2Store((state) => state.dirty);
  const elementCount = useWriterV2Store((state) => state.elements.length);
  const assetCount = useWriterV2Store((state) => state.assetRecords.length);

  React.useEffect(() => {
    if (!dirty) return undefined;

    const timer = window.setTimeout(() => {
      void autosaveCurrentWriterDraft();
    }, AUTOSAVE_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [dirty, elementCount, assetCount]);

  return null;
};
