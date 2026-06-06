import React from 'react';
import type { WriterDocumentMetaV2 } from '@/core/writer-v2/types';
import {
  viewportToPdfPoint,
} from '@/core/writer-v2/coordinateTransform';
import {
  createWriterBlankPageLayout,
} from '@/core/writer-v2/writerBlankDocumentLayout';
import { getVisibleWriterElements } from '@/core/writer-v2/writerCommandStore';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { createWriterElementFromPlacement } from '@/core/writer-v2/writerPlacement';
import { shouldWriterOverlayCapturePlacement } from '@/core/writer-v2/writerToolPolicy';
import { useEditorStore } from '@/core/editor/store';
import { WriterElementBox } from './WriterElementBox';

export interface WriterBlankPageCanvasProps {
  pageIndex: number;
  documentMeta?: WriterDocumentMetaV2 | null;
  scale?: number;
  showMarginGuides?: boolean;
  className?: string;
}

export const WriterBlankPageCanvas: React.FC<WriterBlankPageCanvasProps> = ({
  pageIndex,
  documentMeta: documentMetaProp,
  scale = 1,
  showMarginGuides = true,
  className,
}) => {
  const activeMode = useEditorStore((state) => state.activeMode);
  const storeDocumentMeta = useWriterV2Store((state) => state.documentMeta);
  const allElements = useWriterV2Store((state) => state.elements);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const activeWriterTool = useWriterV2Store((state) => state.activeWriterTool);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const setActiveWriterTool = useWriterV2Store((state) => state.setActiveWriterTool);

  const documentMeta = documentMetaProp ?? storeDocumentMeta;

  const layout = React.useMemo(() => {
    if (!documentMeta || documentMeta.mode !== 'blankDocument') {
      return null;
    }

    return createWriterBlankPageLayout({
      pageSetup: documentMeta.pageSetup,
      scale,
    });
  }, [documentMeta, scale]);

  const elements = React.useMemo(
    () => getVisibleWriterElements({
      elements: allElements,
      selectedIds: [],
      activeId: null,
      undoStack: [],
      redoStack: [],
      dirty: false,
    }, pageIndex),
    [allElements, pageIndex],
  );

  if (!documentMeta || documentMeta.mode !== 'blankDocument' || !layout) {
    return null;
  }

  const placeWriterElement = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clickPoint = viewportToPdfPoint(
      {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      layout.viewport,
    );

    const maxZIndex = allElements.reduce(
      (max, element) => Math.max(max, element.style.zIndex),
      0,
    );

    const element = createWriterElementFromPlacement({
      tool: activeWriterTool,
      documentFingerprint: documentMeta.documentFingerprint,
      pageIndex,
      clickPoint,
      pageBounds: layout.pageBounds,
      zIndex: maxZIndex + 1,
    });

    if (!element) {
      return;
    }

    dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element,
    });

    setActiveWriterTool('select');
  };

  const isPlacementTool = shouldWriterOverlayCapturePlacement(activeWriterTool);
  const canPlace = activeMode === 'write' && isPlacementTool;

  return (
    <div
      className={className}
      data-testid="writer-blank-page-canvas"
      data-writer-blank-page="true"
      data-page-index={pageIndex}
      aria-label={`Writer blank document page ${pageIndex + 1}`}
      style={{
        position: 'relative',
        width: layout.cssWidth,
        height: layout.cssHeight,
        background: documentMeta.pageSetup.backgroundColor ?? '#ffffff',
        boxShadow: '0 10px 30px rgba(15,23,42,0.18)',
        overflow: 'visible',
        cursor: canPlace ? 'crosshair' : 'default',
      }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (canPlace) {
          placeWriterElement(event);
          return;
        }

        dispatchWriterCommand({
          type: 'CLEAR_WRITER_SELECTION',
        });
      }}
    >
      {showMarginGuides ? (
        <div
          data-testid="writer-blank-page-margin-guide"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: layout.marginGuideCss.left,
            top: layout.marginGuideCss.top,
            width: layout.marginGuideCss.width,
            height: layout.marginGuideCss.height,
            border: '1px dashed rgba(59,130,246,0.45)',
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : null}

      {elements.map((element) => (
        <WriterElementBox
          key={element.id}
          element={element}
          viewport={layout.viewport}
          selected={selectedIds.includes(element.id)}
        />
      ))}
    </div>
  );
};
