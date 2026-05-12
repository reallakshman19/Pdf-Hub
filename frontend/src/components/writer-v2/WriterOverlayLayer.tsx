import React from 'react';
import type { WriterPageViewport } from '@/core/writer-v2/types';
import { getViewportSize } from '@/core/writer-v2/coordinateTransform';

export interface WriterOverlayLayerProps {
  pageNumber: number;
  viewport: WriterPageViewport;
}

/**
 * Writer Overlay V2 shell.
 *
 * Wave 1 intentionally does not create rich editor objects yet.
 * This layer exists only to freeze the mounting and coordinate contract.
 */
export const WriterOverlayLayer: React.FC<WriterOverlayLayerProps> = ({
  pageNumber,
  viewport,
}) => {
  const size = getViewportSize(viewport);

  return (
    <div
      data-writer-overlay-v2="true"
      data-page-number={pageNumber}
      aria-label={`Writer overlay v2 page ${pageNumber}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: size.width,
        height: size.height,
        pointerEvents: 'none',
        zIndex: 12,
      }}
    />
  );
};

export function isWriterOverlayV2Enabled(): boolean {
  return import.meta.env.VITE_WRITER_OVERLAY_ENGINE === 'v2';
}
