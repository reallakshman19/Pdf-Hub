import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib';

import type { PageGraph, PageNode } from '@/core/pages/types';
import { writePdfPageLabels } from '@/core/pages/pdfPageLabelWriter';
import type { ResolvedHeaderFooterPage } from './resolutionTypes';
import { compileHeaderFooterMutationPlan } from './mutationPlan';
import { pdfLibHeaderFooterWriter } from './pdfLibHeaderFooterWriter';

const onePixelPng = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  ),
);

async function basePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const angle of [0, 90, 180, 270] as const) {
    const page = pdf.addPage([600, 800]);
    page.setRotation(degrees(angle));
  }
  return pdf.save();
}

function pageGraphForLabels(): PageGraph<PageNode> {
  return {
    pages: [0, 90, 180, 270].map((rotation, index) => ({
      pageId: `p${index + 1}`,
      documentKey: 'doc',
      originalPageNumber: index + 1,
      currentIndex: index,
      width: 600,
      height: 800,
      rotation: rotation as 0 | 90 | 180 | 270,
    })),
  };
}

function resolvedPages(): ResolvedHeaderFooterPage[] {
  return [0, 90, 180, 270].map((rotation, index) => ({
    pageId: `p${index + 1}`,
    physicalPageNumber: index + 1,
    logicalPageLabel: String(index + 1),
    sectionPageNumber: index + 1,
    sectionPageCount: 4,
    layout: {
      leftMarginPt: 36,
      rightMarginPt: 36,
      headerOffsetFromTopPt: 24,
      footerOffsetFromBottomPt: 24,
    },
    header: {
      left: {
        kind: 'text',
        text: `Header ${index + 1}`,
        style: {
          fontFamily: 'Helvetica',
          fontSizePt: 10,
          fontWeight: 'normal',
          fontStyle: 'normal',
          color: '#202020',
          opacity: 1,
        },
      },
      separator: {
        thicknessPt: 0.5,
        color: '#808080',
        opacity: 1,
        insetLeftPt: 0,
        insetRightPt: 0,
      },
    },
    footer: {
      center: {
        kind: 'text',
        text: `Page ${index + 1} of 4`,
        style: {
          fontFamily: 'Helvetica',
          fontSizePt: 10,
          fontWeight: 'bold',
          fontStyle: 'normal',
          color: '#202020',
          opacity: 1,
        },
      },
      ...(rotation === 90
        ? {
            right: {
              kind: 'image' as const,
              binaryResourceId: 'logo',
              widthPt: 16,
              heightPt: 16,
              opacity: 1,
              fit: 'contain' as const,
            },
          }
        : {}),
    },
  }));
}

describe('pdfLibHeaderFooterWriter', () => {
  it('writes and reopens mixed-rotation pages without changing page structure', async () => {
    const before = await basePdf();

    const result = await pdfLibHeaderFooterWriter.write({
      baseBytes: before,
      pages: compileHeaderFooterMutationPlan(resolvedPages()),
      binaryResources: {
        logo: onePixelPng,
      },
    });

    expect(result.bytes.byteLength).toBeGreaterThan(before.byteLength);
    expect(result.warnings).toEqual([]);

    const reopened = await PDFDocument.load(result.bytes);
    expect(reopened.getPageCount()).toBe(4);
    expect(
      reopened.getPages().map((page) => page.getRotation().angle),
    ).toEqual([0, 90, 180, 270]);
    expect(
      reopened.getPages().map((page) => [
        page.getWidth(),
        page.getHeight(),
      ]),
    ).toEqual([
      [600, 800],
      [600, 800],
      [600, 800],
      [600, 800],
    ]);
  });

  it('preserves logical PDF PageLabels while adding printed content', async () => {
    const before = await basePdf();
    const labeled = await writePdfPageLabels(
      before,
      pageGraphForLabels(),
      [
        { startPageId: 'p1', prefix: 'Cover' },
        { startPageId: 'p2', style: 'roman-lower' },
      ],
    );

    const result = await pdfLibHeaderFooterWriter.write({
      baseBytes: labeled.bytes,
      pages: compileHeaderFooterMutationPlan(resolvedPages()),
      binaryResources: {
        logo: onePixelPng,
      },
    });

    const reopened = await PDFDocument.load(result.bytes);
    const labels = reopened.catalog.lookupMaybe(
      PDFName.of('PageLabels'),
      PDFDict,
    );
    const nums = labels?.lookupMaybe(PDFName.of('Nums'), PDFArray);

    expect(nums?.size()).toBe(4);
    expect(nums?.lookupMaybe(0, PDFNumber)?.asNumber()).toBe(0);
    expect(nums?.lookupMaybe(2, PDFNumber)?.asNumber()).toBe(1);
  });

  it('reports standard-font fallback instead of making font choice implicit', async () => {
    const before = await basePdf();
    const pages = resolvedPages();
    const first = pages[0]!;
    if (first.header?.left?.kind === 'text') {
      first.header.left.style.fontFamily = 'Inter';
    }

    const result = await pdfLibHeaderFooterWriter.write({
      baseBytes: before,
      pages: compileHeaderFooterMutationPlan([first]),
      binaryResources: {},
    });

    expect(result.warnings.join('\n')).toMatch(/Helvetica fallback/);
  });

  it('rejects an execution plan whose physical page is outside the PDF', async () => {
    const before = await basePdf();
    const [invalid] =
      compileHeaderFooterMutationPlan([
        resolvedPages()[0]!,
      ]);
    if (!invalid) throw new Error('Missing test plan');
    invalid.pageIndex = 98;

    await expect(
      pdfLibHeaderFooterWriter.write({
        baseBytes: before,
        pages: [invalid],
        binaryResources: {},
      }),
    ).rejects.toThrow(/outside the PDF/);
  });
});
