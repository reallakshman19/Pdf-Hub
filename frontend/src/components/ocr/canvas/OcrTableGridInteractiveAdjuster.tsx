import React from 'react';
import type { OcrTableBlock } from '@/core/ocr/types';
import {
  extractColumnDividers,
  extractRowDividers,
  adjustColumnDivider,
  adjustRowDivider,
} from '@/core/ocr/tables/tableGridGeometry';

export interface OcrTableGridInteractiveAdjusterProps {
  table: OcrTableBlock;
  scale: number;
  onTableUpdate: (updatedTable: OcrTableBlock) => void;
  disabled?: boolean;
}

export const OcrTableGridInteractiveAdjuster: React.FC<OcrTableGridInteractiveAdjusterProps> = ({
  table,
  scale,
  onTableUpdate,
  disabled = false,
}) => {
  const tableRect = table.rect ?? table.bbox ?? { x: 0, y: 0, width: 200, height: 100 };
  const colDividers = React.useMemo(() => extractColumnDividers(table), [table]);
  const rowDividers = React.useMemo(() => extractRowDividers(table), [table]);

  const handleColMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    dividerIndex: number,
  ) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const startClientX = e.clientX;
    const initialTable = table;

    const handleMouseMove = (moveEv: MouseEvent) => {
      const deltaScreenX = moveEv.clientX - startClientX;
      const deltaPdfX = deltaScreenX / Math.max(0.01, scale);
      const originalDivider = colDividers.find((d) => d.index === dividerIndex);
      if (!originalDivider) return;

      const newPdfX = originalDivider.x + deltaPdfX;
      const updated = adjustColumnDivider(initialTable, dividerIndex, newPdfX);
      onTableUpdate(updated);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleRowMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    dividerIndex: number,
  ) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const startClientY = e.clientY;
    const initialTable = table;

    const handleMouseMove = (moveEv: MouseEvent) => {
      const deltaScreenY = moveEv.clientY - startClientY;
      const deltaPdfY = deltaScreenY / Math.max(0.01, scale);
      const originalDivider = rowDividers.find((d) => d.index === dividerIndex);
      if (!originalDivider) return;

      const newPdfY = originalDivider.y + deltaPdfY;
      const updated = adjustRowDivider(initialTable, dividerIndex, newPdfY);
      onTableUpdate(updated);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const scaledLeft = tableRect.x * scale;
  const scaledTop = tableRect.y * scale;
  const scaledWidth = tableRect.width * scale;
  const scaledHeight = tableRect.height * scale;

  return (
    <div
      data-testid="ocr-table-grid-adjuster"
      className="absolute pointer-events-none z-10 border-2 border-indigo-500/60 rounded bg-indigo-50/10"
      style={{
        left: `${scaledLeft}px`,
        top: `${scaledTop}px`,
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
      }}
    >
      {/* Column vertical drag handles */}
      {colDividers.map((col) => {
        const handleLeft = (col.x - tableRect.x) * scale;
        return (
          <div
            key={`col-handle-${col.index}`}
            data-testid={`col-divider-handle-${col.index}`}
            onMouseDown={(e) => handleColMouseDown(e, col.index)}
            className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-col-resize pointer-events-auto flex items-center justify-center group"
            style={{ left: `${handleLeft}px` }}
            title="Drag to resize column"
          >
            <div className="w-[2px] h-full bg-indigo-400 group-hover:bg-indigo-600 group-hover:w-[3px] transition-all" />
          </div>
        );
      })}

      {/* Row horizontal drag handles */}
      {rowDividers.map((row) => {
        const handleTop = (row.y - tableRect.y) * scale;
        return (
          <div
            key={`row-handle-${row.index}`}
            data-testid={`row-divider-handle-${row.index}`}
            onMouseDown={(e) => handleRowMouseDown(e, row.index)}
            className="absolute left-0 right-0 h-3 -mt-1.5 cursor-row-resize pointer-events-auto flex items-center justify-center group"
            style={{ top: `${handleTop}px` }}
            title="Drag to resize row"
          >
            <div className="h-[2px] w-full bg-indigo-400 group-hover:bg-indigo-600 group-hover:h-[3px] transition-all" />
          </div>
        );
      })}
    </div>
  );
};
