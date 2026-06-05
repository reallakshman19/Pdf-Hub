import React from 'react';
import type { WriterElementV2, WriterPageViewport } from '@/core/writer-v2/types';
import { writerDisplayHtml } from '@/core/writer-v2/editor/writerDisplayHtml';
import { WriterSelectionHandles, type ResizeHandle } from './WriterSelectionHandles';
import { WriterInlineEditor } from './WriterInlineEditor';
import type { WriterEditorSavePayload } from '@/core/writer-v2/editor/writerEditorState';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

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
        padding: element.style.padding ?? 8,
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
}: {
  element: WriterElementV2;
  isEditing: boolean;
  imageAssetDataUrl?: string;
  onSave?: (payload: WriterEditorSavePayload) => void;
  onCancel?: () => void;
}): React.ReactNode {
  if (element.type === 'tableBox') {
    return <WriterTablePreview element={element} />;
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

function WriterTablePreview({ element }: { element: WriterElementV2 }) {
  const tableData = element.tableData;

  if (!tableData) {
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
        }}
      >
        Empty table
      </div>
    );
  }

  return (
    <table
      data-writer-v2-display-content="true"
      style={{
        width: '100%',
        height: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        pointerEvents: 'none',
        fontSize: element.style.fontSize ?? 11,
        color: element.style.textColor ?? '#111827',
      }}
    >
      <thead>
        <tr>
          {tableData.columns.map((column) => (
            <th
              key={column.id}
              style={{
                border: '1px solid #cbd5e1',
                background: '#f1f5f9',
                padding: 4,
                textAlign: 'left',
                fontWeight: 700,
              }}
            >
              {column.label ?? ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tableData.rows.map((row) => (
          <tr key={row.id}>
            {tableData.columns.map((column, index) => {
              const cell = row.cells[index];

              return (
                <td
                  key={cell?.id ?? `${row.id}-${column.id}`}
                  style={{
                    border: '1px solid #cbd5e1',
                    padding: 4,
                    verticalAlign: 'top',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {cell?.text ?? ''}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
