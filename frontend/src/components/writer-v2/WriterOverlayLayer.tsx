import React from 'react';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import { getViewportSize } from '@/core/writer-v2/coordinateTransform';
import {
  selectVisibleWriterElementsForPage,
  useWriterV2Store,
} from '@/core/writer-v2/writerV2Store';
import { WriterElementBox } from './WriterElementBox';

export interface WriterOverlayLayerProps {
  pageNumber: number;
  viewport: WriterPageViewport;
}

export const WriterOverlayLayer: React.FC<WriterOverlayLayerProps> = ({
  pageNumber,
  viewport,
}) => {
  const pageIndex = pageNumber - 1;
  const size = getViewportSize(viewport);
  const allElements = useWriterV2Store((state) => state.elements);
  const elements = React.useMemo(
    () => selectVisibleWriterElementsForPage({
      elements: allElements,
      selectedIds: [],
      activeId: null,
      undoStack: [],
      redoStack: [],
      dirty: false,
    }, pageIndex),
    [allElements, pageIndex],
  );
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);

  return (
    <div
      data-writer-overlay-v2="true"
      data-page-number={pageNumber}
      aria-label={`Writer overlay v2 page ${pageNumber}`}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;

        dispatchWriterCommand({
          type: 'CLEAR_WRITER_SELECTION',
        });
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: size.width,
        height: size.height,
        pointerEvents: 'auto',
        zIndex: 12,
        overflow: 'visible',
      }}
    >
      {elements.map((element) => (
        <WriterElementBox
          key={element.id}
          element={element}
          viewport={viewport}
          selected={selectedIds.includes(element.id)}
        />
      ))}
    </div>
  );
};

export function isWriterOverlayV2Enabled(): boolean {
  return import.meta.env.VITE_WRITER_OVERLAY_ENGINE === 'v2';
}
