import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { OcrStore } from '@/core/ocr/store';
import OcrLauncher from '../OcrLauncher';

describe('OcrLauncher retired wrapper', () => {
  it('renders retired launcher notice', () => {
    render(
      <OcrLauncher
        ocrStore={new OcrStore()}
        documentKey="doc-legacy"
        pageNumbers={[1]}
      />,
    );

    expect(screen.getByTestId('legacy-ocr-launcher-retired')).toBeTruthy();
    expect(screen.getByText('Preview OCR retired')).toBeTruthy();
    expect(screen.getByText(/old preview OCR launcher has been retired/i)).toBeTruthy();
  });

  it('keeps retired button disabled', () => {
    render(
      <OcrLauncher
        ocrStore={new OcrStore()}
        documentKey="doc-legacy"
        pageNumbers={[1]}
      />,
    );

    expect(screen.getByTestId('legacy-ocr-launcher-button')).toBeDisabled();
  });

  it('does not create legacy OCR jobs through button path', () => {
    const store = new OcrStore();

    render(
      <OcrLauncher
        ocrStore={store}
        documentKey="doc-legacy"
        pageNumbers={[1]}
      />,
    );

    fireEvent.click(screen.getByTestId('legacy-ocr-launcher-button'));

    expect(store.getJobs()).toHaveLength(0);
  });
});
