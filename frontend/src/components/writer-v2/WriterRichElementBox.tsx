import React from 'react';
import type { WriterElementV2, WriterPageViewport } from '@/core/writer-v2/types';
import { writerDisplayHtml } from '@/core/writer-v2/editor/writerDisplayHtml';
import { WriterSelectionHandles, type ResizeHandle } from './WriterSelectionHandles';
import { WriterInlineEditor } from './WriterInlineEditor';
import type { WriterEditorSavePayload } from '@/core/writer-v2/editor/writerEditorState';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterTableBoxContent } from './WriterTableBoxContent';
import { WriterTableInteractionOverlay } from './WriterTableInteractionOverlay';
import { useWriterTableSelectionState } from './useWriterTableSelectionState';

export interface WriterRichElementBoxProps {
  element: WriterElementV2;
  viewport: WriterPageViewport;
  selected: boolean;
  isEditing: boolean;
  onBeginDrag: (event: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize', handle?: ResizeHandle) => void;
  onUpdateDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  onEndDrag: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  viewportRect: { x: number; y: number; width: number; height: number };
  onSave?: (payload: WriterEditorSavePayload) => void;
  onCancel?: () => void;
}

export const WriterRichElementBox: React.FC<WriterRichElementBoxProps> = ({
  element,
  selected,
  isEditing,
  onBeginDrag,
  onUpdateDrag,
  onEndDrag,
  onClick,
  onDoubleClick,
  viewportRect,
  onSave,
  onCancel,
}) => {
  const imageAsset = useWriterV2Store((state) =>
    element.imageAssetId
      ? state.assetRecords.find((asset) => asset.id === element.imageAssetId)
      : undefined,
  );

  const { selection: tableSelection, setSelection: onTableSelectionChange } = useWriterTableSelectionState();

  return (
    <div
      data-writer-v2-element-id={element.id}
      aria-label={`Writer element ${element.id}`}
      onClick={onClick}
      onMouseDown={(event) => {
        const target = event.target;
        if (
          event.detail < 2 ||
          (target instanceof HTMLElement && target.closest('[data-writer-v2-resize-handle]'))
        ) {
          return;
        }
        onDoubleClick(event);
      }}
      onDoubleClick={onDoubleClick}
      onPointerDown={isEditing ? undefined : (event) => onBeginDrag(event, 'move')}
      onPointerMove={isEditing ? undefined : onUpdateDrag}
      onPointerUp={isEditing ? undefined : onEndDrag}
      onPointerCancel={isEditing ? undefined : onEndDrag}
      style={{
        position: 'absolute',
        left: viewportRect.x,
        top: viewportRect.y,
        width: viewportRect.width,
        height: viewportRect.height,
        boxSizing: 'border-box',
        pointerEvents: 'auto',
        cursor: isEditing ? 'text' : element.locked ? 'not-allowed' : 'move',
        zIndex: element.style.zIndex,
        background: element.style.backgroundColor ?? 'rgba(255,255,255,0.88)',
        border:
          element.type === 'textStamp' || element.type === 'imageBox'
            ? `${element.style.borderWidth ?? 0}px solid ${element.style.borderColor ?? 'transparent'}`
            : `${element.style.borderWidth ?? 1}px solid ${element.style.borderColor ?? '#2563eb'}`,
        opacity: element.style.opacity ?? 1,
        padding: element.type === 'tableBox' ? 0 : (element.style.padding ?? 8),
        overflow: 'hidden',
        color: element.style.textColor ?? '#111827',
        fontSize: element.style.fontSize ?? 13,
        fontFamily: element.style.fontFamily ?? 'inherit',
        fontWeight: element.type === 'textStamp' ? 700 : undefined,
        letterSpacing: element.type === 'textStamp' ? '0.08em' : undefined,
        lineHeight: 1.35,
        userSelect: isEditing ? 'text' : 'none',
        boxShadow: element.type === 'richNote' ? '2px 2px 6px rgba(0,0,0,0.12)' : undefined,
      }}
    >
      {renderElementContent({
        element,
        isEditing,
        imageAssetDataUrl: imageAsset?.dataUrl,
        onSave,
        onCancel,
        viewportRect,
        tableSelection,
        onTableSelectionChange,
      })}

      {selected && !isEditing ? (
        <WriterSelectionHandles
          onResizePointerDown={(event, handle) => onBeginDrag(event, 'resize', handle)}
        />
      ) : null}
    </div>
  );
};

function renderElementContent({
  element,
  isEditing,
  imageAssetDataUrl,
  onSave,
  onCancel,
  viewportRect,
  tableSelection,
  onTableSelectionChange,
}: {
  element: WriterElementV2;
  isEditing: boolean;
  imageAssetDataUrl?: string;
  onSave?: (payload: WriterEditorSavePayload) => void;
  onCancel?: () => void;
  viewportRect: { x: number; y: number; width: number; height: number };
  tableSelection: import('@/core/writer-v2/table-pro/writerTableSelection').WriterTableSelection | null;
  onTableSelectionChange: (selection: import('@/core/writer-v2/table-pro/writerTableSelection').WriterTableSelection | null) => void;
}): React.ReactNode {
  if (element.type === 'tableBox') {
    return (
      <div
        className="relative h-full w-full overflow-hidden"
        data-writer-table-box-root="true"
      >
        <WriterTableBoxContent
          element={element}
          width={viewportRect.width}
          height={viewportRect.height}
          selection={tableSelection}
        />

        <WriterTableInteractionOverlay
          element={element}
          rect={{
            x: 0,
            y: 0,
            width: viewportRect.width,
            height: viewportRect.height,
          }}
          getLocalPoint={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();

            return {
              x: event.clientX - bounds.left,
              y: bounds.height - (event.clientY - bounds.top),
            };
          }}
          selection={tableSelection}
          onSelectionChange={onTableSelectionChange}
        />
      </div>
    );
  }

  if (element.type === 'imageBox') {
    return <WriterImagePreview dataUrl={imageAssetDataUrl} />;
  }

  if (isEditing && onSave && onCancel) {
    return (
      <WriterInlineEditor
        element={element}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }

  if (element.editorStateJson) {
    return (
      <div
        data-writer-v2-display-content="true"
        style={{ pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{
          __html: writerDisplayHtml(element.editorStateJson, element.plainText) || '<span style="color:#9ca3af">Double-click to edit</span>',
        }}
      />
    );
  }

  return (
    <div
      data-writer-v2-display-content="true"
      style={{ pointerEvents: 'none', whiteSpace: 'pre-wrap' }}
    >
      {element.plainText || 'Double-click to edit'}
    </div>
  );
}

function WriterImagePreview({ dataUrl }: { dataUrl?: string }) {
  if (!dataUrl) {
    return (
      <div
        data-writer-v2-display-content="true"
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: '#94a3b8',
          fontSize: 12,
          background: '#f8fafc',
        }}
      >
        Missing image asset
      </div>
    );
  }

  return (
    <img
      data-writer-v2-display-content="true"
      src={dataUrl}
      alt="Writer inserted asset"
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        objectFit: 'contain',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    />
  );
}
