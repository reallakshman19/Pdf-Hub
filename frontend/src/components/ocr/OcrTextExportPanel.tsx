/*
 * OcrTextExportPanel component.
 *
 * This panel concatenates all OCR results into a single plain text
 * representation.  Users can copy the output or save it using the
 * browser's save dialog.  In preview mode we simply display the
 * aggregated text; no download facility is provided.
 */

import type { JSX } from 'react';
import type { OcrStore } from '../../core/ocr/store';

export interface OcrTextExportPanelProps {
  ocrStore: OcrStore;
}

export default function OcrTextExportPanel({ ocrStore }: OcrTextExportPanelProps): JSX.Element {
  // Build a string containing all OCR text results, sorted by page number.
  const resultsByPage = ocrStore.getResultsByPage();
  const sortedPages = Object.keys(resultsByPage)
    .map((n) => parseInt(n, 10))
    .sort((a, b) => a - b);
  const text = sortedPages
    .map((pageNumber) => {
      const result = resultsByPage[pageNumber];
      const pageHeader = `\n=== Page ${pageNumber} ===\n`;
      const blocksText = result.blocks
        .map((b) => (b.text ? b.text : b.latex ? b.latex : ''))
        .join('\n');
      return pageHeader + blocksText;
    })
    .join('\n');
  return (
    <div className="doccraft-ocr-export">
      <h4>Export OCR Text</h4>
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto' }}>{text}</pre>
    </div>
  );
}