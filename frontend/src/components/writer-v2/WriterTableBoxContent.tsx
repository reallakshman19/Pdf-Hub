import React from 'react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import type { WriterTableSelection } from '@/core/writer-v2/table-pro/writerTableSelection';
import {
  buildWriterTableVisualModel,
  writerTableCellStyleToCss,
} from '@/core/writer-v2/table-pro/writerTableVisualStyles';

export interface WriterTableBoxContentProps {
  element: WriterElementV2;
  width: number;
  height: number;
  selection?: WriterTableSelection | null;
}

export const WriterTableBoxContent: React.FC<WriterTableBoxContentProps> = ({
  element,
  width,
  height,
  selection,
}) => {
  const model = React.useMemo(() => {
    return buildWriterTableVisualModel({
      element,
      width,
      height,
    });
  }, [element, width, height]);

  if (!model) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-xs text-slate-400"
        data-writer-table-empty="true"
      >
        Invalid table
      </div>
    );
  }

  const selectedKeys = new Set(
    selection?.elementId === element.id
      ? selection.cells.map((cell) => `${cell.rowIndex}:${cell.columnIndex}`)
      : [],
  );

  const mergedMasterSelectedKeys = new Set<string>();

  if (selection?.elementId === element.id && element.tableData) {
    for (const selected of selection.cells) {
      const selectedCell = element.tableData.rows[selected.rowIndex]?.cells[selected.columnIndex];

      if (selectedCell?.mergedInto) {
        mergedMasterSelectedKeys.add(
          `${selectedCell.mergedInto.rowIndex}:${selectedCell.mergedInto.columnIndex}`,
        );
      }
    }
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-white"
      data-writer-table-box-content="true"
    >
      {model.headerCells.map((cell) => (
        <div
          key={cell.key}
          className="absolute"
          data-writer-table-header-cell="true"
          style={{
            left: cell.x,
            top: cell.y,
            width: cell.width,
            height: cell.height,
            ...writerTableCellStyleToCss(cell.style),
          }}
        >
          <span className="min-w-0 truncate">
            {cell.text}
          </span>
        </div>
      ))}

      {model.bodyCells.map((cell) => {
        const cellKey = `${cell.rowIndex}:${cell.columnIndex}`;
        const selected = selectedKeys.has(cellKey) || mergedMasterSelectedKeys.has(cellKey);

        return (
          <div
            key={cell.key}
            className="absolute"
            data-writer-table-body-cell="true"
            data-writer-table-cell-selected={selected ? 'true' : 'false'}
            style={{
              left: cell.x,
              top: cell.y,
              width: cell.width,
              height: cell.height,
              ...writerTableCellStyleToCss(cell.style),
              outline: selected ? '2px solid #3B82F6' : undefined,
              outlineOffset: selected ? '-2px' : undefined,
            }}
          >
            <span
              className={[
                'min-w-0',
                cell.style.alignment === 'right' ? 'text-right' : '',
                cell.style.alignment === 'center' ? 'text-center' : '',
                cell.style.alignment === 'justify' ? 'text-justify' : '',
              ].join(' ')}
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {cell.text}
            </span>
          </div>
        );
      })}
    </div>
  );
};
