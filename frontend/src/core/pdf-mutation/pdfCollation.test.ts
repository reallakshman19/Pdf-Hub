import { describe, expect, it } from 'vitest';
import { planCollation, collatePdfDocuments } from './pdfCollation';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

describe('pdfCollation planCollation', () => {
  it('computes forward collation for symmetric page counts', () => {
    const plan = planCollation(3, 3, 'forward');

    expect(plan.mode).toBe('forward');
    expect(plan.totalPageCount).toBe(6);
    expect(plan.sequence).toEqual([
      { source: 'primary', sourcePageIndex: 0, label: 'Doc 1: Page 1' },
      { source: 'donor', sourcePageIndex: 0, label: 'Doc 2: Page 1' },
      { source: 'primary', sourcePageIndex: 1, label: 'Doc 1: Page 2' },
      { source: 'donor', sourcePageIndex: 1, label: 'Doc 2: Page 2' },
      { source: 'primary', sourcePageIndex: 2, label: 'Doc 1: Page 3' },
      { source: 'donor', sourcePageIndex: 2, label: 'Doc 2: Page 3' },
    ]);
  });

  it('computes reverse-duplex collation for scanning reverse-back pages', () => {
    // 3 primary pages (1, 3, 5), 3 donor pages (6, 4, 2 -> donor indices 0, 1, 2)
    // In reverse-duplex, donor indices are reversed: [2, 1, 0]
    const plan = planCollation(3, 3, 'reverse-duplex');

    expect(plan.mode).toBe('reverse-duplex');
    expect(plan.totalPageCount).toBe(6);
    expect(plan.sequence).toEqual([
      { source: 'primary', sourcePageIndex: 0, label: 'Doc 1: Page 1' },
      { source: 'donor', sourcePageIndex: 2, label: 'Doc 2: Page 3' },
      { source: 'primary', sourcePageIndex: 1, label: 'Doc 1: Page 2' },
      { source: 'donor', sourcePageIndex: 1, label: 'Doc 2: Page 2' },
      { source: 'primary', sourcePageIndex: 2, label: 'Doc 1: Page 3' },
      { source: 'donor', sourcePageIndex: 0, label: 'Doc 2: Page 1' },
    ]);
  });

  it('handles asymmetric page counts where primary has more pages', () => {
    const plan = planCollation(4, 2, 'forward');

    expect(plan.totalPageCount).toBe(6);
    expect(plan.sequence).toEqual([
      { source: 'primary', sourcePageIndex: 0, label: 'Doc 1: Page 1' },
      { source: 'donor', sourcePageIndex: 0, label: 'Doc 2: Page 1' },
      { source: 'primary', sourcePageIndex: 1, label: 'Doc 1: Page 2' },
      { source: 'donor', sourcePageIndex: 1, label: 'Doc 2: Page 2' },
      { source: 'primary', sourcePageIndex: 2, label: 'Doc 1: Page 3' },
      { source: 'primary', sourcePageIndex: 3, label: 'Doc 1: Page 4' },
    ]);
  });

  it('handles asymmetric page counts where donor has more pages in reverse-duplex', () => {
    const plan = planCollation(2, 4, 'reverse-duplex');

    expect(plan.totalPageCount).toBe(6);
    expect(plan.sequence).toEqual([
      { source: 'primary', sourcePageIndex: 0, label: 'Doc 1: Page 1' },
      { source: 'donor', sourcePageIndex: 3, label: 'Doc 2: Page 4' },
      { source: 'primary', sourcePageIndex: 1, label: 'Doc 1: Page 2' },
      { source: 'donor', sourcePageIndex: 2, label: 'Doc 2: Page 3' },
      { source: 'donor', sourcePageIndex: 1, label: 'Doc 2: Page 2' },
      { source: 'donor', sourcePageIndex: 0, label: 'Doc 2: Page 1' },
    ]);
  });

  it('supports selective donorPageIndices subset', () => {
    const plan = planCollation(2, 5, 'forward', [1, 3]);

    expect(plan.donorPageCount).toBe(2);
    expect(plan.totalPageCount).toBe(4);
    expect(plan.sequence).toEqual([
      { source: 'primary', sourcePageIndex: 0, label: 'Doc 1: Page 1' },
      { source: 'donor', sourcePageIndex: 1, label: 'Doc 2: Page 2' },
      { source: 'primary', sourcePageIndex: 1, label: 'Doc 1: Page 2' },
      { source: 'donor', sourcePageIndex: 3, label: 'Doc 2: Page 4' },
    ]);
  });

  it('rejects out of bounds donor indices fail-closed', () => {
    expect(() => planCollation(2, 3, 'forward', [0, 5])).toThrow(/outside bounds/i);
    expect(() => planCollation(-1, 3, 'forward')).toThrow(/invalid primary page count/i);
  });
});

describe('pdfCollation collatePdfDocuments', () => {
  it('collates two binary PDFs into an interleaved output document', async () => {
    const lib = await pdfLib();

    // Create 2-page primary doc
    const doc1 = await lib.PDFDocument.create();
    doc1.addPage([200, 200]);
    doc1.addPage([200, 200]);
    const bytes1 = await doc1.save();

    // Create 2-page donor doc
    const doc2 = await lib.PDFDocument.create();
    doc2.addPage([300, 300]);
    doc2.addPage([300, 300]);
    const bytes2 = await doc2.save();

    const collatedBytes = await collatePdfDocuments(bytes1, bytes2, { mode: 'forward' });
    const resultDoc = await lib.PDFDocument.load(collatedBytes);

    expect(resultDoc.getPageCount()).toBe(4);
    // Page 0 should be from doc1 (width 200)
    expect(resultDoc.getPage(0).getWidth()).toBe(200);
    // Page 1 should be from doc2 (width 300)
    expect(resultDoc.getPage(1).getWidth()).toBe(300);
    // Page 2 should be from doc1 (width 200)
    expect(resultDoc.getPage(2).getWidth()).toBe(200);
    // Page 3 should be from doc2 (width 300)
    expect(resultDoc.getPage(3).getWidth()).toBe(300);
  });
});
