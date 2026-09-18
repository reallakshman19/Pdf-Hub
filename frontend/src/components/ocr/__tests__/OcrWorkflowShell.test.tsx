import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  render,
  screen,
  within,
} from '@testing-library/react';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { OcrPanelWriterConnected } from '../OcrPanelWriterConnected';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn().mockImplementation(() => ({
    promise: Promise.resolve({
      numPages: 2,
      async getPage(pageNumber: number) {
        return {
          pageNumber,
          getViewport({ scale = 1 }: { scale?: number } = {}) {
            return { width: 595 * scale, height: 842 * scale };
          },
          render() {
            return { promise: Promise.resolve(), cancel: () => undefined };
          },
          async cleanup() {},
        };
      },
      async destroy() {},
    }),
  })),
}));

describe('OCR professional workflow shell', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
    useSessionStore.getState().clearDocument();
    useWriterV2Store.getState().clearWriterV2();
  });

  it('renders one assistant shell with compact source identity and collapsed advanced area', () => {
    useSessionStore.getState().openDocument({
      documentKey: 'ocr-shell-doc',
      fileName: 'ocr-shell.pdf',
      bytes: new Uint8Array([1, 2, 3, 4]),
      pageCount: 2,
    });
    useSessionStore.getState().setSelectedPages([1]);

    render(<OcrPanelWriterConnected />);

    expect(screen.getAllByTestId('ocr-assistant-shell')).toHaveLength(1);
    expect(screen.getByTestId('ocr-header-summary')).toBeTruthy();
    expect(screen.getByRole('button', { name: /run ocr/i })).toBeTruthy();

    const summary = screen.getByTestId('ocr-unified-summary');
    expect(within(summary).getByText('ocr-shell.pdf')).toBeTruthy();
    expect(within(summary).getByText('working')).toBeTruthy();
    expect(within(summary).getByText('2')).toBeTruthy();
    expect(within(summary).getByText('1')).toBeTruthy();

    const source = screen.getByTestId('ocr-source-panel') as HTMLDetailsElement;

    expect(source.open).toBe(false);
    expect(screen.queryByTestId('ocr-advanced-panel')).toBeNull();
    expect(screen.queryByTestId('ocr-unified-panel')).toBeNull();
  });

  it('shows ready header when pdfBytes are supplied without a session document', () => {
    render(
      <OcrPanelWriterConnected
        documentFingerprint="prop-doc"
        pdfBytes={new Uint8Array([1, 2, 3])}
        pageCount={2}
        selectedPageIndexes={[0]}
      />,
    );

    const summary = screen.getByTestId('ocr-unified-summary');

    expect(screen.getByText(/Ready for OCR/i)).toBeTruthy();
    expect(within(summary).getByText('direct input')).toBeTruthy();
    expect(screen.queryByTestId('ocr-pdf-source-warning')).toBeNull();
  });

  it('keeps demo fixtures out of the production OCR shell', () => {
    render(<OcrPanelWriterConnected />);

    expect(screen.getByTestId('ocr-pdf-source-warning')).toBeTruthy();
    expect(screen.queryByTestId('ocr-demo-fixtures')).toBeNull();
    expect(screen.queryByTestId('ocr-demo-fixture-load')).toBeNull();
    expect(screen.queryByTestId('ocr-advanced-panel')).toBeNull();
  });
});
