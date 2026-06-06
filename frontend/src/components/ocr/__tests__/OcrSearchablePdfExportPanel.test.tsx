import {
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
import {
  PDFDocument,
} from 'pdf-lib';
import { getOcrProfile } from '@/core/ocr/ocrProfiles';
import { mockOcrEngine } from '@/core/ocr/engines/mockOcrEngine';
import type { OcrSearchablePdfExportResult } from '@/core/ocr/ocrSearchablePdfExport';
import { OcrSearchablePdfExportPanel } from '../OcrSearchablePdfExportPanel';

describe('OcrSearchablePdfExportPanel', () => {
  it('renders searchable PDF export panel', () => {
    render(
      <OcrSearchablePdfExportPanel
        pdfBytes={null}
        ocrResult={null}
      />,
    );

    expect(screen.getByTestId('ocr-searchable-pdf-export-panel')).toBeTruthy();
    expect(screen.getByText('Searchable OCR PDF')).toBeTruthy();
    expect(screen.getByTestId('ocr-searchable-pdf-export-button')).toBeDisabled();
  });

  it('exports searchable PDF when inputs exist', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();
    let exported: OcrSearchablePdfExportResult | null = null;

    render(
      <OcrSearchablePdfExportPanel
        pdfBytes={pdfBytes}
        ocrResult={ocrResult}
        onExported={(result) => {
          exported = result;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-searchable-pdf-export-button'));

    await waitFor(() => {
      expect(exported).not.toBeNull();
    });

    const result = exported as unknown as OcrSearchablePdfExportResult;
    expect(result.embeddedTextItemCount).toBeGreaterThan(0);
    expect(screen.getByTestId('ocr-searchable-pdf-message')).toBeTruthy();
    expect(screen.getByText(/Searchable PDF created/)).toBeTruthy();
  });

  it('supports line layer and confidence threshold settings', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();
    let exported: OcrSearchablePdfExportResult | null = null;

    render(
      <OcrSearchablePdfExportPanel
        pdfBytes={pdfBytes}
        ocrResult={ocrResult}
        onExported={(result) => {
          exported = result;
        }}
      />,
    );

    fireEvent.change(screen.getByTestId('ocr-searchable-layer-mode'), {
      target: {
        value: 'line',
      },
    });

    fireEvent.change(screen.getByTestId('ocr-searchable-min-confidence'), {
      target: {
        value: '0.7',
      },
    });

    fireEvent.click(screen.getByTestId('ocr-searchable-pdf-export-button'));

    await waitFor(() => {
      expect(exported).not.toBeNull();
    });

    const result = exported as unknown as OcrSearchablePdfExportResult;
    const page = ocrResult.pages[0]!;
    expect(result.embeddedTextItemCount).toBe(page.lines!.length - 1);
  });

  it('supports debug visible mode', async () => {
    const pdfBytes = await createBlankPdfBytes();
    const ocrResult = await createMockOcrResult();
    let exported: OcrSearchablePdfExportResult | null = null;

    render(
      <OcrSearchablePdfExportPanel
        pdfBytes={pdfBytes}
        ocrResult={ocrResult}
        onExported={(result) => {
          exported = result;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-searchable-debug-visible'));
    fireEvent.click(screen.getByTestId('ocr-searchable-pdf-export-button'));

    await waitFor(() => {
      expect(exported).not.toBeNull();
    });

    const result = exported as unknown as OcrSearchablePdfExportResult;
    expect(result.bytes.length).toBeGreaterThan(pdfBytes.length);
  });
});

async function createBlankPdfBytes(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);

  return pdf.save({
    useObjectStreams: false,
  });
}

async function createMockOcrResult() {
  return mockOcrEngine.recognize({
    documentFingerprint: 'doc-searchable-pdf-panel',
    profile: getOcrProfile('clean-scan'),
    pages: [
      {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
    ],
  });
}
