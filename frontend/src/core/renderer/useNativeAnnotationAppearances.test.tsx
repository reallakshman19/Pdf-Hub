import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfAnnotation } from '@/core/annotations/types';

vi.mock('pdfjs-dist', () => ({ AnnotationMode: { ENABLE: 1 } }));
import { useNativeAnnotationAppearances } from './useNativeStampAppearances';

const native = (id: string, ref: string, type: PdfAnnotation['type'] = 'callout'): PdfAnnotation => ({
  id, type, pageNumber: 1,
  rect: { x: 10, y: 20, width: 120, height: 30 },
  data: {
    nativeAppearanceImported: true,
    nativeAppearanceRef: ref,
  },
  createdAt: 1, updatedAt: 1,
});

function documentWithImage(imageUrl: string): PDFDocumentProxy {
  const getPage = vi.fn(async () => ({
    getViewport: vi.fn(() => ({ width: 100, height: 120 })),
    getAnnotations: vi.fn(async () => []),
    render: vi.fn((args: { annotationCanvasMap: Map<string, HTMLCanvasElement> }) => {
      const image = document.createElement('canvas');
      image.width = 40;
      image.height = 20;
      image.toDataURL = vi.fn(() => imageUrl);
      args.annotationCanvasMap.set('10R', image);
      return { promise: Promise.resolve() };
    }),
    cleanup: vi.fn(),
  }));
  return { getPage } as unknown as PDFDocumentProxy;
}

describe('PDF.js /AP extraction', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as unknown as
      typeof HTMLCanvasElement.prototype.getContext;
  });

  it('extracts imported FreeText/Line artwork by the native PDF object ID', async () => {
    const pdf = documentWithImage('data:image/png;base64,AAAA');
    const { result, unmount } = renderHook(() =>
      useNativeAnnotationAppearances(pdf, [native('rich-callout', '10R'), native('line', '10R', 'line')]),
    );
    await waitFor(() => expect(result.current['10R']).toBe('data:image/png;base64,AAAA'));
    expect(pdf.getPage).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('never flashes a previous PDF image when another file has the same object number', async () => {
    const previous = documentWithImage('data:image/png;base64,AAAA');
    const next = documentWithImage('data:image/png;base64,BBBB');
    const annotations = [native('foreign-callout', '10R')];
    const { result, rerender, unmount } = renderHook(
      ({ pdf }) => useNativeAnnotationAppearances(pdf, annotations),
      { initialProps: { pdf: previous } },
    );
    await waitFor(() => expect(result.current['10R']).toBe('data:image/png;base64,AAAA'));
    rerender({ pdf: next });
    expect(result.current['10R']).toBeUndefined();
    await waitFor(() => expect(result.current['10R']).toBe('data:image/png;base64,BBBB'));
    unmount();
  });
});
