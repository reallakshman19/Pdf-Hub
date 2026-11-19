import { PDFDocument, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { PageGraph, PageNode } from '@/core/pages/types';
import { executeHeaderFooterTemplateMutation } from './executeMutation';
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
});
