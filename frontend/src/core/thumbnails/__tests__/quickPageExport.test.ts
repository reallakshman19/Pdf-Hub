import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderPageToBlob, copyPageImageToClipboard, downloadPageAsPng } from '../quickPageExport';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

describe('quickPageExport', () => {
  const originalCreateElement = document.createElement.bind(document);

  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 400, height: 600 }),
  } as unknown as PDFPageProxy;

  const mockDoc = {
    getPage: vi.fn().mockResolvedValue(mockPage),
  } as unknown as PDFDocumentProxy;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(PdfRendererAdapter, 'renderPage').mockReturnValue({
      completed: Promise.resolve(),
      cancel: vi.fn(),
    });

    // Mock HTMLCanvasElement.prototype.toBlob
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['fake-png-bytes'], { type: 'image/png' }));
    });
  });

  it('renders page to image Blob', async () => {
    const blob = await renderPageToBlob(mockDoc, 1, 2.0);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(mockDoc.getPage).toHaveBeenCalledWith(1);
    expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 2.0 });
  });

  it('copies page image to clipboard when ClipboardItem is supported', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: writeMock },
      configurable: true,
    });
    class MockClipboardItem {
      data: Record<string, unknown>;
      constructor(data: Record<string, unknown>) {
        this.data = data;
      }
    }
    (globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = MockClipboardItem;

    const result = await copyPageImageToClipboard(mockDoc, 2);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Page 2 copied to clipboard');
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it('returns error result when clipboard is unavailable and fallbackToDownload is false', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });

    const result = await copyPageImageToClipboard(mockDoc, 1, 2.0, false);
    expect(result.success).toBe(false);
    expect(result.message).toContain('System clipboard is unavailable');
  });

  it('falls back to downloading PNG when clipboard write is unavailable and fallbackToDownload is true', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        const a = originalCreateElement('a');
        a.click = clickMock;
        return a;
      }
      return originalCreateElement(tag);
    });

    const result = await copyPageImageToClipboard(mockDoc, 1, 2.0, true, 'report.pdf');
    expect(result.success).toBe(true);
    expect(result.message).toContain('downloaded Page 1 as PNG');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  it('triggers download for page PNG', async () => {
    const clickMock = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        const a = originalCreateElement('a');
        a.click = clickMock;
        return a;
      }
      return originalCreateElement(tag);
    });

    const createUrlMock = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeUrlMock = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await downloadPageAsPng(mockDoc, 3, 'sample-report.pdf');

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(createUrlMock).toHaveBeenCalledTimes(1);
    expect(revokeUrlMock).toHaveBeenCalledWith('blob:mock-url');
  });
});
