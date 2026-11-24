import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';
import { nativeTextDisplayRect } from './shared/nativeTextAnchor';
import { InlineTextEditor } from './shared/InlineTextEditor';
import { PdfNoteIcon } from './shared/PdfNoteIcon';

export const CommentNode: React.FC<AnnotationNodeProps<'comment'>> = ({
  annotation, rect, scale, isSelected, isEditing, editingValue,
  onSelect, onTransformStart, onDoubleClick, onCommitEdit, pageRotation = 0,
}) => {
  const iconRect = nativeTextDisplayRect(rect, pageRotation);
  // A native note's /Rect only bounds its icon; give its editor usable room.
  const displayRect = annotation.data?.noteIcon && isEditing
    ? { ...iconRect, width: Math.max(iconRect.width, 220), height: Math.max(iconRect.height, 110) }
    : iconRect;
  const isTransparentBg = annotation.data?.backgroundColor === 'transparent';

  // A closed native PDF /Text note shows its /Name icon in its /C colour, as
  // other PDF viewers do, instead of a text box sized to its small icon rect.
  if (annotation.data?.noteIcon && annotation.data.isCollapsed !== false && !isEditing) {
    const author = annotation.data.review?.author ?? annotation.data.author ?? 'Note';
    const text = annotation.data.text ?? '';
    return (
      <div
        data-annotation-type="comment"
        data-native-annotation-id={annotation.data.nativeSourceRef ? annotation.id : undefined}
        data-native-source-ref={annotation.data.nativeSourceRef}
        data-native-selected={isSelected ? 'true' : 'false'}
        title={text ? `${author}: ${text}` : author}
        style={{
          position: 'absolute',
          left: displayRect.x, top: displayRect.y,
          opacity: annotation.data?.opacity ?? 1,
          cursor: isSelected ? 'move' : 'pointer', pointerEvents: 'all',
          touchAction: 'none', userSelect: 'none',
          outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 2, borderRadius: 3,
        }}
        onPointerDown={e => { onSelect(e); onTransformStart(e, 'move'); }}
        onDoubleClick={onDoubleClick}
      >
        <PdfNoteIcon
          name={annotation.data.noteIcon}
          color={annotation.data?.borderColor ?? (isTransparentBg ? undefined : annotation.data?.backgroundColor) ?? '#fde047'}
          size={Math.max(12, Math.min(displayRect.width, displayRect.height))}
        />
      </div>
    );
  }

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
        overflow: isEditing ? 'visible' : 'hidden',
        zIndex: isEditing ? 50 : undefined,
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
          bounds={{ width: displayRect.width, height: displayRect.height, y: displayRect.y }}
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
