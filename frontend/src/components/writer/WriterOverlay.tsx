// @ts-nocheck
import React, { useCallback, useState } from 'react';
import { useWriterStore } from '../../core/writer/store';
import { WriterElementNode } from './WriterElementNode';
import type { PlacedElement } from '../../core/writer/types';
import { WriterSnapGuides } from './WriterSnapGuides';
import type { SnapGuide } from '../../core/writer/geometry';
import { recognizeImage } from '../../core/ocr/clientOcr';
import { useToastStore } from '../../core/toast/store';
import { error as logError } from '@/core/logger/service';

interface Props { scale?: number;
  pageNumber:     number;
  scale: 1, // scale: 1, // scale: 1, // scale:          number;
  pageDimensions: { width: number; height: number } | null;
}

function nextId(): string {
  return `wel-${crypto.randomUUID()}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ocrTextToHtml(value: string): string {
  const escaped = escapeHtml(value);
  return `<p>${escaped.replace(/\r?\n/g, '<br/>')}</p>`;
}

function isWriterPlacementTool(tool: string): boolean {
  return tool === 'place-text' || tool === 'place-image' || tool === 'place-table';
}

/**
 * Transparent overlay above the PDF canvas for one page.
 *
 * Behaviour:
 * - Interaction layer captures pointer events only for placement/OCR/marquee.
 * - Element layer keeps writer nodes interactive while preserving pass-through
 *   to the base workspace when no capture mode is active.
 *
 * z-index: 10 (above canvas z-0, below annotations z-20).
 */
export const WriterOverlay: React.FC<Props> = ({ pageNumber, scale, pageDimensions }) => {
  const { elements, activeTool, addElement, setActiveTool, setSelectedId, setSelection, clearSelection, toggleSelection } =
    useWriterStore();

  const pageElements = elements
    .filter(e => e.pageNumber === pageNumber)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  const addToast = useToastStore(s => s.addToast);

  // Marquee selection state
  const [marqueeStart, setMarqueeStart] = useState<{ x: number, y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number, y: number } | null>(null);

  // Snap guides state (passed down from store or managed locally during drag)
  // To keep it simple, WriterElementNode will push active guides up via a custom event or callback,
  // but an easier React way is lifting state up, or we can just render the guides inside the overlay
  // by observing a small local state since drag updates happen very fast.
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);

  // Track shift key for enabling marquee selection
  const [isShiftDown, setIsShiftDown] = useState(false);

  const isPlacing = activeTool !== 'select';
  const isPlacementTool = isWriterPlacementTool(activeTool);
  const isOcr = activeTool === 'ocr-region';
  const isWriterCaptureMode = isPlacementTool || isOcr || isShiftDown;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftDown(true); };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setIsShiftDown(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // If not select tool or OCR tool, allow click handling to process
    if (isPlacing && !isOcr) return;

    // Only capture if clicking directly on the overlay, not on a child WriterElementNode
    if (e.target !== e.currentTarget) return;

    // Clear selection if we click empty space (unless holding modifier)
    if (!e.metaKey && !e.ctrlKey) {
      clearSelection();
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    setMarqueeStart({ x: screenX, y: screenY });
    setMarqueeCurrent({ x: screenX, y: screenY });
  }, [isPlacing, isOcr, clearSelection]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!marqueeStart) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    setMarqueeCurrent({ x: screenX, y: screenY });
  }, [marqueeStart]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!marqueeStart || !marqueeCurrent) return;

    e.currentTarget.releasePointerCapture(e.pointerId);

    // If it was just a tiny click movement, don't trigger selection box logic
    const dx = Math.abs(marqueeCurrent.x - marqueeStart.x);
    const dy = Math.abs(marqueeCurrent.y - marqueeStart.y);

    if (dx > 5 || dy > 5) {
       // Convert screen marquee to PDF space rect
       const left = Math.min(marqueeStart.x, marqueeCurrent.x) / scale;
       const right = Math.max(marqueeStart.x, marqueeCurrent.x) / scale;
       const top = Math.min(marqueeStart.y, marqueeCurrent.y) / scale;
       const bottom = Math.max(marqueeStart.y, marqueeCurrent.y) / scale;

       if (isOcr) {
         if (!pageDimensions) {
           setMarqueeStart(null);
           setMarqueeCurrent(null);
           return;
         }

         // Perform OCR
             const container = e.currentTarget.parentElement?.parentElement;
             if (container) {
               const canvas = container.querySelector('canvas');
           if (canvas) {
             // Create an offscreen canvas to extract just the selected rect from the main canvas
             const offscreen = document.createElement('canvas');
             // The main canvas is rendered at a higher pixel density often, but we assume
             // it maps roughly to the screen coords.
             // Best way is to scale the extraction rect up by the canvas's internal scaling.
             const scaleX = canvas.width / (pageDimensions.width * scale);
             const scaleY = canvas.height / (pageDimensions.height * scale);

             offscreen.width = (right - left) * scale * scaleX;
             offscreen.height = (bottom - top) * scale * scaleY;
             const ctx = offscreen.getContext('2d');
             if (ctx) {
               ctx.drawImage(
                 canvas,
                 left * scale * scaleX, top * scale * scaleY, offscreen.width, offscreen.height,
                 0, 0, offscreen.width, offscreen.height
               );
               const dataUrl = offscreen.toDataURL('image/png');

               addToast({ type: 'info', title: 'Running OCR', message: 'Extracting text from region...' });

               recognizeImage(dataUrl).then(text => {
                 if (text.trim()) {
                   addElement({
                     id: nextId(),
                     type: 'rich-text',
                     pageNumber,
                     x: left,
                     y: top,
                     width: Math.max(200/scale, right - left),
                     height: Math.max(80/scale, bottom - top),
                     content: ocrTextToHtml(text),
                     styles: {},
                     zIndex: elements.length,
                     locked: false,
                   });
                   addToast({ type: 'success', title: 'OCR Complete', message: 'Text extracted successfully.' });
                 } else {
                   addToast({ type: 'info', title: 'OCR Complete', message: 'No text found in region.' });
                 }
                 setActiveTool('select');
               }).catch(err => {
                 logError('ocr', 'OCR region recognition failed', { error: String(err) });
                 addToast({ type: 'error', title: 'OCR Failed', message: 'Could not extract text.' });
                 setActiveTool('select');
               });
             }
           }
         }
       } else {
         // Find all elements completely or partially inside the box
         const hits = pageElements.filter(el => {
           const elRight = el.x + el.width;
           const elBottom = el.y + el.height;
           // standard AABB intersection
           return !(
              right < el.x ||
              left > elRight ||
              bottom < el.y ||
              top > elBottom
           );
         }).map(el => el.id);

         if (hits.length > 0) {
           if (e.metaKey || e.ctrlKey) {
              hits.forEach(toggleSelection);
           } else {
              setSelection(hits);
           }
         }
       }
    }

    setMarqueeStart(null);
    setMarqueeCurrent(null);
  }, [marqueeStart, marqueeCurrent, pageElements, scale, setSelection, toggleSelection, isOcr, addElement, elements.length, pageNumber, setActiveTool, addToast, pageDimensions]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // If we are selecting or using OCR, we already handled clicks via pointer down/up
      if (!isPlacing || isOcr || !pageDimensions) return;

      // Prevent event from reaching annotation layer
      e.stopPropagation();

      // Convert screen coords to PDF space
      const rect = e.currentTarget.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const pdfX = screenX / scale;
      const pdfY = screenY / scale;

      const typeMap = {
        'place-text':  'rich-text',
        'place-image': 'image',
        'place-table': 'table',
      } as const;

      const elementType = typeMap[activeTool as keyof typeof typeMap];
      if (!elementType) return;

      const newElement: PlacedElement = {
        id:         nextId(),
        type:       elementType,
        pageNumber,
        x:          pdfX,
        y:          pdfY,
        width:      200 / scale,   // default 200px screen → PDF space
        height:     80  / scale,
        content:    elementType === 'table'
                      ? JSON.stringify({
                          columns: [{ id: 'col-1' }, { id: 'col-2' }],
                          rows: [
                            { id: 'r-head', cells: [{ id: 'c-h1', text: 'Col 1' }, { id: 'c-h2', text: 'Col 2' }] },
                            { id: 'r-1', cells: [{ id: 'c-1-1', text: '' }, { id: 'c-1-2', text: '' }] }
                          ],
                          style: { borderColor: '#d1d5db', headerBg: '#f1f5f9' }
                        })
                      : '',
        styles:     {},
        zIndex:     elements.length,
        locked:     false,
      };

      addElement(newElement);
      setSelectedId(newElement.id);
      setActiveTool('select');   // return to select after placement
    },
    [isPlacing, isOcr, pageDimensions, scale, activeTool, elements.length, pageNumber, addElement, setActiveTool, setSelectedId],
  );

  if (!pageDimensions) return null;

  const captureLayerEnabled = isWriterCaptureMode;
  const captureCursor = isWriterCaptureMode ? 'crosshair' : 'default';

  return (
    <div
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         pageDimensions.width * scale,
        height:        pageDimensions.height * scale,
        zIndex:        10,
        pointerEvents: 'none',
        overflow:      'visible',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: captureLayerEnabled ? 'all' : 'none',
          cursor: captureCursor,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleOverlayClick}
      >
        {/* Grid hint when in placement mode */}
        {isPlacing && (
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.08, pointerEvents: 'none' }}
            width={pageDimensions.width * scale}
            height={pageDimensions.height * scale}
          >
            {/* 20px vertical lines */}
            {Array.from({ length: Math.ceil((pageDimensions.width * scale) / 20) }, (_, i) => (
              <line key={`v${i}`} x1={i * 20} y1={0} x2={i * 20} y2={pageDimensions.height * scale} stroke="currentColor" strokeWidth={0.5} />
            ))}
            {/* 20px horizontal lines */}
            {Array.from({ length: Math.ceil((pageDimensions.height * scale) / 20) }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 20} x2={pageDimensions.width * scale} y2={i * 20} stroke="currentColor" strokeWidth={0.5} />
            ))}
          </svg>
        )}

        {marqueeStart && marqueeCurrent && (
           <div
             className="absolute pointer-events-none border border-blue-500 bg-blue-200/20"
             style={{
                left: Math.min(marqueeStart.x, marqueeCurrent.x),
                top: Math.min(marqueeStart.y, marqueeCurrent.y),
                width: Math.abs(marqueeCurrent.x - marqueeStart.x),
                height: Math.abs(marqueeCurrent.y - marqueeStart.y),
             }}
           />
        )}
      </div>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {activeGuides.length > 0 && pageDimensions && (
           <WriterSnapGuides guides={activeGuides} scale={scale} pageDimensions={pageDimensions} />
        )}

        {pageElements.map(element => (
          <WriterElementNode
            key={element.id}
            element={element}
            scale={scale}
            pageDimensions={pageDimensions}
            onGuidesChange={setActiveGuides}
          />
        ))}
      </div>
    </div>
  );
};
