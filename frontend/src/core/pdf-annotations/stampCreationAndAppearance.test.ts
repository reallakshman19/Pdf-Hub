import { describe, it, expect } from 'vitest';
import * as pdfLib from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import type { PdfAnnotation } from '../annotations/types';
import { v4 as uuidv4 } from 'uuid';

describe('Native Stamp creation and appearance fidelity', () => {
  it('creates new native stamp with valid /AP /N Form XObject stream and resources', async () => {
    const doc = await pdfLib.PDFDocument.create();
    doc.addPage([600, 400]);
    const baseBytes = await doc.save();

    const newStamp: PdfAnnotation = {
      id: uuidv4(),
      type: 'stamp',
      pageNumber: 1,
      rect: { x: 50, y: 100, width: 140, height: 40 },
      data: {
        text: 'REVISED',
        borderColor: '#dc2626',
        backgroundColor: '#fef2f2',
        textColor: '#991b1b',
        fontSize: 16,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const writeResult = await writeNativePdfAnnotations(baseBytes, [newStamp]);
    expect(writeResult.bytes.length).toBeGreaterThan(baseBytes.length);

    // Verify PDF structure
    const savedDoc = await pdfLib.PDFDocument.load(writeResult.bytes);
    const annots = savedDoc.getPage(0).node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray);
    expect(annots?.size()).toBe(1);

    const stampDict = annots!.lookup(0, pdfLib.PDFDict);
    expect(stampDict.lookup(pdfLib.PDFName.of('Subtype'), pdfLib.PDFName).decodeText()).toBe('Stamp');

    // Normal Appearance Stream must be present and valid
    const apDict = stampDict.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict);
    expect(apDict).toBeDefined();

    const normalStream = apDict.lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
    expect(normalStream).toBeDefined();

    const streamDict = normalStream.dict;
    expect(streamDict.lookup(pdfLib.PDFName.of('Subtype'), pdfLib.PDFName).decodeText()).toBe('Form');
    expect(streamDict.lookup(pdfLib.PDFName.of('BBox'), pdfLib.PDFArray)).toBeDefined();
    expect(streamDict.lookup(pdfLib.PDFName.of('Resources'), pdfLib.PDFDict)).toBeDefined();

    // Verify round-trip read
    const roundTrip = await readNativePdfAnnotations(writeResult.bytes);
    expect(roundTrip.annotations.length).toBe(1);
    expect(roundTrip.annotations[0].type).toBe('stamp');
  });

  it('preserves existing custom stamp /AP stream on no-op save', async () => {
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([600, 400]);

    // Appearance Form XObject representing custom logo
    const customApStream = doc.context.stream('q 1 0 0 rg 0 0 50 50 re f Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 50, 50],
      Resources: doc.context.obj({}),
    });
    const apRef = doc.context.register(customApStream);
    const apDict = doc.context.obj({ N: apRef });

    const stampAnnot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Stamp',
      Rect: [100, 100, 150, 150],
      Name: pdfLib.PDFName.of('#custom-logo'),
      NM: pdfLib.PDFString.of('stamp-orig-1'),
      AP: apDict,
      P: page.ref,
    });
    const stampRef = doc.context.register(stampAnnot);
    page.node.set(pdfLib.PDFName.of('Annots'), doc.context.obj([stampRef]));
    const sourceBytes = await doc.save();

    // Read and save back without edits
    const read = await readNativePdfAnnotations(sourceBytes);
    expect(read.annotations.length).toBe(1);
    expect(read.annotations[0].data.stampName).toBe('#custom-logo');
    expect(read.annotations[0].data.hasCustomAppearance).toBe(true);

    const saved = await writeNativePdfAnnotations(sourceBytes, read.annotations);
    const savedDoc = await pdfLib.PDFDocument.load(saved.bytes);
    const annots = savedDoc.getPage(0).node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray);
    const savedStampDict = annots!.lookup(0, pdfLib.PDFDict);
    const savedApDict = savedStampDict.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict);
    expect(savedApDict).toBeDefined();

    // The saved stream must be preserved
    const savedStream = savedApDict.lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
    expect(savedStream).toBeDefined();
  });
});
