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
  { handle: 'n',  style: { top: -8, left: '50%', transform: 'translateX(-50%)' }, cursor: 'n-resize' },
  { handle: 'ne', style: { top: -8, right: -8 },                                  cursor: 'ne-resize' },
  { handle: 'e',  style: { top: '50%', right: -8, transform: 'translateY(-50%)' }, cursor: 'e-resize' },
  { handle: 'se', style: { bottom: -8, right: -8 },                                cursor: 'nwse-resize' },
  { handle: 's',  style: { bottom: -8, left: '50%', transform: 'translateX(-50%)' }, cursor: 's-resize' },
  { handle: 'sw', style: { bottom: -8, left: -8 },                                  cursor: 'nesw-resize' },
  { handle: 'w',  style: { top: '50%', left: -8, transform: 'translateY(-50%)' },   cursor: 'w-resize' },
  { handle: 'nw', style: { top: -8, left: -8 },                                      cursor: 'nw-resize' },
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
          border: '1.5px solid #2563eb',
          borderRadius: 2,
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
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor,
            pointerEvents: 'auto',
            ...style,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: '#2563eb',
              border: '1.5px solid #ffffff',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.28)',
              pointerEvents: 'none',
            }}
          />
        </div>
      ))}
    </>
  );
};
