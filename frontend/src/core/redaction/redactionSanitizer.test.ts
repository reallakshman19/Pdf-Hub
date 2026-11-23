import { describe, expect, it } from 'vitest';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  rectsIntersect,
  sanitizePdfDocument,
  textPointIntersectsRect,
} from './redactionSanitizer';

describe('redactionSanitizer', () => {
  describe('geometric utilities', () => {
    it('accurately identifies intersecting and non-intersecting rectangles', () => {
      const a = { x: 50, y: 50, width: 100, height: 100 };
      const b = { x: 100, y: 100, width: 100, height: 100 }; // overlaps
      const c = { x: 200, y: 200, width: 50, height: 50 }; // disjoint

      expect(rectsIntersect(a, b)).toBe(true);
      expect(rectsIntersect(a, c)).toBe(false);
      expect(rectsIntersect(b, c)).toBe(false);
    });

    it('identifies whether text baseline point falls within a redaction zone', () => {
      const rect = { x: 100, y: 100, width: 200, height: 50 };

      // Point at (150, 120) with font size 12
      expect(textPointIntersectsRect(150, 120, 12, rect)).toBe(true);
      // Point at (10, 10)
      expect(textPointIntersectsRect(10, 10, 12, rect)).toBe(false);
    });
  });

  describe('sanitizePdfDocument', () => {
    it('fails closed when redactions list is empty', async () => {
      const dummyBytes = new Uint8Array([1, 2, 3]);
      await expect(sanitizePdfDocument(dummyBytes, [])).rejects.toThrow(
        /Cannot execute redaction with empty redaction list/i,
      );
    });

    it('fails closed when page index or dimensions are invalid', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      doc.addPage([400, 600]);
      const bytes = await doc.save();

      // Page index 5 is out of bounds [0..0]
      await expect(
        sanitizePdfDocument(bytes, [
          { pageIndex: 5, rect: { x: 10, y: 10, width: 50, height: 50 } },
        ]),
      ).rejects.toThrow(/out of bounds/i);

      // Width <= 0
      await expect(
        sanitizePdfDocument(bytes, [
          { pageIndex: 0, rect: { x: 10, y: 10, width: -10, height: 50 } },
        ]),
      ).rejects.toThrow(/Must be positive/i);
    });

    it('purges annotations overlapping redaction zones while keeping disjoint annotations', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      const page = doc.addPage([500, 500]);

      // Create two annotation dictionaries
      const annot1 = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Square',
        Rect: [50, 50, 150, 150], // Overlaps redaction (100, 100, 100, 100)
      });
      const annot2 = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Highlight',
        Rect: [300, 300, 400, 400], // Disjoint from redaction
      });

      const annotsArray = doc.context.obj([annot1, annot2]);
      page.node.set(lib.PDFName.of('Annots'), annotsArray);

      const sourceBytes = await doc.save();

      const result = await sanitizePdfDocument(sourceBytes, [
        {
          pageIndex: 0,
          rect: { x: 100, y: 100, width: 100, height: 100 },
          reason: 'Confidential PII',
        },
      ]);

      expect(result.appliedRedactionCount).toBe(1);
      expect(result.purgedAnnotationsCount).toBe(1);
      expect(result.records[0].purgedAnnotationsCount).toBe(1);

      // Load sanitized document and verify annotations
      const sanitizedDoc = await lib.PDFDocument.load(result.sanitizedBytes);
      const sanitizedPage = sanitizedDoc.getPage(0);
      const remainingAnnots = sanitizedPage.node.get(lib.PDFName.of('Annots'));
      expect(remainingAnnots).toBeDefined();

      const resolved = sanitizedDoc.context.lookup(remainingAnnots) as import('pdf-lib').PDFArray;
      expect(resolved.size()).toBe(1); // Only annot2 survived
    });

    it('sanitizes text content stream and burns in vector redaction rectangle', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      const page = doc.addPage([500, 500]);

      // Draw text at (120, 120)
      page.drawText('Confidential SSN: 123-45-6789', {
        x: 120,
        y: 120,
        size: 14,
      });

      // Draw text at (50, 400) - safe text outside redaction
      page.drawText('Public Header: Safe Information', {
        x: 50,
        y: 400,
        size: 14,
      });

      const sourceBytes = await doc.save();

      const result = await sanitizePdfDocument(sourceBytes, [
        {
          pageIndex: 0,
          rect: { x: 100, y: 100, width: 250, height: 40 },
          reason: 'SSN Removal',
          fillColor: 'black',
        },
      ]);

      expect(result.appliedRedactionCount).toBe(1);
      expect(result.purgedTextCharacterCount).toBeGreaterThan(0);
      expect(result.records[0].reason).toBe('SSN Removal');

      // Verify that the document loads cleanly and has updated page content
      const sanitizedDoc = await lib.PDFDocument.load(result.sanitizedBytes);
      expect(sanitizedDoc.getPageCount()).toBe(1);
    });
  });
});
