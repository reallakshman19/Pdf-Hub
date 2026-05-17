/*
 * OcrResultOverlay component.
 *
 * This overlay draws the OCR text blocks on top of the PDF page.
 * Because this implementation runs entirely in the browser, it
 * simply positions each text block using absolute positioning and
 * displays the recognized text.  For production use you might
 * integrate a canvas overlay or highlight bounding boxes with
 * transparency.
 */

import React from 'react';
import type { OcrStore } from '../../core/ocr/store';
import type { OcrBlock } from '../../core/ocr/types';

export interface OcrResultOverlayProps {
  ocrStore: OcrStore;
  pageNumber: number;
  scale: number;
}

export default function OcrResultOverlay({
  ocrStore,
  pageNumber,
  scale,
}: OcrResultOverlayProps): JSX.Element | null {
  const results = ocrStore.getResultsByPage()[pageNumber];
  if (!results || results.blocks.length === 0) return null;
  return (
    <div className="doccraft-ocr-overlay" style={{ position: 'absolute', inset: 0 }}>
      {results.blocks.map((block: OcrBlock) => {
        const { rect, text } = block;
        const style: React.CSSProperties = {
          position: 'absolute',
          left: rect.x * scale,
          top: rect.y * scale,
          width: rect.width * scale,
          height: rect.height * scale,
          pointerEvents: 'none',
          color: 'red',
          fontSize: 10 * scale,
        };
        return (
          <span key={block.id} style={style}>
            {text}
          </span>
        );
      })}
    </div>
  );
}