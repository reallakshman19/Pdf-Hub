import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { MessageSquare, X } from 'lucide-react';
import { SelectionHandles } from './shared/SelectionHandles';

export const StickyNoteNode: React.FC<AnnotationNodeProps<'sticky-note'>> = ({
  annotation, rect, isSelected, onSelect, onTransformStart, onDoubleClick,
}) => {
  const collapsed = annotation.data?.isCollapsed !== false;
  const isLocked = annotation.data?.locked === true;

  if (collapsed) {
    return (
      <div
        className={`absolute pointer-events-auto cursor-pointer group`}
        style={{ left: rect.x, top: rect.y }}
        onPointerDown={e => { onSelect(e); if (!isLocked) onTransformStart(e, 'move'); }}
        onDoubleClick={onDoubleClick}
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${
          isSelected ? 'ring-2 ring-blue-500' : ''
        }`} style={{ background: annotation.data?.backgroundColor ?? '#fde047' }}>
          <MessageSquare className="w-4 h-4 text-slate-700" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute pointer-events-auto overflow-hidden rounded-xl shadow-xl flex flex-col"
      style={{
        left: rect.x, top: rect.y,
        width: rect.width, height: rect.height,
        background: annotation.data?.backgroundColor ?? '#fef9c3',
        border: `1.5px solid ${annotation.data?.borderColor ?? '#fde047'}`,
      }}
      onPointerDown={e => { onSelect(e); if (!isLocked) onTransformStart(e, 'move'); }}
    >
      <div className="flex items-center justify-between px-2 py-1 bg-black/10 shrink-0">
        <span className="text-[10px] font-semibold text-slate-800">{annotation.data?.author ?? 'Note'}</span>
        <button onClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}><X className="w-3 h-3 text-slate-700" /></button>
      </div>
      <div className="p-2 text-xs flex-1 overflow-hidden text-slate-900">
        {annotation.data?.text ?? ''}
      </div>
      {isSelected && !isLocked && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
