import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';
import { nativeTextDisplayRect } from './shared/nativeTextAnchor';
import { InlineTextEditor } from './shared/InlineTextEditor';

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
        <InlineTextEditor
          defaultValue={editingValue ?? ''}
          style={{
            fontSize: annotation.data?.fontSize ?? 12,
            fontFamily: 'inherit',
            color: annotation.data?.textColor ?? '#111827',
            backgroundColor: isTransparentBg ? 'transparent' : (annotation.data?.backgroundColor ?? '#fff7cc'),
          }}
          bounds={{ width: displayRect.width, height: displayRect.height }}
          scale={scale}
          onCommit={(val, stylePatch) => (stylePatch !== undefined ? onCommitEdit?.(val, stylePatch) : onCommitEdit?.(val))}
          onCancel={() => onCommitEdit?.(editingValue ?? '')}
        />
      ) : (
        <div className="w-full h-full">{annotation.data?.text ?? 'Note'}</div>
      )}
      {isSelected && <SelectionHandles rect={rect} onTransformStart={onTransformStart} />}
    </div>
  );
};
