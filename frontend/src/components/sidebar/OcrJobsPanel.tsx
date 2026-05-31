/*
 * OcrJobsPanel component.
 *
 * This sidebar panel presents a simple interface for launching
 * preview OCR jobs and monitoring their progress.  It renders an
 * `OcrLauncher` button to start a job for the selected pages and an
 * `OcrProgress` component that lists current jobs.  Additional
 * controls for language selection or region OCR could be added
 * later.
 */

import type { JSX } from 'react';
import type { OcrStore } from '../../core/ocr/store';
import OcrLauncher from '../ocr/OcrLauncher';
import OcrProgress from '../ocr/OcrProgress';

export interface OcrJobsPanelProps {
  ocrStore: OcrStore;
  documentKey: string;
  selectedPages: number[];
}

export default function OcrJobsPanel({
  ocrStore,
  documentKey,
  selectedPages,
}: OcrJobsPanelProps): JSX.Element {
  return (
    <div className="doccraft-sidebar-panel ocr-jobs-panel">
      <h3>OCR</h3>
      <OcrLauncher
        ocrStore={ocrStore}
        documentKey={documentKey}
        pageNumbers={selectedPages}
      />
      <OcrProgress ocrStore={ocrStore} />
    </div>
  );
}