import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterTablePropertiesPanel } from './WriterTablePropertiesPanel';
import type { WriterTableSelection } from '@/core/writer-v2/table-pro/writerTableSelection';

export interface WriterTablePropertiesDockProps {
  tableSelection?: WriterTableSelection | null;
  onTableSelectionChange?: (selection: WriterTableSelection | null) => void;
}

export const WriterTablePropertiesDock: React.FC<
  WriterTablePropertiesDockProps
> = ({
  tableSelection,
  onTableSelectionChange,
}) => {
  const elements = useWriterV2Store((state) => state.elements);
  const activeId = useWriterV2Store((state) => state.activeId);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);

  const selectedTable = React.useMemo(() => {
    const candidateId = activeId ?? selectedIds[0] ?? null;

    if (!candidateId) return null;

    const element = elements.find((item) => item.id === candidateId);

    return element?.type === 'tableBox' ? element : null;
  }, [activeId, elements, selectedIds]);

  if (!selectedTable) {
    return null;
  }

  return (
    <div
      className="fixed right-4 top-24 z-40 w-80 max-w-[calc(100vw-2rem)]"
      data-writer-table-properties-dock="true"
    >
      <WriterTablePropertiesPanel
        tableSelection={tableSelection}
        onTableSelectionChange={onTableSelectionChange}
      />
    </div>
  );
};
