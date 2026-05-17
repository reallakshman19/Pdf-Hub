/*
 * OcrLauncher component.
 *
 * This simple launcher initiates a new OCR job on the selected pages
 * when the user clicks the button.  It accepts an OcrStore instance
 * and a list of page numbers to process.  The component does not
 * allow custom language or region selection – those features could
 * be added later.
 */

import type { JSX } from 'react';
import type { OcrStore } from '../../core/ocr/store';

export interface OcrLauncherProps {
  ocrStore: OcrStore;
  documentKey: string;
  pageNumbers: number[];
  language?: string;
}

export default function OcrLauncher({
  ocrStore,
  documentKey,
  pageNumbers,
  language = 'eng',
}: OcrLauncherProps): JSX.Element {
  const handleClick = () => {
    if (pageNumbers.length === 0) return;
    void ocrStore.startJob(documentKey, pageNumbers, language);
  };
  return (
    <button onClick={handleClick} disabled={pageNumbers.length === 0}>
      Run OCR
    </button>
  );
}