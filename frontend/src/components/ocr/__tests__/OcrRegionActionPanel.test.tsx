import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { createOcrRegion } from '@/core/ocr/ocrRegionModel';
import { OcrRegionActionPanel } from '../OcrRegionActionPanel';

describe('OcrRegionActionPanel', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
  });

  it('renders empty state when no region selected', () => {
    render(
      <OcrRegionActionPanel
        region={null}
        pageInput={null}
      />,
    );

    expect(screen.getByTestId('ocr-region-action-empty')).toBeTruthy();
  });

  it('runs region OCR and shows result preview', async () => {
    render(
      <OcrRegionActionPanel
        region={makeTextRegion()}
        pageInput={{
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    expect(screen.getByText(/Region OCR completed/)).toBeTruthy();
    expect(screen.getByText(/Writer OCR Demo/)).toBeTruthy();
  });

  it('converts region OCR result to Writer richTextBox', async () => {
    let created: WriterElementV2 | null = null;

    render(
      <OcrRegionActionPanel
        region={makeTextRegion()}
        pageInput={{
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        }}
        onWriterElementCreated={(element) => {
          created = element;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId('ocr-region-output-mode'), {
      target: {
        value: 'richTextBox',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-region-convert'));

    expect(created).not.toBeNull();
    const element = created as unknown as WriterElementV2;
    expect(element.type).toBe('richTextBox');
    expect(element.plainText).toContain('Writer OCR Demo');
    expect(screen.getByText('Created Writer element: richTextBox.')).toBeTruthy();
  });

  it('converts table region OCR result to Writer tableBox', async () => {
    let created: WriterElementV2 | null = null;

    useOcrStore.getState().setOcrProfileId('table-heavy');

    render(
      <OcrRegionActionPanel
        region={makeTableRegion()}
        pageInput={{
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        }}
        onWriterElementCreated={(element) => {
          created = element;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    expect(screen.getByTestId('ocr-region-output-mode')).toHaveValue('tableBox');

    fireEvent.click(screen.getByTestId('ocr-region-convert'));

    expect(created).not.toBeNull();
    const element = created as unknown as WriterElementV2;
    expect(element.type).toBe('tableBox');
    expect(element.tableData?.columns).toHaveLength(2);
  });

  it('shows message when no page input is available', () => {
    render(
      <OcrRegionActionPanel
        region={makeTextRegion()}
        pageInput={null}
      />,
    );

    expect(screen.getByTestId('ocr-region-run')).toBeDisabled();
  });

  it('uses async page input resolver when supplied', async () => {
    let resolverCalled = false;

    render(
      <OcrRegionActionPanel
        region={makeTextRegion()}
        pageInput={null}
        resolvePageInput={async (region) => {
          resolverCalled = true;

          return {
            pageInput: {
              pageIndex: region.pageIndex,
              imageBytes: new Uint8Array([1, 2, 3]),
              width: 595,
              height: 842,
              region: region.bbox,
            },
            diagnostics: [
              {
                level: 'info',
                code: 'OCR_REGION_RASTERIZED',
                pageIndex: region.pageIndex,
                message: 'Synthetic async region rasterization completed.',
              },
            ],
          };
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    expect(resolverCalled).toBe(true);
    expect(screen.getByTestId('ocr-region-input-diagnostics')).toBeTruthy();
    expect(screen.getByText(/Synthetic async region rasterization completed/)).toBeTruthy();
  });
});

function makeTextRegion() {
  return createOcrRegion({
    id: 'region-text-action',
    documentFingerprint: 'doc-region-action',
    pageIndex: 0,
    mode: 'text',
    bbox: {
      x: 60,
      y: 620,
      width: 420,
      height: 180,
    },
    now: '2026-01-01T00:00:00.000Z',
  });
}

function makeTableRegion() {
  return createOcrRegion({
    id: 'region-table-action',
    documentFingerprint: 'doc-region-action',
    pageIndex: 0,
    mode: 'table',
    bbox: {
      x: 60,
      y: 460,
      width: 420,
      height: 220,
    },
    now: '2026-01-01T00:00:00.000Z',
  });
}
