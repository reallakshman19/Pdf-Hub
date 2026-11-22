import { PDFDocument, degrees } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import type { PageGraph, PageNode } from '@/core/pages/types';
import { executeHeaderFooterTemplateMutation } from './executeMutation';
import { renderHeaderFooterNativePreview } from './nativePreview';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { HeaderFooterTemplate } from './types';

function graph(): PageGraph<PageNode> {
  return {
    pages: [0, 90].map((rotation, index) => ({
      pageId: `p${index + 1}`, documentKey: 'source',
      originalPageNumber: index + 1, currentIndex: index,
      width: 595, height: 842, rotation: rotation as 0 | 90,
    })),
  };
}

describe('native preview and Apply parity', () => {
  it('stamps a selected rotated page on copied bytes without changing the source', async () => {
    const document = await PDFDocument.create();
    document.addPage([595, 842]);
    document.addPage([595, 842]).setRotation(degrees(90));
    const source = await document.save();
    const template: HeaderFooterTemplate = {
      schemaVersion: 1,
      layout: {
        leftMarginPt: 36, rightMarginPt: 36,
        headerOffsetFromTopPt: 24, footerOffsetFromBottomPt: 24,
      },
      defaultTextStyle: {
        fontFamily: 'Helvetica', fontSizePt: 10,
        fontWeight: 'normal', fontStyle: 'normal',
        color: '#222222', opacity: 1,
      },
      rules: [{
        id: 'selected', selector: { include: { mode: 'pageIds', pageIds: ['p2'] } },
        footer: {
          right: { kind: 'text', template: '{{physicalPage}} of {{pageCount}}' },
        },
      }],
    };
    const result = await executeHeaderFooterTemplateMutation(
      Uint8Array.from(source), graph(), template,
      { fileName: 'source.pdf', now: new Date('2026-11-19T00:00:00Z') },
      undefined,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = await PDFDocument.load(result.bytes);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getRotation().angle).toBe(0);
    expect(output.getPage(1).getRotation().angle).toBe(90);
    expect((await PDFDocument.load(source)).getPageCount()).toBe(2);
    expect(source).toEqual(await document.save());
  });

  it('renders the chosen native page with the application PDF renderer and releases its lease', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    pdf.addPage([595, 842]).setRotation(degrees(90));
    const source = await pdf.save();
    const release = vi.fn(async () => undefined);
    const getPage = vi.fn(async (_number: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 842 * scale, height: 595 * scale,
      }),
    }));
    const acquire = vi.spyOn(PdfRendererAdapter, 'acquireDocument').mockResolvedValue({
      doc: { getPage },
      release,
      cacheKey: 'native-preview-test',
    } as unknown as Awaited<ReturnType<typeof PdfRendererAdapter.acquireDocument>>);
    const render = vi.spyOn(PdfRendererAdapter, 'renderPage').mockReturnValue({
      completed: Promise.resolve(),
      cancel: async () => undefined,
    });
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,NATIVE');
    const template: HeaderFooterTemplate = {
      schemaVersion: 1,
      layout: {
        leftMarginPt: 36, rightMarginPt: 36,
        headerOffsetFromTopPt: 24, footerOffsetFromBottomPt: 24,
      },
      defaultTextStyle: {
        fontFamily: 'Helvetica', fontSizePt: 10,
        fontWeight: 'normal', fontStyle: 'normal', color: '#222222', opacity: 1,
      },
      rules: [{
        id: 'selected', selector: { include: { mode: 'pageIds', pageIds: ['p2'] } },
        footer: { right: { kind: 'text', template: 'Page {{physicalPage}}' } },
      }],
    };
    try {
      const output = await renderHeaderFooterNativePreview({
        baseBytes: source,
        pageGraph: graph(),
        template,
        context: { fileName: 'source.pdf', now: new Date('2026-11-19T00:00:00Z') },
        physicalPageNumber: 2,
      });
      expect(output.dataUrl).toBe('data:image/png;base64,NATIVE');
      expect(acquire).toHaveBeenCalledOnce();
      expect(getPage).toHaveBeenCalledWith(2);
      expect(render).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      expect(source).toEqual(await pdf.save());
    } finally {
      canvas.mockRestore();
      render.mockRestore();
      acquire.mockRestore();
    }
  });

});
