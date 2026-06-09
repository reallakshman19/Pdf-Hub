import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { OcrUnifiedPanel } from '../OcrUnifiedPanel';

describe('OcrUnifiedPanel', () => {
  it('renders unified OCR shell', () => {
    render(
      <OcrUnifiedPanel
        source={<div>Source content</div>}
        run={<div>Run content</div>}
      />,
    );

    expect(screen.getByTestId('ocr-unified-panel')).toBeTruthy();
    expect(screen.getByText('OCR Assistant')).toBeTruthy();
    expect(screen.getByTestId('ocr-quick-start-steps')).toBeTruthy();
    expect(screen.getByText('PDF source')).toBeTruthy();
    expect(screen.getByText('Run OCR')).toBeTruthy();
    expect(screen.getByText('Source content')).toBeTruthy();
    expect(screen.getByText('Run content')).toBeTruthy();
  });

  it('renders summary tiles', () => {
    render(
      <OcrUnifiedPanel
        source={<div>Source content</div>}
        sourceSummary={[
          {
            label: 'PDF',
            value: 'working',
            tone: 'success',
          },
          {
            label: 'Pages',
            value: 4,
          },
        ]}
      />,
    );

    const summary = screen.getByTestId('ocr-unified-summary');

    expect(summary).toBeTruthy();
    expect(screen.getAllByTestId('ocr-unified-status-tile')).toHaveLength(2);
    expect(within(summary).getByText('working')).toBeTruthy();
    expect(within(summary).getByText('4')).toBeTruthy();
  });

  it('collapses and expands sections', () => {
    render(
      <OcrUnifiedPanel
        source={<div>Source content</div>}
        defaultOpenSections={['source']}
      />,
    );

    expect(screen.getByText('Source content')).toBeTruthy();

    fireEvent.click(screen.getByTestId('ocr-unified-section-toggle-source'));

    expect(screen.queryByText('Source content')).toBeNull();

    fireEvent.click(screen.getByTestId('ocr-unified-section-toggle-source'));

    expect(screen.getByText('Source content')).toBeTruthy();
  });

  it('does not render empty sections', () => {
    render(
      <OcrUnifiedPanel
        source={<div>Source content</div>}
      />,
    );

    expect(screen.getByTestId('ocr-unified-section-source')).toBeTruthy();
    expect(screen.queryByTestId('ocr-unified-section-export')).toBeNull();
  });

  it('uses custom title and subtitle', () => {
    render(
      <OcrUnifiedPanel
        title="Custom OCR"
        subtitle="Custom subtitle"
        source={<div>Source content</div>}
      />,
    );

    expect(screen.getByText('Custom OCR')).toBeTruthy();
    expect(screen.getByText('Custom subtitle')).toBeTruthy();
  });

  it('can host a single composed OCR panel under Run section', () => {
    render(
      <OcrUnifiedPanel
        source={<div>Source content</div>}
        run={<div data-testid="single-ocr-panel">Single OCR panel</div>}
        diagnostics={<div>Diagnostics content</div>}
      />,
    );

    expect(screen.getByTestId('single-ocr-panel')).toBeTruthy();
    expect(screen.getByText('Single OCR panel')).toBeTruthy();
  });
});
