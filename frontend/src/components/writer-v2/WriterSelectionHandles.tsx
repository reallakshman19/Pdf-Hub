import React from 'react';

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface WriterSelectionHandlesProps {
  onResizePointerDown: (event: React.PointerEvent<HTMLDivElement>, handle: ResizeHandle) => void;
}

const HANDLES: Array<{
  handle: ResizeHandle;
  style: React.CSSProperties;
  cursor: string;
}> = [
  { handle: 'n',  style: { top: -6, left: '50%', transform: 'translateX(-50%)' }, cursor: 'n-resize' },
  { handle: 'ne', style: { top: -6, right: -6 },                                  cursor: 'ne-resize' },
  { handle: 'e',  style: { top: '50%', right: -6, transform: 'translateY(-50%)' }, cursor: 'e-resize' },
  { handle: 'se', style: { bottom: -6, right: -6 },                                cursor: 'nwse-resize' },
  { handle: 's',  style: { bottom: -6, left: '50%', transform: 'translateX(-50%)' }, cursor: 's-resize' },
  { handle: 'sw', style: { bottom: -6, left: -6 },                                  cursor: 'nesw-resize' },
  { handle: 'w',  style: { top: '50%', left: -6, transform: 'translateY(-50%)' },   cursor: 'w-resize' },
  { handle: 'nw', style: { top: -6, left: -6 },                                      cursor: 'nw-resize' },
];

export const WriterSelectionHandles: React.FC<WriterSelectionHandlesProps> = ({
  onResizePointerDown,
}) => {
  return (
    <>
      <div
        data-writer-v2-selection-box="true"
        data-testid="writer-v2-selection-box"
        style={{
          position: 'absolute',
          inset: -2,
          border: '1px solid #2563eb',
          pointerEvents: 'none',
        }}
      />
      {HANDLES.map(({ handle, style, cursor }) => (
        <div
          key={handle}
          data-writer-v2-resize-handle={handle}
          data-testid={`writer-v2-resize-handle-${handle}`}
          aria-label={`Resize writer element ${handle}`}
          onPointerDown={(event) => onResizePointerDown(event, handle)}
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            borderRadius: 2,
            background: '#2563eb',
            border: '1px solid #ffffff',
            cursor,
            pointerEvents: 'auto',
            ...style,
          }}
        />
      ))}
    </>
  );
};
