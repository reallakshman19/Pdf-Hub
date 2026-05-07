
import React, { useEffect, useRef, useState } from 'react';
import { KonvaAdapter } from '@/adapters/annotation-canvas/KonvaAdapter';
import { useAnnotationStore } from '@/core/annotations/store';
import { useEditorStore } from '@/core/editor/store';
import { PdfAnnotation } from '@/core/annotations/types';
import { v4 as uuidv4 } from 'uuid';

interface AnnotationOverlayProps {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
}

export const AnnotationOverlay: React.FC<AnnotationOverlayProps> = ({ pageNumber, width, height, scale }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<KonvaAdapter | null>(null);
  const { annotations, addAnnotation } = useAnnotationStore();
  const { activeTool } = useEditorStore();
  const [isDrawing, setIsDrawing] = useState(false);
  const currentLineRef = useRef<PdfAnnotation | null>(null);

  // Initialize stage
  useEffect(() => {
    if (!containerRef.current) return;
    if (!adapterRef.current) adapterRef.current = new KonvaAdapter();

    const stage = adapterRef.current.initStage(containerRef.current, width * scale, height * scale);

    // Draw event logic
    stage.on('mousedown touchstart', (e) => {
       if (activeTool !== 'freehand' && activeTool !== 'highlight') return;
       setIsDrawing(true);
       const pos = stage.getPointerPosition();
       if (!pos) return;

       const id = uuidv4();
       const newAnn: PdfAnnotation = {
         id,
         type: activeTool as any,
         pageNumber,
         rect: { x: pos.x, y: pos.y, width: 0, height: 0 },
         data: activeTool === 'freehand' ? { points: [pos.x, pos.y] } : { width: 10, height: 10 },
         createdAt: Date.now(),
         updatedAt: Date.now()
       };
       currentLineRef.current = newAnn;
    });

    stage.on('mousemove touchmove', (e) => {
       if (!isDrawing || !currentLineRef.current) return;
       const pos = stage.getPointerPosition();
       if (!pos) return;

       if (activeTool === 'freehand') {
         const pts = currentLineRef.current.data.points as number[];
         currentLineRef.current.data.points = [...pts, pos.x, pos.y];
       } else if (activeTool === 'highlight') {
         currentLineRef.current.rect.width = pos.x - currentLineRef.current.rect.x;
         currentLineRef.current.rect.height = pos.y - currentLineRef.current.rect.y;
         currentLineRef.current.data.width = currentLineRef.current.rect.width;
         currentLineRef.current.data.height = currentLineRef.current.rect.height;
       }

       // Force a fast re-render for drawing feel
       adapterRef.current?.removeObject(currentLineRef.current.id);
       adapterRef.current?.addObject(currentLineRef.current);
    });

    stage.on('mouseup touchend', (e) => {
       if (!isDrawing || !currentLineRef.current) return;
       setIsDrawing(false);
       addAnnotation({...currentLineRef.current});
       currentLineRef.current = null;
    });

    return () => stage.destroy();
  }, [width, height, scale, pageNumber, activeTool, isDrawing, addAnnotation]);

  // Sync state to Konva
  useEffect(() => {
    if (!adapterRef.current) return;
    const pageAnns = annotations.filter(a => a.pageNumber === pageNumber);
    adapterRef.current.deserialize(pageAnns);
  }, [annotations, pageNumber]);

  return (
    <div
      ref={containerRef}
      className={`absolute top-0 left-0 ${activeTool !== 'select' && activeTool !== 'hand' ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      style={{ width: `${width * scale}px`, height: `${height * scale}px`, zIndex: 5 }}
      data-testid={`annotation-overlay-${pageNumber}`}
    />
  );
};
