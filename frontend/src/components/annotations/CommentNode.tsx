import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';
import { nativeTextDisplayRect } from './shared/nativeTextAnchor';

export const CommentNode: React.FC<AnnotationNodeProps<'comment'>> = ({
  annotation, rect, scale, isSelected, isEditing, editingValue,
  onSelect, onTransformStart, onDoubleClick, onCommitEdit, pageRotation = 0,
}) => {
  const displayRect = nativeTextDisplayRect(rect, pageRotation);
  const isTransparentBg = annotation.data?.backgroundColor === 'transparent';
  return (
    <div
      data-annotation-type="comment"
      data-native-annotation-id={annotation.data.nativeSourceRef ? annotation.id : undefined}
      data-native-source-ref={annotation.data.nativeSourceRef}
      data-native-selected={isSelected ? 'true' : 'false'}
      style={{
        position: 'absolute',
        left: displayRect.x, top: displayRect.y, width: displayRect.width, height: displayRect.height,
        opacity: annotation.data?.opacity ?? 1,
        background: isTransparentBg ? 'transparent' : (annotation.data?.backgroundColor ?? '#fff7cc'),
        border: `1.5px solid ${annotation.data?.borderColor ?? '#d4b106'}`,
        color: annotation.data?.textColor ?? '#111827',
        fontSize: (annotation.data?.fontSize ?? 12) * scale,
        borderRadius: 6, padding: 4,
        cursor: isEditing ? 'text' : (isSelected ? 'move' : 'pointer'), pointerEvents: 'all',
        touchAction: 'none', userSelect: 'none',
      }}
      onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
      onDoubleClick={onDoubleClick}
    >
      {isEditing ? (
        <textarea
          autoFocus
          ref={(el) => {
            if (el) {
              el.selectionStart = el.value.length;
              el.selectionEnd = el.value.length;
            }
          }}
          defaultValue={editingValue}
          style={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            resize: 'none',
            overflow: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            border: 'none',
            outline: 'none',
            padding: 0,
            margin: 0,
            lineHeight: 1.2,
            fontSize: 'inherit',
            fontFamily: 'inherit',
            color: 'inherit',
            background: isTransparentBg ? 'rgba(255, 255, 255, 0.85)' : 'transparent',
          }}
          onBlur={e => onCommitEdit?.(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onCommitEdit?.(e.currentTarget.value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCommitEdit?.(editingValue ?? '');
            }
          }}
        />
      ) : (
        <div className="w-full h-full">{annotation.data?.text ?? 'Note'}</div>
      )}
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
