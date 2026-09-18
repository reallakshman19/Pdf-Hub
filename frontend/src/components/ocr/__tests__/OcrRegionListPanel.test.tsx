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
import type { OcrRegion } from '@/core/ocr/ocrRegionModel';
import { OcrRegionListPanel } from '../OcrRegionListPanel';

describe('OcrRegionListPanel', () => {
  it('renders empty state', () => {
    render(
      <OcrRegionListPanel regions={[]} />,
    );

    expect(screen.getByTestId('ocr-region-list-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-region-empty')).toBeTruthy();
    expect(screen.getByTestId('ocr-region-count').textContent).toBe('0');
  });

  it('renders regions', () => {
    render(
      <OcrRegionListPanel regions={makeRegions()} />,
    );

    expect(screen.getAllByTestId('ocr-region-row')).toHaveLength(2);
    expect(screen.getByTestId('ocr-region-count').textContent).toBe('2');
    expect(screen.getByText('text')).toBeTruthy();
    expect(screen.getByText('table')).toBeTruthy();
    expect(screen.getAllByText('Selected area on document')).toHaveLength(2);
    expect(screen.queryByText(/x 10/i)).toBeNull();
  });

  it('selects region', () => {
    let selectedId: string | null = null;

    render(
      <OcrRegionListPanel
        regions={makeRegions()}
        onSelectRegion={(region) => {
          selectedId = region.id;
        }}
      />,
    );

    fireEvent.click(screen.getAllByTestId('ocr-region-select')[0]);

    expect(selectedId).toBe('region-1');
  });

  it('deletes region', () => {
    let deletedId: string | null = null;

    render(
      <OcrRegionListPanel
        regions={makeRegions()}
        onDeleteRegion={(regionId) => {
          deletedId = regionId;
        }}
      />,
    );

    fireEvent.click(screen.getAllByTestId('ocr-region-delete')[1]);

    expect(deletedId).toBe('region-2');
  });
});

function makeRegions(): OcrRegion[] {
  return [
    {
      id: 'region-1',
      documentFingerprint: 'doc-region-list',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 10,
        y: 20,
        width: 100,
        height: 40,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'region-2',
      documentFingerprint: 'doc-region-list',
      pageIndex: 1,
      mode: 'table',
      bbox: {
        x: 30,
        y: 50,
        width: 200,
        height: 80,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}
