import React from 'react';
import type { Rect } from '../../../core/annotations/types';

export const SelectionHandles: React.FC<{
  rect: Rect;
  onTransformStart: (e: React.PointerEvent<HTMLDivElement>, action: 'resize' | 'move') => void;
}> = ({ onTransformStart }) => (
  <div
    className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-blue-600 rounded-tl-sm cursor-se-resize pointer-events-auto"
    onPointerDown={e => {
      e.stopPropagation();
      onTransformStart(e, 'resize');
    }}
  />
);
