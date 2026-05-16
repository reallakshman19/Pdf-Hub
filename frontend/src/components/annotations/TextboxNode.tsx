import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';
import { Lock } from 'lucide-react';

export const TextboxNode: React.FC<AnnotationNodeProps<'textbox'>> = ({
  annotation, rect, scale, isSelected, isEditing, editingValue,
  onSelect, onTransformStart, onDoubleClick, onCommitEdit,
}) => {
  const isLocked = annotation.data?.locked === true;
  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        background: annotation.data?.backgroundColor ?? '#ffffff',
        border: `1.5px solid ${annotation.data?.borderColor ?? '#60a5fa'}`,
        color: annotation.data?.textColor ?? '#0f172a',
        fontSize: (annotation.data?.fontSize ?? 12) * scale,
        textAlign: annotation.data?.textAlign ?? 'left',
        fontWeight: annotation.data?.fontWeight ?? 'normal',
        pointerEvents: 'all',
        cursor: isLocked ? 'default' : 'pointer',
        outline: isSelected ? '2px solid rgba(37, 99, 235, 0.18)' : 'none',
      }}
      onPointerDown={e => {
        onSelect(e);
        if (!isLocked) onTransformStart(e, 'move');
      }}
      onDoubleClick={() => !isLocked && onDoubleClick?.()}
    >
      {isLocked && <div className="absolute top-1 right-1 opacity-70"><Lock className="w-3.5 h-3.5" /></div>}
      {isEditing ? (
        <textarea
          autoFocus
          className="w-full h-full bg-white/95 text-slate-900 p-1 text-[11px] outline-none resize-none"
          defaultValue={editingValue}
          onBlur={e => onCommitEdit?.(e.currentTarget.value)}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onCommitEdit?.(e.currentTarget.value);
            if (e.key === 'Escape') onCommitEdit?.(editingValue ?? '');
          }}
        />
      ) : (
        <div className="w-full h-full px-1 py-0.5 select-none" style={{ lineHeight: 1.25 }}>
          {annotation.data?.text ?? ''}
        </div>
      )}
      {isSelected && !isLocked && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
