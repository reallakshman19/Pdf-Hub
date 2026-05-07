import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfRendererAdapter } from './PdfRendererAdapter';
import * as pdfjsLib from 'pdfjs-dist';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

describe('PdfRendererAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error accessing private property for test cleanup
    PdfRendererAdapter.cachedDoc = null;
  });

  it('loads document successfully', async () => {
    const mockDoc = { numPages: 2 };
    (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      promise: Promise.resolve(mockDoc)
    });

    const buffer = new ArrayBuffer(8);
    const doc = await PdfRendererAdapter.loadDocument(buffer);
    
    expect(pdfjsLib.getDocument).toHaveBeenCalled();
    expect(doc).toBe(mockDoc);
  });
});
