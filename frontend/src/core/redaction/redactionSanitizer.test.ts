import { describe, expect, it } from 'vitest';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  rectContainedIn,
  rectsIntersect,
  sanitizePdfDocument,
  textPointIntersectsRect,
  textSpanIntersectsRect,
} from './redactionSanitizer';

async function decodePageStreamsText(bytes: Uint8Array, pageIndex = 0): Promise<string> {
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(bytes);
  const page = doc.getPage(pageIndex);
  const contents = page.node.get(lib.PDFName.of('Contents'));
  const resolved = contents instanceof lib.PDFRef ? doc.context.lookup(contents) : contents;
  const entries = resolved instanceof lib.PDFArray ? resolved.asArray() : [contents];
  let combined = '';
  for (const entry of entries) {
    const stream = entry instanceof lib.PDFRef ? doc.context.lookup(entry) : entry;
    if (stream instanceof lib.PDFRawStream) {
      combined += new TextDecoder('latin1').decode(lib.decodePDFRawStream(stream).decode());
      combined += '\n';
    }
  }
  const res = page.node.lookupMaybe(lib.PDFName.of('Resources'), lib.PDFDict);
  const xObjs = res?.lookupMaybe(lib.PDFName.of('XObject'), lib.PDFDict);
  if (xObjs) {
    for (const key of xObjs.keys()) {
      const ref = xObjs.get(key);
      const obj = ref instanceof lib.PDFRef ? doc.context.lookup(ref) : ref;
      if (obj instanceof lib.PDFRawStream) {
        const sub = obj.dict.get(lib.PDFName.of('Subtype'));
        if (sub instanceof lib.PDFName && sub.decodeText() === 'Form') {
          combined += new TextDecoder('latin1').decode(lib.decodePDFRawStream(obj).decode());
          combined += '\n';
        }
      }
    }
  }
  const decodedHexAndLiteral = combined.replace(/<([0-9a-fA-F]+)>/g, (_m, hex: string) => {
    let out = '';
    for (let i = 0; i + 1 < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    return `(${out})`;
  });
  return decodedHexAndLiteral;
}

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

    it('detects horizontal text spans starting left of a box and extending into it', () => {
      const rect = { x: 140, y: 100, width: 120, height: 40 };
      expect(textSpanIntersectsRect(50, 120, 150, 12, rect)).toBe(true);
      expect(textSpanIntersectsRect(20, 120, 50, 12, rect)).toBe(false);
      expect(rectContainedIn({ x: 150, y: 110, width: 30, height: 20 }, rect)).toBe(true);
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

    it('purges text runs whose origin sits left of the box while spanning into it, and preserves disjoint runs', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      const page = doc.addPage([600, 600]);
      page.drawText('Prefix: SECRET_TOKEN_123', { x: 40, y: 200, size: 14 });
      page.drawText('FarRightSafe', { x: 420, y: 200, size: 14 });

      const sourceBytes = await doc.save();
      const result = await sanitizePdfDocument(sourceBytes, [
        { pageIndex: 0, rect: { x: 130, y: 190, width: 140, height: 30 } },
      ]);

      expect(result.purgedTextCharacterCount).toBeGreaterThan(0);
      const streamText = await decodePageStreamsText(result.sanitizedBytes);
      expect(streamText).not.toContain('SECRET_TOKEN_123');
      expect(streamText).toContain('FarRightSafe');
    });

    it('selectively strips overlapping TJ array sub-runs while preserving non-overlapping array segments', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      const page = doc.addPage([600, 600]);
      // "SafeLeft" around x=40..90, large negative kerning -20000 jumps +240pt right into x=330..400, then -20000 jumps +240pt more to x=640
      const stream = doc.context.flateStream(
        'BT /F1 12 Tf 40 300 Td [(SafeLeft) -20000 (PURGE_ME) -20000 (SafeEnd)] TJ ET',
      );
      page.node.set(lib.PDFName.of('Contents'), doc.context.register(stream));

      const sourceBytes = await doc.save();
      const result = await sanitizePdfDocument(sourceBytes, [
        { pageIndex: 0, rect: { x: 300, y: 290, width: 140, height: 30 } },
      ]);

      expect(result.purgedTextCharacterCount).toBe('PURGE_ME'.length);
      const streamText = await decodePageStreamsText(result.sanitizedBytes);
      expect(streamText).toContain('SafeLeft');
      expect(streamText).not.toContain('PURGE_ME');
      expect(streamText).toContain('SafeEnd');
    });

    it('tracks CTM transforms (q/cm) and selectively purges Form XObject placements without corrupting safe reuse', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      const page = doc.addPage([600, 600]);

      // Shared Form XObject containing text at (10, 10) inside its local coordinate space
      const formStream = doc.context.flateStream('BT /F1 12 Tf 10 10 Td (SHARED_SECRET) Tj ET');
      formStream.dict.set(lib.PDFName.of('Type'), lib.PDFName.of('XObject'));
      formStream.dict.set(lib.PDFName.of('Subtype'), lib.PDFName.of('Form'));
      formStream.dict.set(lib.PDFName.of('BBox'), doc.context.obj([0, 0, 180, 40]));
      const formRef = doc.context.register(formStream);

      const xObjDict = doc.context.obj({ Fm1: formRef });
      const resDict = doc.context.obj({ XObject: xObjDict });
      page.node.set(lib.PDFName.of('Resources'), resDict);

      // Place Fm1 at redacted y=100 AND safely at y=450
      const pageContent = doc.context.flateStream(
        'q 1 0 0 1 100 100 cm /Fm1 Do Q\nq 1 0 0 1 100 450 cm /Fm1 Do Q\n',
      );
      page.node.set(lib.PDFName.of('Contents'), doc.context.register(pageContent));

      const sourceBytes = await doc.save();
      const result = await sanitizePdfDocument(sourceBytes, [
        { pageIndex: 0, rect: { x: 95, y: 95, width: 200, height: 50 } },
      ]);

      expect(result.purgedTextCharacterCount).toBeGreaterThan(0);
      const streamText = await decodePageStreamsText(result.sanitizedBytes);
      // Safe placement at y=450 still invokes original untouched Fm1; redacted site uses cloned stripped stream
      expect(streamText).toContain('/Fm1 Do');
      expect(streamText).toContain('/Fm1_red1 Do');
      expect(streamText).toContain('SHARED_SECRET'); // One intact instance for y=450 only
      expect(streamText.match(/SHARED_SECRET/g)?.length).toBe(1);
    });

    it('strips contained Image XObjects and scrubs /Info and XMP metadata when scrubMetadata is enabled', async () => {
      const lib = await pdfLib();
      const doc = await lib.PDFDocument.create();
      doc.setTitle('Secret Merger Target');
      doc.setAuthor('Jane Counsel');
      const xmpStream = doc.context.flateStream('<x:xmpmeta>Confidential</x:xmpmeta>');
      doc.catalog.set(lib.PDFName.of('Metadata'), doc.context.register(xmpStream));

      const page = doc.addPage([500, 500]);
      const pngBytes = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='),
        (c) => c.charCodeAt(0),
      );
      const image = await doc.embedPng(pngBytes);
      page.drawImage(image, { x: 110, y: 110, width: 60, height: 60 });

      const sourceBytes = await doc.save();
      const result = await sanitizePdfDocument(
        sourceBytes,
        [{ pageIndex: 0, rect: { x: 100, y: 100, width: 100, height: 100 } }],
        { scrubMetadata: true },
      );

      expect(result.purgedImagesCount).toBe(1);
      expect(result.metadataScrubbed).toBe(true);

      const loaded = await lib.PDFDocument.load(result.sanitizedBytes);
      expect(loaded.getTitle() ?? '').toBe('');
      expect(loaded.getAuthor() ?? '').toBe('');
      expect(loaded.catalog.get(lib.PDFName.of('Metadata'))).toBeUndefined();
    });
  });
});
