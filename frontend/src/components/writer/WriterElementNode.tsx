import React, { useRef, useState, useCallback } from 'react';
import { useWriterStore } from '../../core/writer/store';
import { RichTextEditorPanel } from './RichTextEditorPanel';
import { TableEditorPanel } from './TableEditorPanel';
import type { PlacedElement, TransformHandle } from '../../core/writer/types';
import { buildTableHtml } from '../../core/writer/exporter';
import { calculateSnaps, type SnapGuide } from '../../core/writer/geometry';
import './WriterElementNode.css';

interface Props {
  element: PlacedElement;
  scale:   number;
  pageDimensions?: { width: number; height: number };
  onGuidesChange?: (guides: SnapGuide[]) => void;
}

/**
 * Renders a single placed element with:
 * - Move: pointerdown on body → drag → pointerup commits
 * - Resize: pointerdown on corner handle → drag → pointerup commits
 * - Double-click: opens the appropriate editor panel
 * - Right-click: z-index context menu
 *
 * All drag operations use setPointerCapture for reliable tracking outside the element bounds.
 */
export const WriterElementNode: React.FC<Props> = ({ element, scale, pageDimensions, onGuidesChange }) => {
  const {
    updateElement,
    commitElementTransform,
    removeElement,
    setSelectedId,
    toggleSelection,
    selectedIds,
    activeId,
    bringForward,
    sendBackward
  } = useWriterStore();

  const isSelected = selectedIds.includes(element.id);
  const isActive = activeId === element.id;

  const [editMode, setEditMode] = useState<'rich-text' | 'table' | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);

  // Drag state refs (not state — no re-render needed during drag)
  const dragRef = useRef<{
    handle:   TransformHandle;
    startX:   number;
    startY:   number;
    origX:    number;
    origY:    number;
    origW:    number;
    origH:    number;
    preDragElements: PlacedElement[]; // Captured elements snapshot before drag
    groupOffsets?: Record<string, { x: number, y: number }>; // Captured relative offsets for group drag
  } | null>(null);

  // Screen → PDF space
  const handlePointerDown = useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      handle: TransformHandle
    ) => {
      if (element.locked) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const clientX = e.clientX;
      const clientY = e.clientY;

      if (e.metaKey || e.ctrlKey) {
        toggleSelection(element.id);
      } else if (!isSelected) {
        setSelectedId(element.id);
      }

      // Capture the exact layout before any dragging occurs
      const currentElements = useWriterStore.getState().elements;
      const isGroupMove = isSelected;

      const groupOffsets: Record<string, { x: number, y: number }> = {};
      if (isGroupMove && handle === 'move') {
         currentElements.forEach(el => {
           if (selectedIds.includes(el.id)) {
             groupOffsets[el.id] = { x: el.x, y: el.y };
           }
         });
      }

      dragRef.current = {
        handle,
        startX: clientX,
        startY: clientY,
        origX:  element.x,
        origY:  element.y,
        origW:  element.width,
        origH:  element.height,
        preDragElements: currentElements,
        groupOffsets
      };
    },
    [element, isSelected, selectedIds, setSelectedId, toggleSelection],
  );

  const toPdf = useCallback((px: number) => px / scale, [scale]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const { handle, startX, startY, origX, origY, origW, origH } = dragRef.current;

      const dx = toPdf(e.clientX - startX);
      const dy = toPdf(e.clientY - startY);

      if (handle === 'move') {
        useWriterStore.setState(s => {
          const isGroupMove = s.selectedIds.includes(element.id);
          const elementsToMove = isGroupMove ? s.selectedIds : [element.id];

          // Calculate proposed new bounds for the primary dragged element
          let newX = Math.max(0, origX + dx);
          let newY = Math.max(0, origY + dy);

          // If moving a single element and snapping is available, calculate snaps
          if (!isGroupMove && pageDimensions && onGuidesChange) {
             const otherElements = s.elements
                 .filter(el => el.id !== element.id && el.pageNumber === element.pageNumber)
                 .map(el => ({ x: el.x, y: el.y, width: el.width, height: el.height }));

             const snapResult = calculateSnaps(
                 { x: newX, y: newY, width: origW, height: origH },
                 otherElements,
                 pageDimensions
             );
             newX = snapResult.x;
             newY = snapResult.y;
             onGuidesChange(snapResult.guides);
          }

          // Apply bounds checking so elements don't easily fly off-page (optional enhancement mentioned in review)
          if (pageDimensions) {
            newX = Math.min(newX, pageDimensions.width - origW);
            newY = Math.min(newY, pageDimensions.height - origH);
          }

          // In a group move, calculate the delta based on the primary element's final clamped/snapped coords
          const finalDx = newX - origX;
          const finalDy = newY - origY;

          return {
            elements: s.elements.map(el => {
              if (elementsToMove.includes(el.id)) {
                if (isGroupMove && dragRef.current?.groupOffsets?.[el.id]) {
                  const origEl = dragRef.current.groupOffsets[el.id];
                  // Move group relative to the constrained translation of the active handle
                  return { ...el, x: Math.max(0, origEl.x + finalDx), y: Math.max(0, origEl.y + finalDy) };
                } else if (el.id === element.id) {
                  return { ...el, x: newX, y: newY };
                }
              }
              return el;
            })
          };
        });
      } else {
        // Resize — corner handles (resizing only applies to the actively dragged element, not group)
        let patch: Partial<PlacedElement> = {};
        const minSize = 20 / scale;
        if (handle === 'se') patch = { width: Math.max(minSize, origW + dx), height: Math.max(minSize, origH + dy) };
        if (handle === 'sw') patch = { x: origX + dx, width: Math.max(minSize, origW - dx), height: Math.max(minSize, origH + dy) };
        if (handle === 'ne') patch = { y: origY + dy, width: Math.max(minSize, origW + dx), height: Math.max(minSize, origH - dy) };
        if (handle === 'nw') patch = { x: origX + dx, y: origY + dy, width: Math.max(minSize, origW - dx), height: Math.max(minSize, origH - dy) };

        useWriterStore.setState(s => ({
          elements: s.elements.map(el => el.id === element.id ? { ...el, ...patch } : el),
        }));
      }
    },
    [element.id, scale, toPdf, element.pageNumber, onGuidesChange, pageDimensions],
  );

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return;
    const preDragSnapshot = dragRef.current.preDragElements;
    dragRef.current = null;
    if (onGuidesChange) onGuidesChange([]); // Clear guides
    commitElementTransform(preDragSnapshot);
  }, [commitElementTransform, onGuidesChange]);

  const handleDoubleClick = useCallback(() => {
    if (element.type === 'rich-text') setEditMode('rich-text');
    if (element.type === 'table')     setEditMode('table');
    if (element.type === 'image') {
      // Open file picker
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          updateElement(element.id, { content: ev.target?.result as string });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
  }, [element.type, element.id, updateElement]);

  // Screen-space dimensions
  const sx = element.x * scale;
  const sy = element.y * scale;
  const sw = element.width  * scale;
  const sh = element.height * scale;

  const HANDLE_SIZE = 8;

  return (
    <>
      <div
        className={`writer-element-node ${isSelected ? 'writer-element-node-selected' : 'writer-element-node-unselected'} ${isActive ? 'writer-element-node-active' : ''} ${element.locked ? 'writer-element-node-locked' : 'writer-element-node-unlocked'}`}
        style={{
          left:         sx,
          top:          sy,
          width:        sw,
          height:       sh,
          zIndex:       element.zIndex,
          fontSize:     (element.styles.fontSize ?? 12) * scale,
          color:        element.styles.color ?? 'inherit',
          backgroundColor: element.styles.backgroundColor ?? 'transparent',
          padding:      (element.styles.padding ?? 0) * scale,
          opacity:      element.styles.opacity ?? 1,
          border:       element.styles.borderWidth
            ? `${element.styles.borderWidth * scale}px solid ${element.styles.borderColor ?? '#000'}`
            : undefined,
        }}
        onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => handlePointerDown(e, 'move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={e => { e.preventDefault(); setShowContextMenu(true); }}
      >
        {element.type === 'rich-text' && (
          <div
            style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
            dangerouslySetInnerHTML={{ __html: element.content || '<span style="opacity:0.4">Double-click to edit</span>' }}
          />
        )}
        {element.type === 'image' && element.content && (
          <img src={element.content} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="" />
        )}
        {element.type === 'table' && (
          <div
            style={{ width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}
            dangerouslySetInnerHTML={{
              __html: buildTableHtml(
                JSON.parse(element.content || '{"headers":[],"rows":[]}'),
                sw,
                scale // Pass true scale so font sizes zoom correctly
              )
            }}
          />
        )}
      </div>

      {/* Resize handles — only when selected */}
      {isSelected && (
        <>
          <div
            className="writer-resize-handle"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE, zIndex: element.zIndex + 1, cursor: 'nw-resize',
              left: sx - HANDLE_SIZE / 2, top: sy - HANDLE_SIZE / 2,
            }}
            onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => { e.stopPropagation(); handlePointerDown(e, 'nw'); }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
             className="writer-resize-handle"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE, zIndex: element.zIndex + 1, cursor: 'ne-resize',
              left: sx + sw - HANDLE_SIZE / 2, top: sy - HANDLE_SIZE / 2,
            }}
            onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => { e.stopPropagation(); handlePointerDown(e, 'ne'); }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
             className="writer-resize-handle"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE, zIndex: element.zIndex + 1, cursor: 'se-resize',
              left: sx + sw - HANDLE_SIZE / 2, top: sy + sh - HANDLE_SIZE / 2,
            }}
            onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => { e.stopPropagation(); handlePointerDown(e, 'se'); }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
             className="writer-resize-handle"
            style={{
              width: HANDLE_SIZE, height: HANDLE_SIZE, zIndex: element.zIndex + 1, cursor: 'sw-resize',
              left: sx - HANDLE_SIZE / 2, top: sy + sh - HANDLE_SIZE / 2,
            }}
            onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => { e.stopPropagation(); handlePointerDown(e, 'sw'); }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </>
      )}

      {/* Context menu */}
      {showContextMenu && isSelected && (
        <div
          className="writer-context-menu-container"
          style={{ left: sx, top: sy + sh + 4 }}
          onPointerDown={e => e.stopPropagation()}
        >
          {[
            { label: 'Bring forward',  action: () => bringForward(element.id) },
            { label: 'Send backward',  action: () => sendBackward(element.id) },
            { label: '──', action: () => {} },
            { label: 'Delete',         action: () => removeElement(element.id) },
          ].map((item, i) => (
            item.label === '──'
              ? <div key={i} className="writer-context-menu-divider" />
              : <div
                  key={i}
                  className={`writer-context-menu-item ${item.label === 'Delete' ? 'writer-context-menu-item-danger' : ''}`}
                  onClick={() => { item.action(); setShowContextMenu(false); }}
                >
                  {item.label}
                </div>
          ))}
        </div>
      )}

      {/* Dismiss context menu on outside click */}
      {showContextMenu && (
        <div
          className="writer-context-menu-backdrop"
          onClick={() => setShowContextMenu(false)}
        />
      )}

      {/* Editor panels */}
      {editMode === 'rich-text' && (
        <RichTextEditorPanel
          element={element}
          scale={scale}
          onClose={() => setEditMode(null)}
        />
      )}
      {editMode === 'table' && (
        <TableEditorPanel
          element={element}
          scale={scale}
          onClose={() => setEditMode(null)}
        />
      )}
    </>
  );
};