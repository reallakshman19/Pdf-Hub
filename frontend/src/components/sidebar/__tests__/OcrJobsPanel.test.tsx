import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  render,
  screen,
} from '@testing-library/react';
import { OcrStore } from '@/core/ocr/store';
import OcrJobsPanel from '../OcrJobsPanel';

describe('OcrJobsPanel retired wrapper', () => {
  it('renders legacy retirement notice', () => {
    render(
      <OcrJobsPanel
        ocrStore={new OcrStore()}
        documentKey="doc-legacy"
        selectedPages={[2, 1, 1]}
      />,
    );

    expect(screen.getByTestId('legacy-ocr-jobs-panel-retired')).toBeTruthy();
    expect(screen.getByTestId('legacy-ocr-retirement-notice')).toBeTruthy();
    expect(screen.getByText('Preview OCR retired')).toBeTruthy();
    expect(screen.getByText(/Replacement: OcrPanelWriterConnected/)).toBeTruthy();
    expect(screen.getByText(/selected pages: 2/)).toBeTruthy();
  });

  it('shows legacy progress empty state', () => {
    render(
      <OcrJobsPanel
        ocrStore={new OcrStore()}
        documentKey="doc-legacy"
        selectedPages={[]}
      />,
    );

    expect(screen.getByTestId('legacy-ocr-progress')).toBeTruthy();
    expect(screen.getByText('No legacy OCR jobs')).toBeTruthy();
  });
});
