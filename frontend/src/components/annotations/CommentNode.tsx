import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

export const CommentNode: React.FC<AnnotationNodeProps<'comment'>> = ({
  annotation, rect, scale, isSelected, isEditing, editingValue,
  onSelect, onTransformStart, onDoubleClick, onCommitEdit,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        background: annotation.data?.backgroundColor ?? '#fff7cc',
        border: `1.5px solid ${annotation.data?.borderColor ?? '#d4b106'}`,
        color: annotation.data?.textColor ?? '#111827',
        fontSize: (annotation.data?.fontSize ?? 12) * scale,
        borderRadius: 6, padding: 4,
        cursor: 'pointer', pointerEvents: 'all',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
      onDoubleClick={onDoubleClick}
    >
      {isEditing ? (
        <textarea
          autoFocus
          className="w-full h-full bg-transparent text-slate-900 outline-none resize-none"
          defaultValue={editingValue}
          onBlur={e => onCommitEdit?.(e.currentTarget.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onCommitEdit?.(e.currentTarget.value); }}
        />
      ) : (
        <div className="w-full h-full">{annotation.data?.text ?? 'Note'}</div>
      )}
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
