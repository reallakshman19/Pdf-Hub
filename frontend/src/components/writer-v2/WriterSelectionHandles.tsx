import React from 'react';

export interface WriterSelectionHandlesProps {
  onResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export const WriterSelectionHandles: React.FC<WriterSelectionHandlesProps> = ({
  onResizePointerDown,
}) => {
  return (
    <>
      <div
        data-writer-v2-selection-box="true"
        style={{
          position: 'absolute',
          inset: -2,
          border: '1px solid #2563eb',
          pointerEvents: 'none',
        }}
      />
      <div
        data-writer-v2-resize-handle="se"
        aria-label="Resize writer element"
        onPointerDown={onResizePointerDown}
        style={{
          position: 'absolute',
          right: -6,
          bottom: -6,
          width: 10,
          height: 10,
          borderRadius: 2,
          background: '#2563eb',
          border: '1px solid #ffffff',
          cursor: 'nwse-resize',
          pointerEvents: 'auto',
        }}
      />
    </>
  );
};
