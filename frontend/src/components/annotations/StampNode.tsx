import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

export const StampNode: React.FC<AnnotationNodeProps<'stamp'>> = ({
  annotation, rect, scale, isSelected, onSelect, onTransformStart,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        background: annotation.data?.backgroundColor ?? '#fef2f2',
        border: `2px solid ${annotation.data?.borderColor ?? '#ef4444'}`,
        color: annotation.data?.textColor ?? '#b91c1c',
        fontSize: (annotation.data?.fontSize ?? 14) * scale,
        fontWeight: 'bold',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      {annotation.data?.text ?? 'APPROVED'}
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
