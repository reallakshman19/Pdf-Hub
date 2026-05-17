import React from 'react';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import {
  getViewportSize,
  viewportToPdfPoint,
} from '@/core/writer-v2/coordinateTransform';
import { getVisibleWriterElements } from '@/core/writer-v2/writerCommandStore';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { createWriterElementFromPlacement } from '@/core/writer-v2/writerPlacement';
import { useSessionStore } from '@/core/session/store';
import { WriterElementBox } from './WriterElementBox';
import { SelectBoxCopyLayer } from '@/components/select-box-copy/SelectBoxCopyLayer';

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
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const activeWriterTool = useWriterV2Store((state) => state.activeWriterTool);
  const currentDocumentFingerprint = useWriterV2Store(
    (state) => state.currentDocumentFingerprint,
  );
  const dispatchWriterCommand = useWriterV2Store(
    (state) => state.dispatchWriterCommand,
  );
  const setActiveWriterTool = useWriterV2Store(
    (state) => state.setActiveWriterTool,
  );

  const sessionDocumentKey = useSessionStore((state) => state.documentKey);
  const fileName = useSessionStore((state) => state.fileName);

  const elements = React.useMemo(
    () => getVisibleWriterElements({ elements: allElements, selectedIds: [], activeId: null, undoStack: [], redoStack: [], dirty: false }, pageIndex),
    [allElements, pageIndex],
  );

  const placeWriterElement = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pdfPoint = viewportToPdfPoint(
      {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      viewport,
    );

    const documentFingerprint =
      currentDocumentFingerprint ??
      sessionDocumentKey ??
      fileName ??
      'writer-v2-unsaved-document';

    const maxZIndex = allElements.reduce(
      (max, element) => Math.max(max, element.style.zIndex),
      0,
    );

    const element = createWriterElementFromPlacement({
      tool: activeWriterTool,
      documentFingerprint,
      pageIndex,
      clickPoint: pdfPoint,
      pageBounds: {
        x: 0,
        y: 0,
        width: viewport.pdfWidth,
        height: viewport.pdfHeight,
      },
      zIndex: maxZIndex + 1,
    });

    if (!element) return;

    dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element,
    });

    setActiveWriterTool('select');
  };

  return (
    <div
      data-writer-overlay-v2="true"
      data-page-number={pageNumber}
      aria-label={`Writer overlay v2 page ${pageNumber}`}
      data-overlay-notice="overlay only"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;

        if (activeWriterTool === 'selectBoxCopy') {
          return;
        }

        if (activeWriterTool !== 'select') {
          placeWriterElement(event);
          return;
        }

        dispatchWriterCommand({
          type: 'CLEAR_WRITER_SELECTION',
        });
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: size.width,
        height: size.height,
        // Only block pointer events during active placement tools.
        // In 'select' and 'selectBoxCopy' modes, pass events through to the
        // PDF text layer so native text selection continues to work.
        // Individual WriterRichElementBox children have explicit pointerEvents:'auto'
        // and remain interactive regardless of the container value.
        pointerEvents: (activeWriterTool === 'richTextBox' || activeWriterTool === 'textCallout') ? 'auto' : 'none',
        zIndex: 12,
        overflow: 'visible',
        cursor: activeWriterTool === 'select' ? 'default' : 'crosshair',
      }}
    >
      <SelectBoxCopyLayer
        pageNumber={pageNumber}
        viewport={viewport}
      />
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
