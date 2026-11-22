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
  const borderWidth = typeof annotation.data?.borderWidth === 'number'
    ? annotation.data.borderWidth
    : (annotation.data?.borderColor && annotation.data.borderColor.toLowerCase() !== '#ffffff' ? 1.5 : 0);
  const rawBorderColor = annotation.data?.borderColor;
  const borderColor =
    rawBorderColor && rawBorderColor.toLowerCase() !== '#ffffff'
      ? rawBorderColor
      : (annotation.data?.textColor ?? '#60a5fa');
  const hasBorder = borderWidth > 0;
  return (
    <div
      data-annotation-type="textbox"
      data-native-annotation-id={annotation.data.nativeSourceRef ? annotation.id : undefined}
      data-native-source-ref={annotation.data.nativeSourceRef}
      data-native-selected={isSelected ? 'true' : 'false'}
      style={{
        position: 'absolute',
        left: rect.x + (rect.width - bodyWidth) / 2,
        top: rect.y + (rect.height - bodyHeight) / 2,
        width: bodyWidth, height: bodyHeight,
        background: annotation.data?.backgroundColor ?? (hasBorder ? '#ffffff' : 'transparent'),
        border: hasBorder ? `${borderWidth}px solid ${borderColor}` : 'none',
        color: annotation.data?.textColor ?? '#0f172a',
        fontFamily: annotation.data?.fontFamily ?? 'Helvetica, Arial, sans-serif',
        fontSize: (annotation.data?.fontSize ?? 12) * scale,
        textAlign: annotation.data?.textAlign ?? 'left',
        fontWeight: annotation.data?.fontWeight ?? 'normal',
        fontStyle: annotation.data?.fontStyle ?? 'normal',
        pointerEvents: 'all',
        cursor: isLocked ? 'default' : (isEditing ? 'text' : (isSelected ? 'move' : 'pointer')),
        touchAction: 'none',
        userSelect: 'none',
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
          className={hasBorder ? 'px-1 py-0.5 select-none' : 'p-0 select-none'}
          text={annotation.data?.text ?? ''}
          styleKey={`${bodyWidth}/${bodyHeight}/${scale}/${annotation.data?.fontSize}/${annotation.data?.fontWeight}/${annotation.data?.fontStyle}/${annotation.data?.fontFamily}`}
        />
      )}
      {isSelected && !isLocked && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
