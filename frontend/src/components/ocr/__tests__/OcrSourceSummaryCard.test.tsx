import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  render,
  screen,
} from '@testing-library/react';
import { OcrSourceSummaryCard } from '../OcrSourceSummaryCard';

describe('OcrSourceSummaryCard', () => {
  it('renders source summary with working bytes', () => {
    render(
      <OcrSourceSummaryCard
        fileName="demo.pdf"
        documentFingerprint="doc-demo"
        hasPdfBytes
        bytesSource="working"
        pageCount={4}
        selectedPageCount={2}
      />,
    );

    expect(screen.getByTestId('ocr-source-summary-card')).toBeTruthy();
    expect(screen.getByText('demo.pdf')).toBeTruthy();
    expect(screen.getByText('working')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows missing bytes state', () => {
    render(
      <OcrSourceSummaryCard
        documentFingerprint="doc-demo"
        hasPdfBytes={false}
        bytesSource="none"
        pageCount={1}
        selectedPageCount={0}
      />,
    );

    expect(screen.getByText('missing')).toBeTruthy();
    expect(screen.getByText('all')).toBeTruthy();
  });

  it('falls back to document fingerprint', () => {
    render(
      <OcrSourceSummaryCard
        documentFingerprint="doc-fallback"
        hasPdfBytes
        bytesSource="original"
        pageCount={1}
        selectedPageCount={0}
      />,
    );

    expect(screen.getByText('doc-fallback')).toBeTruthy();
  });
});
