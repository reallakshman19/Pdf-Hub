import { describe, it, expect } from 'vitest';
import { generateMockPdf } from './mockPdfGenerator';
import { PDFDocument } from 'pdf-lib';

describe('mockPdfGenerator', () => {
  it('generates an 8-page PDF successfully without throwing', async () => {
    const bytes = await generateMockPdf();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(8);
    expect(doc.getTitle()).toBe('DocCraft Benchmark PDF');
  });
});
