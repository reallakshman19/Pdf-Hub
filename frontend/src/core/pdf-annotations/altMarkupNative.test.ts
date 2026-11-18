import { describe, expect, it } from 'vitest';
import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString, degrees,
} from 'pdf-lib';
import type { PdfAnnotation } from '@/core/annotations/types';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { createMarkupSpace, viewPointToPdf, viewRectToPdfRect } from './markupGeometry';

const types = ['highlight', 'underline', 'strikeout', 'squiggly', 'redaction'] as const;

function sample(type: typeof types[number], id = 'alt-markup'): PdfAnnotation {
  return {
    id, type, pageNumber: 1,
    rect: { x: 40, y: 50, width: 70, height: 16 },
    data: type === 'redaction'
      ? { backgroundColor: '#000000', borderColor: '#000000' }
      : type === 'highlight'
        ? { backgroundColor: '#fde047', opacity: 0.38 }
        : { borderColor: '#dc2626', borderWidth: 1.5 },
    createdAt: 1700000000000, updatedAt: 1700000000100,
  };
}

function nativeRoot(pdf: PDFDocument): PDFDict {
  const annots = pdf.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) throw new Error('Missing /Annots');
  const dict = annots.lookupMaybe(0, PDFDict);
  if (!dict) throw new Error('Missing native root');
  return dict;
}

function numbers(dict: PDFDict, key: string): number[] {
  const arr = dict.lookupMaybe(PDFName.of(key), PDFArray);
  if (!arr) throw new Error('Missing ' + key);
  return Array.from({ length: arr.size() }, (_, i) => {
    const v = arr.lookupMaybe(i, PDFNumber);
    if (!v) throw new Error('Non-number ' + key);
    return v.asNumber();
  });
}

describe('ALT WP01 exact native markup appearance and identity', () => {
  for (const type of types) {
    it('writes valid /AP /N with bounding box and preserves editable identity: ' + type, async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([300, 400]);
      page.drawText('THE SOURCE TEXT MUST STAY EXTRACTABLE', { x: 40, y: 320 });
      const source = new Uint8Array(await doc.save());
      const first = await writeNativePdfAnnotations(source, [sample(type)]);
      const parsed = await PDFDocument.load(first.bytes);
      const root = nativeRoot(parsed);
      const ap = root.lookupMaybe(PDFName.of('AP'), PDFDict);
      expect(ap).toBeTruthy();
      const normal = ap?.lookup(PDFName.of('N')) as { dict?: PDFDict } | undefined;
      expect(normal?.dict).toBeTruthy();
      const stream = normal!.dict!;
      expect(stream.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()).toBe('Form');
      expect(numbers(stream, 'BBox')).toEqual([0, 0, 70, 16]);
      expect(numbers(stream, 'Matrix')).toEqual([1, 0, 0, 1, 0, 0]);
      const resources = stream.lookupMaybe(PDFName.of('Resources'), PDFDict);
      expect(resources?.lookupMaybe(PDFName.of('ExtGState'), PDFDict)).toBeTruthy();
      const expectedSubtype = type === 'redaction' ? 'Square'
        : type === 'strikeout' ? 'StrikeOut'
          : type.charAt(0).toUpperCase() + type.slice(1);
      expect(root.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()).toBe(expectedSubtype);
      expect(root.lookupMaybe(PDFName.of('NM'), PDFString)?.decodeText()).toBe('alt-markup');
      expect(numbers(root, 'Rect')).toEqual([40, 334, 110, 350]);
      if (type !== 'redaction') {
        expect(numbers(root, 'QuadPoints')).toEqual([40, 350, 110, 350, 40, 334, 110, 334]);
      } else {
        expect(root.lookupMaybe(PDFName.of('QuadPoints'), PDFArray)).toBeUndefined();
        expect(root.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()).not.toBe('Redact');
      }

      const roundTrip = await readNativePdfAnnotations(first.bytes);
      const match = roundTrip.annotations.find((a) => a.id === 'alt-markup');
      expect(match?.type).toBe(type);
      expect(match?.rect).toEqual(sample(type).rect);
      const second = await writeNativePdfAnnotations(first.bytes, roundTrip.annotations);
      const reopened = await PDFDocument.load(second.bytes);
      const roots = reopened.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      expect(roots?.size()).toBe(1);
      expect(nativeRoot(reopened).lookupMaybe(PDFName.of('AP'), PDFDict)).toBeTruthy();
    });
  }

  for (const rotation of [0, 90, 180, 270]) {
    it('saves rotated/cropped /QuadPoints then reopens with identical rect: ' + rotation, async () => {
      const doc = await PDFDocument.create();
      const page = doc.addPage([330, 530]);
      page.setCropBox(20, 30, 280, 460);
      page.setRotation(degrees(rotation));
      const original = sample('highlight', 'rotated-' + rotation);
      const first = await writeNativePdfAnnotations(new Uint8Array(await doc.save()), [original]);
      const parsed = await PDFDocument.load(first.bytes);
      const root = nativeRoot(parsed);
      const space = createMarkupSpace({ x: 20, y: 30, width: 280, height: 460 }, rotation);
      expect(numbers(root, 'Rect')).toEqual(viewRectToPdfRect(original.rect, space));
      const tl = viewPointToPdf(original.rect.x, original.rect.y, space);
      const points = numbers(root, 'QuadPoints');
      expect(points.slice(0, 2)).toEqual([tl.x, tl.y]);
      expect(root.lookupMaybe(PDFName.of('AP'), PDFDict)).toBeTruthy();
      const reread = await readNativePdfAnnotations(first.bytes);
      expect(reread.annotations).toHaveLength(1);
      expect(reread.annotations[0].rect.x).toBeCloseTo(original.rect.x, 7);
      expect(reread.annotations[0].rect.y).toBeCloseTo(original.rect.y, 7);
      expect(reread.annotations[0].rect.width).toBeCloseTo(original.rect.width, 7);
      expect(reread.annotations[0].rect.height).toBeCloseTo(original.rect.height, 7);
      const second = await writeNativePdfAnnotations(first.bytes, reread.annotations);
      const secondDoc = await PDFDocument.load(second.bytes);
      expect(numbers(nativeRoot(secondDoc), 'Rect')).toEqual(numbers(root, 'Rect'));
      expect(numbers(nativeRoot(secondDoc), 'QuadPoints')).toEqual(points);
    });
  }

  it('rejects invalid zero-area visual mask instead of writing malformed AP (negative)', async () => {
    const doc = await PDFDocument.create(); doc.addPage([200, 300]);
    const invalid = sample('redaction'); invalid.rect.width = 0;
    await expect(writeNativePdfAnnotations(
      new Uint8Array(await doc.save()), [invalid],
    )).rejects.toThrow('INVALID_MARKUP_APPEARANCE_GEOMETRY');
  });

  it('keeps different managed /NM values unique across pages (WP00 consumer)', async () => {
    const doc = await PDFDocument.create(); doc.addPage([200, 300]); doc.addPage([200, 300]);
    const a = sample('highlight', 'mark-p1');
    const b = { ...sample('underline', 'mark-p2'), pageNumber: 2 };
    const output = await writeNativePdfAnnotations(new Uint8Array(await doc.save()), [a, b]);
    const read = await readNativePdfAnnotations(output.bytes);
    expect(read.annotations.map((x) => x.id).sort()).toEqual(['mark-p1', 'mark-p2']);
    expect(read.annotations.map((x) => x.pageNumber).sort()).toEqual([1, 2]);
  });
});
