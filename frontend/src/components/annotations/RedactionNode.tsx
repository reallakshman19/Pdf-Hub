import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

export const RedactionNode: React.FC<AnnotationNodeProps<'redaction'>> = ({
  rect, isSelected, onSelect, onTransformStart,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        background: isSelected ? '#1e293b' : '#000000',
        border: isSelected ? '2px solid #3b82f6' : '2px solid #000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <span style={{
        color: '#ffffff', fontSize: Math.max(9, Math.min(16, rect.height * 0.4)),
        fontWeight: 700, letterSpacing: '0.15em', opacity: 0.5, userSelect: 'none'
      }}>
        REDACTED
      </span>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
