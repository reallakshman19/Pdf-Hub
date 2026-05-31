import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PdfEditAdapter } from './PdfEditAdapter';

async function createPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([300, 400]);
  }
  return new Uint8Array(await doc.save());
}

describe('PdfEditAdapter error paths', () => {
  it('removePages throws when every page is removed', async () => {
    const bytes = await createPdf(1);
    await expect(PdfEditAdapter.removePages(bytes, [0])).rejects.toThrow(
      'Cannot remove all pages from the document',
    );
  });

  it('reorderPages throws when order length mismatches page count', async () => {
    const bytes = await createPdf(3);
    await expect(PdfEditAdapter.reorderPages(bytes, [0, 1])).rejects.toThrow(
      'Reorder list length does not match page count',
    );
  });

  it('reorderPages throws for invalid permutation entries', async () => {
    const bytes = await createPdf(3);
    await expect(PdfEditAdapter.reorderPages(bytes, [0, 0, 2])).rejects.toThrow(
      'Reorder list is not a valid page permutation',
    );
  });

  it('movePagesAsBlock returns original bytes when selected pages are out of range', async () => {
    const bytes = await createPdf(2);
    const out = await PdfEditAdapter.movePagesAsBlock(bytes, [99], 0, 'before');
    expect(out).toEqual(bytes);
  });

  it('extractPages throws for out-of-range page indices', async () => {
    const bytes = await createPdf(2);
    await expect(PdfEditAdapter.extractPages(bytes, [99])).rejects.toThrow();
  });

  it('merge with empty append list preserves page count', async () => {
    const bytes = await createPdf(2);
    const merged = await PdfEditAdapter.merge(bytes, []);
    const pageCount = await PdfEditAdapter.countPages(merged);
    expect(pageCount).toBe(2);
  });

  it('throws on corrupted bytes for merge', async () => {
    const bad = new Uint8Array([0, 1, 2, 3, 4]);
    const good = await createPdf(1);
    await expect(PdfEditAdapter.merge(good, [bad])).rejects.toThrow();
  });
});
