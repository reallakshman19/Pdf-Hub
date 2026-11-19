import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';

describe('ALT-WP01 Synthetic Reproducer — Imported /Stamp /AP Preservation', () => {
  it('preserves /AP on imported Stamp during no-op save', async () => {
    const inputBytes = new Uint8Array(
      await fs.readFile('../../scratch/synthetic_stamp_input.pdf')
    );

    const { annotations } = await readNativePdfAnnotations(inputBytes);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].id).toBe('synthetic-stamp-001');

    const writeResult = await writeNativePdfAnnotations(inputBytes, annotations);
    expect(writeResult.annotationCount).toBe(1);

    const outDoc = await PDFDocument.load(writeResult.bytes);
    const page0 = outDoc.getPage(0);
    const annots = page0.node.lookupMaybe(PDFName.of('Annots'), PDFArray) as PDFArray;
    expect(annots.size()).toBe(1);

    const annot0 = annots.lookup(0, PDFDict);
    const ap = annot0.get(PDFName.of('AP'));
    // In C0, this assertion FAILS (ap is undefined because appearanceFieldsEquivalent returns false)
    expect(ap, 'Imported Stamp /AP must survive no-op save').toBeDefined();
  });
});
