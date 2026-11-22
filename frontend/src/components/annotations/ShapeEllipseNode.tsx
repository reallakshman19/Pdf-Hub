import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

export const ShapeEllipseNode: React.FC<AnnotationNodeProps<'shape-ellipse'>> = ({
  annotation, rect, scale, isSelected, onSelect, onTransformStart,
}) => {
  const bg = annotation.data?.backgroundColor ?? 'transparent';
  const border = annotation.data?.borderColor ?? '#3b82f6';
  const width = (annotation.data?.borderWidth ?? 2) * scale;
  const style = annotation.data?.borderStyle ?? 'solid';
  const opacity = annotation.data?.opacity ?? 1;
  const visible = style !== 'none' && width > 0;
  const inset = visible ? width / 2 : 0;
  const dash = style === 'dashed' ? `${3 * scale} ${2 * scale}` : style === 'dotted' ? `${scale} ${scale}` : undefined;

  return (
    <div
      data-annotation-type="shape-ellipse"
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        cursor: isSelected ? 'move' : 'pointer', pointerEvents: 'all',
        touchAction: 'none', userSelect: 'none',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
    >
      <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
        <ellipse
          cx={rect.width / 2} cy={rect.height / 2}
          rx={Math.max(0, rect.width / 2 - inset)} ry={Math.max(0, rect.height / 2 - inset)}
          fill={bg} fillOpacity={opacity} stroke={visible ? border : 'none'} strokeOpacity={opacity} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round"
        />
      </svg>
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
