import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

export function useWriterTableSelectionState() {
  const selection = useWriterV2Store((state) => state.tableSelection);
  const setSelection = useWriterV2Store((state) => state.setTableSelection);

  const clearSelection = React.useCallback(() => {
    setSelection(null);
  }, [setSelection]);

  return {
    selection,
    setSelection,
    clearSelection,
  };
}
