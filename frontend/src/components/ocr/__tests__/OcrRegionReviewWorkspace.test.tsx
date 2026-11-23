import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { OcrRegion } from '@/core/ocr/ocrRegionModel';
import { OcrRegionReviewWorkspace } from '../workflow/OcrRegionReviewWorkspace';

describe('OcrRegionReviewWorkspace', () => {
  const mockRegions: OcrRegion[] = [
    {
      id: 'reg-1',
      documentFingerprint: 'doc-fp-1',
      pageIndex: 0,
      mode: 'table',
      bbox: { x: 50, y: 50, width: 200, height: 100 },
      createdAt: '2026-11-23T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
    },
  ];

  it('renders guidance banner and region list', () => {
    const handleSelect = vi.fn();

    render(
      <OcrRegionReviewWorkspace
        documentFingerprint="doc-fp-1"
        regions={mockRegions}
        selectedRegionId={null}
        onSelectRegionId={handleSelect}
      />,
    );

    expect(screen.getByTestId('ocr-review-workspace-regions')).toBeTruthy();
    expect(screen.getByTestId('ocr-region-document-guidance')).toBeTruthy();
    expect(screen.getByText('Select OCR Area')).toBeTruthy();

    const regionItem = screen.getByText('table');
    fireEvent.click(regionItem);
    expect(handleSelect).toHaveBeenCalledWith('reg-1');
  });
});
