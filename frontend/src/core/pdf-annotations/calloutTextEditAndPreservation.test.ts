import { describe, it, expect } from 'vitest';
import * as pdfLib from 'pdf-lib';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import type { PdfAnnotation } from '../annotations/types';

describe('Callout and FreeText text editing, fidelity, and preservation', () => {
  it('preserves untouched callouts and writes a fresh rich-text appearance after editing', async () => {
    // 1. Construct a synthetic PDF with two FreeText Callout annotations
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([600, 400]);

    // Appearance stream for callout 1
    const apXObject1 = doc.context.stream('q 1 0 0 rg BT /Helv 12 Tf 10 10 Td (Callout 1) Tj ET Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 150, 40],
      Resources: doc.context.obj({}),
    });
    const apRef1 = doc.context.register(apXObject1);

    // Appearance stream for callout 2
    const apXObject2 = doc.context.stream('q 0 0 1 rg BT /Helv 12 Tf 10 10 Td (Callout 2) Tj ET Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 150, 40],
      Resources: doc.context.obj({}),
    });
    const apRef2 = doc.context.register(apXObject2);

    const calloutDict1 = doc.context.obj({
      Type: 'Annot',
      Subtype: 'FreeText',
      IT: 'FreeTextCallout',
      Rect: [10, 100, 200, 240],
      RD: [40, 0, 0, 100],
      Contents: pdfLib.PDFHexString.fromText('Callout 1 Text'),
      RC: pdfLib.PDFHexString.fromText('<?xml version="1.0"?><body xmlns="http://www.w3.org/1999/xhtml"><p><span>Callout 1 Text</span></p></body>'),
      CL: [10, 100, 10, 150, 50, 220],
      NM: pdfLib.PDFString.of('callout-annot-1'),
      AP: doc.context.obj({ N: apRef1 }),
      DA: pdfLib.PDFString.of('/Helv 12 Tf 0 0 0 rg'),
      P: page.ref,
    });
    const calloutRef1 = doc.context.register(calloutDict1);

    const calloutDict2 = doc.context.obj({
      Type: 'Annot',
      Subtype: 'FreeText',
      IT: 'FreeTextCallout',
      Rect: [250, 200, 400, 240],
      Contents: pdfLib.PDFHexString.fromText('Callout 2 Text'),
      RC: pdfLib.PDFHexString.fromText('<?xml version="1.0"?><body xmlns="http://www.w3.org/1999/xhtml"><p><span>Callout 2 Text</span></p></body>'),
      CL: [250, 220, 300, 150, 300, 100],
      NM: pdfLib.PDFString.of('callout-annot-2'),
      AP: doc.context.obj({ N: apRef2 }),
      DA: pdfLib.PDFString.of('/Helv 12 Tf 0 0 0 rg'),
      P: page.ref,
    });
    const calloutRef2 = doc.context.register(calloutDict2);

    page.node.set(pdfLib.PDFName.of('Annots'), doc.context.obj([calloutRef1, calloutRef2]));
    const sourceBytes = await doc.save();

    // 2. Read annotations
    const readResult = await readNativePdfAnnotations(sourceBytes);
    expect(readResult.annotations.length).toBe(2);

    const annot1 = readResult.annotations.find((a) => a.id === 'callout-annot-1')!;
    const annot2 = readResult.annotations.find((a) => a.id === 'callout-annot-2')!;
    expect(annot1).toBeDefined();
    expect(annot2).toBeDefined();
    // /Rect contains the leader; /RD identifies the actual editable text box.
    expect(annot1.rect).toEqual({ x: 50, y: 160, width: 150, height: 40 });
    expect(annot1.data.text).toBe('Callout 1 Text');
    expect(annot2.data.text).toBe('Callout 2 Text');
    expect(annot1.data.nativeInterop?.richText).toBe(true);

    // 3. No-op save: both untouched -> must preserve /RC, /AP, /CL
    const noopResult = await writeNativePdfAnnotations(sourceBytes, [annot1, annot2]);
    const noopDoc = await pdfLib.PDFDocument.load(noopResult.bytes);
    const noopAnnots = noopDoc.getPage(0).node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray)!;
    expect(noopAnnots.size()).toBe(2);

    const noopDict1 = noopAnnots.lookup(0, pdfLib.PDFDict);
    const noopDict2 = noopAnnots.lookup(1, pdfLib.PDFDict);

    expect(noopDict1.get(pdfLib.PDFName.of('RC'))).toBeDefined();
    expect(noopDict1.lookupMaybe(pdfLib.PDFName.of('AP'), pdfLib.PDFDict)).toBeDefined();
    expect(noopDict1.lookupMaybe(pdfLib.PDFName.of('CL'), pdfLib.PDFArray)).toBeDefined();

    expect(noopDict2.get(pdfLib.PDFName.of('RC'))).toBeDefined();
    expect(noopDict2.lookupMaybe(pdfLib.PDFName.of('AP'), pdfLib.PDFDict)).toBeDefined();
    expect(noopDict2.lookupMaybe(pdfLib.PDFName.of('CL'), pdfLib.PDFArray)).toBeDefined();

    // 4. Edit annot1 text, leave annot2 untouched
    const editedAnnot1: PdfAnnotation = {
      ...annot1,
      data: {
        ...annot1.data,
        text: 'User Edited Callout 1',
        nativeInterop: {
          fidelityClass: 'MUTATED_USER_EDIT',
          reason: 'USER_EDITED',
          richText: false,
        },
      },
    };

    const editResult = await writeNativePdfAnnotations(sourceBytes, [editedAnnot1, annot2]);
    const editDoc = await pdfLib.PDFDocument.load(editResult.bytes);
    const editAnnots = editDoc.getPage(0).node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray)!;
    expect(editAnnots.size()).toBe(2);

    const findDictByNM = (arr: pdfLib.PDFArray, nm: string) => {
      for (let i = 0; i < arr.size(); i++) {
        const dict = arr.lookup(i, pdfLib.PDFDict);
        const nameVal = dict.lookupMaybe(pdfLib.PDFName.of('NM'), pdfLib.PDFString, pdfLib.PDFHexString);
        if (nameVal && nameVal.decodeText() === nm) return dict;
      }
      return null;
    };

    const outDict1 = findDictByNM(editAnnots, 'callout-annot-1');
    const outDict2 = findDictByNM(editAnnots, 'callout-annot-2');

    expect(outDict1).not.toBeNull();
    expect(outDict2).not.toBeNull();
    expect(outDict1!.lookup(pdfLib.PDFName.of('RD'), pdfLib.PDFArray).size()).toBe(4);

    // Edited annot1 checks:
    // Contents updated
    const contents1 = outDict1!.lookup(pdfLib.PDFName.of('Contents'), pdfLib.PDFString, pdfLib.PDFHexString);
    expect(contents1.decodeText()).toBe('User Edited Callout 1');
    // Edited rich text and a fresh normal appearance are both present.
    expect(outDict1!.lookupMaybe(pdfLib.PDFName.of('AP'), pdfLib.PDFDict)?.get(pdfLib.PDFName.of('N'))).toBeDefined();
    const editedRichText = outDict1!.lookup(pdfLib.PDFName.of('RC'), pdfLib.PDFHexString).decodeText();
    expect(new DOMParser().parseFromString(editedRichText, 'application/xml').documentElement.textContent).toBe('User Edited Callout 1');
    // Passive geometry /CL preserved
    expect(outDict1!.lookupMaybe(pdfLib.PDFName.of('CL'), pdfLib.PDFArray)).toBeDefined();

    // Untouched annot2 checks:
    // Contents unchanged
    const contents2 = outDict2!.lookup(pdfLib.PDFName.of('Contents'), pdfLib.PDFString, pdfLib.PDFHexString);
    expect(contents2.decodeText()).toBe('Callout 2 Text');
    // /AP preserved
    expect(outDict2!.lookupMaybe(pdfLib.PDFName.of('AP'), pdfLib.PDFDict)).toBeDefined();
    // /RC preserved
    expect(outDict2!.get(pdfLib.PDFName.of('RC'))).toBeDefined();
    // /CL preserved
    expect(outDict2!.lookupMaybe(pdfLib.PDFName.of('CL'), pdfLib.PDFArray)).toBeDefined();
  });

  it('preserves untouched FreeText and generates a new rich-text appearance on edit', async () => {
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([500, 300]);

    const apXObject = doc.context.stream('q BT /Helv 10 Tf (Original Box) Tj ET Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 100, 30],
      Resources: doc.context.obj({}),
    });
    const apRef = doc.context.register(apXObject);

    const boxDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'FreeText',
      Rect: [50, 150, 150, 180],
      Contents: pdfLib.PDFHexString.fromText('Original Box'),
      RC: pdfLib.PDFHexString.fromText('<?xml version="1.0"?><body xmlns="http://www.w3.org/1999/xhtml"><p>Original Box</p></body>'),
      NM: pdfLib.PDFString.of('textbox-1'),
      AP: doc.context.obj({ N: apRef }),
      DA: pdfLib.PDFString.of('/Helv 12 Tf 0 0 0 rg'),
      P: page.ref,
    });
    const boxRef = doc.context.register(boxDict);
    page.node.set(pdfLib.PDFName.of('Annots'), doc.context.obj([boxRef]));
    const sourceBytes = await doc.save();

    const readResult = await readNativePdfAnnotations(sourceBytes);
    expect(readResult.annotations.length).toBe(1);
    const box = readResult.annotations[0];

    // Unedited:
    const unmodRes = await writeNativePdfAnnotations(sourceBytes, [box]);
    const unmodDoc = await pdfLib.PDFDocument.load(unmodRes.bytes);
    const unmodAnnot = unmodDoc.getPage(0).node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray)!.lookup(0, pdfLib.PDFDict);
    expect(unmodAnnot.lookupMaybe(pdfLib.PDFName.of('AP'), pdfLib.PDFDict)).toBeDefined();
    expect(unmodAnnot.get(pdfLib.PDFName.of('RC'))).toBeDefined();

    // Edited:
    const modBox: PdfAnnotation = {
      ...box,
      data: {
        ...box.data,
        text: 'Edited Box Text',
        nativeInterop: {
          fidelityClass: 'MUTATED_USER_EDIT',
          reason: 'USER_EDITED',
          richText: false,
        },
      },
    };
    const modRes = await writeNativePdfAnnotations(sourceBytes, [modBox]);
    const modDoc = await pdfLib.PDFDocument.load(modRes.bytes);
    const modAnnot = modDoc.getPage(0).node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray)!.lookup(0, pdfLib.PDFDict);
    const modContents = modAnnot.lookup(pdfLib.PDFName.of('Contents'), pdfLib.PDFString, pdfLib.PDFHexString);
    expect(modContents.decodeText()).toBe('Edited Box Text');
    expect(modAnnot.lookupMaybe(pdfLib.PDFName.of('AP'), pdfLib.PDFDict)?.get(pdfLib.PDFName.of('N'))).toBeDefined();
    expect(modAnnot.get(pdfLib.PDFName.of('RC'))).toBeDefined();
  });
});
