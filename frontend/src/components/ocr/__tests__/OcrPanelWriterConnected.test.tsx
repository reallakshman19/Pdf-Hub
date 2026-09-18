import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useSessionStore } from '@/core/session/store';
import { OcrPanelWriterConnected } from '../OcrPanelWriterConnected';

vi.mock('pdfjs-dist', () => {
  return {
    GlobalWorkerOptions: {
      workerSrc: '',
    },
    getDocument: vi.fn().mockImplementation(() => {
      return {
        promise: Promise.resolve({
          numPages: 3,
          async getPage(pageNumber: number) {
            return {
              pageNumber,
              getViewport({ scale = 1 }: { scale?: number } = {}) {
                return {
                  width: 595 * scale,
                  height: 842 * scale,
                };
              },
              render() {
                return {
                  promise: Promise.resolve(),
                  cancel: () => undefined,
                };
              },
            };
          },
          async destroy() {},
        }),
      };
    }),
  };
});

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === '2d') {
      return {
        drawImage: () => undefined,
        fillRect: () => undefined,
        clearRect: () => undefined,
        getImageData: () => ({
          data: new Uint8ClampedArray([0, 0, 0, 0]),
          width: 1,
          height: 1,
        }),
        putImageData: () => undefined,
        scale: () => undefined,
        translate: () => undefined,
        rotate: () => undefined,
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
    callback(new Blob());
  };
}

describe('OcrPanelWriterConnected', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'writer-connected-doc',
      elements: [],
      assetRecords: [],
      persistedAt: null,
    });
  });

  const pageInput = {
    pageIndex: 0,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
    imageCount: 1,
  };

  const revealConnectedRegionTools = async () => {
    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-document-guidance')).toBeTruthy();
    });
  };

  const addAndSelectRegion = async (documentFingerprint: string) => {
    useOcrStore.getState().addOcrRegion({
      id: `region-${documentFingerprint}`,
      documentFingerprint,
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 72,
        y: 100,
        width: 180,
        height: 60,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-select')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('ocr-region-select'));
  };

  it('renders connected OCR panel', () => {
    render(
      <OcrPanelWriterConnected
        documentFingerprint="writer-connected-doc"
        selectedPageIndexes={[0]}
      />,
    );

    expect(screen.getByTestId('ocr-panel-writer-connected')).toBeTruthy();
    expect(screen.getByTestId('ocr-panel')).toBeTruthy();
    expect(screen.queryByTestId('ocr-demo-fixtures')).toBeNull();
    expect(screen.queryByTestId('ocr-advanced-panel')).toBeNull();
  });

  it('keeps the browser workflow compact and non-nested', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'browser-smoke-doc',
      fileName: 'browser-smoke.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 3,
    });
    useSessionStore.getState().setSelectedPages([1]);

    render(<OcrPanelWriterConnected />);

    expect(screen.queryByTestId('ocr-unified-panel')).toBeNull();
    expect(screen.getByRole('button', { name: /run ocr/i })).toBeTruthy();
    expect(screen.getAllByTestId('ocr-run-section')).toHaveLength(1);
    expect(screen.getAllByTestId('ocr-review-section')).toHaveLength(1);

    const runSection = screen.getByTestId('ocr-run-section');
    const sourceSection = screen.getByTestId('ocr-connected-source');

    expect(runSection.compareDocumentPosition(sourceSection)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const summary = screen.getByTestId('ocr-unified-summary');
    expect(within(summary).getByText('browser-smoke.pdf')).toBeTruthy();
    expect(within(summary).getByText('working')).toBeTruthy();
  });

  it('inserts OCR region Writer element into Writer V2 store', async () => {
    render(
      <OcrPanelWriterConnected
        documentFingerprint="writer-connected-doc"
        selectedPageIndexes={[0]}
        pages={[pageInput]}
      />,
    );

    await revealConnectedRegionTools();
    await addAndSelectRegion('writer-connected-doc');

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
    fireEvent.click(screen.getByTestId('ocr-writer-insert-button'));

    await waitFor(() => {
      expect(useWriterV2Store.getState().elements).toHaveLength(1);
    });

    const writerState = useWriterV2Store.getState();

    expect(writerState.elements[0].type).toBe('richTextBox');
    expect(writerState.elements[0].documentFingerprint).toBe('writer-connected-doc');
    expect(writerState.elements[0].plainText).toContain('This scan contains');
    expect(writerState.selectedIds).toEqual([writerState.elements[0].id]);
    expect(screen.getByTestId('ocr-writer-connected-summary')).toBeTruthy();
    expect(screen.getByText(/Inserted 1 Writer element/)).toBeTruthy();
  });

  it('uses writer store current document fingerprint when prop is omitted', async () => {
    render(
      <OcrPanelWriterConnected selectedPageIndexes={[0]} pages={[pageInput]} />,
    );

    await revealConnectedRegionTools();
    await addAndSelectRegion('writer-connected-doc');

    fireEvent.click(screen.getByTestId('ocr-region-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ocr-region-result-preview')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('ocr-region-convert'));
    fireEvent.click(screen.getByTestId('ocr-writer-insert-button'));

    await waitFor(() => {
      expect(useWriterV2Store.getState().elements).toHaveLength(1);
    });

    expect(useWriterV2Store.getState().elements[0].documentFingerprint).toBe('writer-connected-doc');
  });

  it('reads active working PDF bytes and selected pages from session store', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'session-doc',
      fileName: 'session.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 4,
    });

    useSessionStore.getState().replaceWorkingCopy(
      new Uint8Array([9, 9, 9, 9]),
      4,
    );

    useSessionStore.getState().setSelectedPages([2, 4]);

    render(
      <OcrPanelWriterConnected />,
    );

    const unifiedSummary = screen.getByTestId('ocr-unified-summary');

    expect(unifiedSummary).toBeTruthy();
    expect(within(unifiedSummary).getByText('session.pdf')).toBeTruthy();
    expect(within(unifiedSummary).getByText('working')).toBeTruthy();
    expect(within(unifiedSummary).getByText('4')).toBeTruthy();
    expect(within(unifiedSummary).getByText('2')).toBeTruthy();
  });

  it('passes session document fingerprint when no explicit prop is supplied', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'session-doc',
      fileName: 'session.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 2,
    });

    render(
      <OcrPanelWriterConnected />,
    );

    const unifiedSummary = screen.getByTestId('ocr-unified-summary');

    expect(unifiedSummary).toBeTruthy();
    expect(within(unifiedSummary).getByText('session.pdf')).toBeTruthy();
    expect(within(unifiedSummary).getByText('working')).toBeTruthy();
  });

  it('shows warning when PDF bytes are missing', () => {
    useSessionStore.getState().clearDocument();

    render(
      <OcrPanelWriterConnected />,
    );

    const warning = screen.getByTestId('ocr-pdf-source-warning');

    expect(warning).toBeTruthy();
    expect(within(warning).getByText(/No active PDF document is loaded/)).toBeTruthy();
  });

  it('uses 0-based selected page indexes when running OCR fallback path', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'session-doc',
      fileName: 'session.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 3,
    });

    useSessionStore.getState().setSelectedPages([2]);

    render(
      <OcrPanelWriterConnected />,
    );

    fireEvent.click(screen.getByTestId('run-ocr-button'));

    await waitFor(() => {
      expect(useOcrStore.getState().jobs[0]?.status).toBe('completed');
    });

    const result = useOcrStore.getState().correctedResult;

    expect(result?.documentFingerprint).toBe('session-doc');
    expect(result?.pages).toHaveLength(1);
    expect(result?.pages[0].pageIndex).toBe(1);
  });
});
