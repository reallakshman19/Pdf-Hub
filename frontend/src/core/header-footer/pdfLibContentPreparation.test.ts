import { describe, expect, it, vi } from 'vitest';

import type { HeaderFooterPdfLibResources } from './pdfLibResources';
import { prepareHeaderFooterContent } from './pdfLibContentPreparation';

function image(width: number, height: number): import('pdf-lib').PDFImage {
  return { width, height } as unknown as import('pdf-lib').PDFImage;
}

function resources(
  width = 200,
  height = 100,
): HeaderFooterPdfLibResources {
  return {
    fontFor: vi.fn(),
    imageFor: vi.fn(async () => image(width, height)),
    warnings: () => [],
  };
}

describe('header/footer image content preparation', () => {
  it('preserves aspect ratio when only width is specified', async () => {
    const prepared = await prepareHeaderFooterContent(
      {
        kind: 'image',
        binaryResourceId: 'logo',
        widthPt: 100,
        opacity: 1,
        fit: 'contain',
      },
      resources(),
    );

    expect(prepared).toMatchObject({
      kind: 'image',
      widthPt: 100,
      heightPt: 50,
    });
  });

  it('contains the image within an explicit width/height box without distortion', async () => {
    const prepared = await prepareHeaderFooterContent(
      {
        kind: 'image',
        binaryResourceId: 'logo',
        widthPt: 100,
        heightPt: 100,
        opacity: 0.8,
        fit: 'contain',
      },
      resources(200, 100),
    );

    expect(prepared).toMatchObject({
      kind: 'image',
      widthPt: 100,
      heightPt: 50,
      opacity: 0.8,
    });
  });

  it('fails explicitly instead of silently ignoring cover cropping', async () => {
    await expect(
      prepareHeaderFooterContent(
        {
          kind: 'image',
          binaryResourceId: 'logo',
          widthPt: 100,
          heightPt: 100,
          opacity: 1,
          fit: 'cover',
        },
        resources(),
      ),
    ).rejects.toThrow(/requires clipping/);
  });
});
