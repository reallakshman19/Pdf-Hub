import { describe, expect, it, vi } from 'vitest';
import { OperationCancelledError } from '@/core/cancellation/operationCancellation';

import type { PageGraph, PageNode } from '@/core/pages/types';
import type { HeaderFooterTemplate } from './types';
import type { HeaderFooterPdfWriter } from './pdfWriter';
import {
  executeHeaderFooterTemplateMutation,
  prepareHeaderFooterTemplateMutation,
} from './executeMutation';

function graph(): PageGraph<PageNode> {
  return {
    pages: [
      {
        pageId: 'p1',
        documentKey: 'doc',
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0,
        logicalLabel: '1',
      },
    ],
    pageLabelRanges: [
      { startPageId: 'p1', style: 'decimal' },
    ],
  };
}

function template(content: 'text' | 'image'): HeaderFooterTemplate {
  return {
    schemaVersion: 1,
    layout: {
      leftMarginPt: 36,
      rightMarginPt: 36,
      headerOffsetFromTopPt: 24,
      footerOffsetFromBottomPt: 24,
    },
    defaultTextStyle: {
      fontFamily: 'Helvetica',
      fontSizePt: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#202020',
      opacity: 1,
    },
    rules: [
      {
        id: 'rule',
        selector: { include: { mode: 'all' } },
        footer: {
          right:
            content === 'text'
              ? {
                  kind: 'text',
                  template: '{{physicalPage}}',
                }
              : {
                  kind: 'image',
                  binaryResourceId: 'logo',
                  widthPt: 20,
                },
        },
      },
    ],
  };
}

describe('executeHeaderFooterTemplateMutation', () => {
  it('passes a resolved plan and resources to the writer', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const output = new Uint8Array([4, 5, 6]);
    const writer: HeaderFooterPdfWriter = {
      write: vi.fn(async (input) => {
        expect(input.pages).toHaveLength(1);
        expect(input.pages[0]?.footer?.right).toMatchObject({
          kind: 'text',
          text: '1',
        });
        return { bytes: output, warnings: ['writer warning'] };
      }),
    };

    const result = await executeHeaderFooterTemplateMutation(
      bytes,
      graph(),
      template('text'),
      {
        fileName: 'test.pdf',
        now: new Date('2026-09-19T00:00:00Z'),
      },
      undefined,
      undefined,
      writer,
    );

    expect(result).toEqual({
      ok: true,
      mutated: true,
      bytes: output,
      warnings: ['writer warning'],
    });
  });

  it('fails before the writer when an image resource is missing', async () => {
    const writer: HeaderFooterPdfWriter = {
      write: vi.fn(),
    };

    const result = await executeHeaderFooterTemplateMutation(
      new Uint8Array([1]),
      graph(),
      template('image'),
      {
        fileName: 'test.pdf',
        now: new Date('2026-09-19T00:00:00Z'),
      },
      undefined,
      undefined,
      writer,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('RESOURCE_MISSING');
    expect(result.errors.join('\n')).toMatch(/logo/);
    expect(writer.write).not.toHaveBeenCalled();
  });

  it('returns an unchanged no-op without calling the writer', async () => {
    const value = template('text');
    value.rules[0]!.selector = {
      include: { mode: 'pageIds', pageIds: ['p1'] },
      excludeFirstPhysicalPage: true,
    };
    const bytes = new Uint8Array([1, 2, 3]);
    const writer: HeaderFooterPdfWriter = {
      write: vi.fn(),
    };

    const result = await executeHeaderFooterTemplateMutation(
      bytes,
      graph(),
      value,
      {
        fileName: 'test.pdf',
        now: new Date('2026-09-19T00:00:00Z'),
      },
      undefined,
      undefined,
      writer,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mutated).toBe(false);
    expect(result.bytes).toBe(bytes);
    expect(writer.write).not.toHaveBeenCalled();
  });

  it('preserves cancellation instead of converting it to execution failure', async () => {
    const writer: HeaderFooterPdfWriter = {
      write: vi.fn(async () => {
        throw new OperationCancelledError('header/footer test');
      }),
    };

    await expect(
      executeHeaderFooterTemplateMutation(
        new Uint8Array([1]),
        graph(),
        template('text'),
        {
          fileName: 'test.pdf',
          now: new Date('2026-09-19T00:00:00Z'),
        },
        undefined,
        undefined,
        writer,
      ),
    ).rejects.toBeInstanceOf(OperationCancelledError);
  });


  it('prepares an engine-neutral page-index plan without PDF bytes', () => {
    const result = prepareHeaderFooterTemplateMutation(
      graph(),
      template('text'),
      {
        fileName: 'test.pdf',
        now: new Date('2026-09-19T00:00:00Z'),
      },
      undefined,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.mutated).toBe(true);
    expect(result.pages).toEqual([
      expect.objectContaining({
        pageIndex: 0,
        footer: {
          right: expect.objectContaining({
            kind: 'text',
            text: '1',
          }),
        },
      }),
    ]);
  });

});
