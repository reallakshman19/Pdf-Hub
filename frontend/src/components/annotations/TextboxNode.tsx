import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';
import { Lock } from 'lucide-react';
import { FreeTextPreview } from './shared/FreeTextPreview';

export const TextboxNode: React.FC<AnnotationNodeProps<'textbox'>> = ({
  annotation, rect, scale, isSelected, isEditing, editingValue,
  onSelect, onTransformStart, onDoubleClick, onCommitEdit, pageRotation = 0,
}) => {
  const isLocked = annotation.data?.locked === true;
  const sourcePageRotation = annotation.data.nativeCopySource
    ? (annotation.data.nativeAppearancePageRotation ?? pageRotation) : pageRotation;
  const contentRotation = sourcePageRotation + (annotation.data.nativeOrientationAdjustment ?? 0);
  const sideways = ((contentRotation % 180) + 180) % 180 === 90;
  const bodyWidth = sideways ? rect.height : rect.width;
  const bodyHeight = sideways ? rect.width : rect.height;
  return (
    <div
      data-annotation-type="textbox"
      style={{
        position: 'absolute',
        left: rect.x + (rect.width - bodyWidth) / 2,
        top: rect.y + (rect.height - bodyHeight) / 2,
        width: bodyWidth, height: bodyHeight,
        background: annotation.data?.backgroundColor ?? '#ffffff',
        border: `1.5px solid ${annotation.data?.borderColor ?? '#60a5fa'}`,
        color: annotation.data?.textColor ?? '#0f172a',
        fontSize: (annotation.data?.fontSize ?? 12) * scale,
        textAlign: annotation.data?.textAlign ?? 'left',
        fontWeight: annotation.data?.fontWeight ?? 'normal',
        fontStyle: annotation.data?.fontStyle ?? 'normal',
        pointerEvents: 'all',
        cursor: isLocked ? 'default' : 'pointer',
        outline: isSelected ? '2px solid rgba(37, 99, 235, 0.18)' : 'none',
        transform: `rotate(${contentRotation + (annotation.data.rotation ?? 0)}deg)`,
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
        <FreeTextPreview
          className="px-1 py-0.5 select-none"
          text={annotation.data?.text ?? ''}
          styleKey={`${bodyWidth}/${bodyHeight}/${scale}/${annotation.data?.fontSize}/${annotation.data?.fontWeight}/${annotation.data?.fontStyle}`}
        />
      )}
      {isSelected && !isLocked && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
