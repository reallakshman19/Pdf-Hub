import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';

import type { ResolvedHeaderFooterPage } from './resolutionTypes';
import { pdfLibHeaderFooterWriter } from './pdfLibHeaderFooterWriter';

const onePixelPng = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlSW9sAAAAASUVORK5CYII=',
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
      pages: resolvedPages(),
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

  it('reports standard-font fallback instead of making font choice implicit', async () => {
    const before = await basePdf();
    const pages = resolvedPages();
    const first = pages[0]!;
    if (first.header?.left?.kind === 'text') {
      first.header.left.style.fontFamily = 'Inter';
    }

    const result = await pdfLibHeaderFooterWriter.write({
      baseBytes: before,
      pages: [first],
      binaryResources: {},
    });

    expect(result.warnings.join('\n')).toMatch(/Helvetica fallback/);
  });

  it('rejects an execution plan whose physical page is outside the PDF', async () => {
    const before = await basePdf();
    const invalid = resolvedPages()[0]!;
    invalid.physicalPageNumber = 99;

    await expect(
      pdfLibHeaderFooterWriter.write({
        baseBytes: before,
        pages: [invalid],
        binaryResources: {},
      }),
    ).rejects.toThrow(/outside the PDF/);
  });
});
