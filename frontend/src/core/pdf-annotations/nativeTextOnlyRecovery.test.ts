import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';

async function richSource() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = pdf.context.register(pdf.context.obj({
    Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica',
  }));
  const form = pdf.context.register(pdf.context.flateStream(
    'q 0 0.7 0 rg 0 0 150 40 re f Q q BT /F1 9 Tf 4 4 Td (Imported rich callout) Tj ET Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 150, 40],
      Resources: { Font: { F1: font } } },
  ));
  const annot = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'FreeText', IT: 'FreeTextCallout',
    NM: PDFString.of('imported-rich-callout'), P: page.ref,
    Rect: [60, 520, 210, 560], RD: [30, 0, 0, 0],
    CL: [60, 540, 90, 540], Contents: PDFString.of('Imported rich callout'),
    RC: PDFString.of('<body><p>Imported rich callout</p></body>'),
    DA: PDFString.of('/Helv 14 Tf 0 g'), AP: { N: form },
  }));
  page.node.set(PDFName.of('Annots'), pdf.context.obj([annot]));
  return pdf.save();
}

async function edited() {
  const bytes = await richSource();
  const source = (await readNativePdfAnnotations(bytes)).annotations[0];
  const revision = await FileAdapter.hashBytes(bytes);
  const edit = {
    ...source,
    data: {
      ...source.data,
      text: 'Updated native callout',
      nativeInterop: {
        ...source.data.nativeInterop!,
        fidelityClass: 'MUTATED_USER_EDIT' as const,
        reason: 'USER_EDITED' as const,
      },
      nativeEditProvenance: {
        sourceRevision: revision,
        sourceRef: source.data.nativeSourceRef!,
        commandId: 'user-text-edit',
        fields: ['text' as const],
      },
    },
  };
  return { bytes, source, edit };
}

describe('native imported rich text source-only editing', () => {
  it('rebuilds native /AP using unchanged /Rect, /RD and /CL without treating defaults as style edits', async () => {
    const { bytes, edit } = await edited();
    const output = await writeNativePdfAnnotations(bytes, [edit], {
      replaceManagedAnnotations: true,
    });
    const saved = await PDFDocument.load(output.bytes);
    const annots = saved.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    const dict = annots.lookup(0, PDFDict);
    expect(dict.lookupMaybe(PDFName.of('Contents'), PDFString, PDFHexString)?.decodeText())
      .toBe('Updated native callout');
    expect(dict.lookupMaybe(PDFName.of('RC'), PDFString, PDFHexString)?.decodeText())
      .toContain('Updated native callout');
    expect(dict.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N')))
      .toBeDefined();
    const original = await PDFDocument.load(bytes);
    const source = original.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
      .lookup(0, PDFDict);
    for (const key of ['Rect', 'RD', 'CL', 'DA', 'IT']) {
      expect(dict.get(PDFName.of(key))?.toString()).toBe(source.get(PDFName.of(key))?.toString());
    }
  });

  it('rejects simultaneous geometry and rich-text edits without silently stretching source artwork', async () => {
    const { bytes, edit } = await edited();
    const moved = { ...edit, rect: { ...edit.rect, x: edit.rect.x + 12 } };
    await expect(writeNativePdfAnnotations(bytes, [moved], {
      replaceManagedAnnotations: true,
    })).rejects.toThrow(/geometry or style changed together with the rich text/);
  });
});
