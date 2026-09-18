import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
} from 'pdf-lib';

import { createPageGraph } from './pageGraph';
import {
  decodePageLabelDictionaryForTests,
  writePdfPageLabels,
} from './pdfPageLabelWriter';

function graph() {
  return createPageGraph([
    page('cover', 0),
    page('front-1', 1),
    page('front-2', 2),
    page('body-1', 3),
    page('appendix-1', 4),
  ]);
}

function page(pageId: string, currentIndex: number) {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 300,
    height: 400,
    rotation: 0 as const,
  };
}

async function createPdf(pageCount = 5) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    doc.addPage([300, 400]);
  }
  doc.catalog.set(
    PDFName.of('CustomPdfHubSentinel'),
    PDFHexString.fromText('preserve-me'),
  );
  return new Uint8Array(await doc.save());
}

describe('PDF PageLabels writer', () => {
  it('serializes a valid PageLabels number tree and preserves unrelated catalog entries', async () => {
    const base = await createPdf();
    const result = await writePdfPageLabels(base, graph(), [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
      {
        startPageId: 'appendix-1',
        style: 'decimal',
        prefix: 'A-',
        startNumber: 7,
      },
    ]);

    expect(result.rangeCount).toBe(4);

    const doc = await PDFDocument.load(result.bytes);
    expect(
      doc.catalog.lookupMaybe(
        PDFName.of('CustomPdfHubSentinel'),
        PDFHexString,
      )?.decodeText(),
    ).toBe('preserve-me');

    const labels = doc.catalog.lookupMaybe(PDFName.of('PageLabels'), PDFDict);
    expect(labels).toBeTruthy();
    const nums = labels?.lookupMaybe(PDFName.of('Nums'), PDFArray);
    expect(nums?.size()).toBe(8);

    const starts = [0, 2, 4, 6].map((offset) =>
      nums?.lookupMaybe(offset, PDFNumber)?.asNumber(),
    );
    expect(starts).toEqual([0, 1, 3, 4]);

    const dictionaries = [1, 3, 5, 7].map((offset) =>
      nums?.lookupMaybe(offset, PDFDict),
    );
    expect(decodePageLabelDictionaryForTests(dictionaries[0]!, {
      PDFName,
      PDFString: (await import('pdf-lib')).PDFString,
      PDFHexString,
      PDFNumber,
    } as never)).toEqual({ prefix: 'Cover' });
    expect(decodePageLabelDictionaryForTests(dictionaries[1]!, {
      PDFName,
      PDFString: (await import('pdf-lib')).PDFString,
      PDFHexString,
      PDFNumber,
    } as never)).toEqual({ style: '/r' });
    expect(decodePageLabelDictionaryForTests(dictionaries[2]!, {
      PDFName,
      PDFString: (await import('pdf-lib')).PDFString,
      PDFHexString,
      PDFNumber,
    } as never)).toEqual({ style: '/D' });
    expect(decodePageLabelDictionaryForTests(dictionaries[3]!, {
      PDFName,
      PDFString: (await import('pdf-lib')).PDFString,
      PDFHexString,
      PDFNumber,
    } as never)).toEqual({
      style: '/D',
      prefix: 'A-',
      startNumber: 7,
    });
  });

  it('removes only the PageLabels catalog entry when ranges are empty', async () => {
    const base = await createPdf();
    const labeled = await writePdfPageLabels(base, graph(), [
      { startPageId: 'cover', style: 'decimal' },
    ]);
    const cleared = await writePdfPageLabels(labeled.bytes, graph(), []);

    const doc = await PDFDocument.load(cleared.bytes);
    expect(doc.catalog.get(PDFName.of('PageLabels'))).toBeUndefined();
    expect(
      doc.catalog.lookupMaybe(
        PDFName.of('CustomPdfHubSentinel'),
        PDFHexString,
      )?.decodeText(),
    ).toBe('preserve-me');
  });

  it('rejects PageGraph/PDF page-count mismatch before saving', async () => {
    const base = await createPdf(2);
    await expect(
      writePdfPageLabels(base, graph(), [
        { startPageId: 'cover', style: 'decimal' },
      ]),
    ).rejects.toThrow(/PageGraph count 5 does not match PDF page count 2/);
  });
});
