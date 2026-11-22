import { describe, expect, it } from 'vitest';
import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, PDFString,
  decodePDFRawStream, rgb,
} from 'pdf-lib';
import { flattenNativePdfAnnotations } from './flattenNativePdfAnnotations';

async function nativeFixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 400]);
  // Existing drawing vectors must not be rasterized or erased by export.
  page.drawRectangle({ x: 20, y: 50, width: 180, height: 70, color: rgb(1, 0, 0) });

  const stampAp = pdf.context.register(pdf.context.flateStream(
    'q 0 0.8 0 rg 0 0 80 30 re f Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 80, 30], Resources: {} },
  ));
  const textAp = pdf.context.register(pdf.context.flateStream(
    'q BT /F1 12 Tf 0 0 Td (Original) Tj ET Q',
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 150, 50], Resources: {} },
  ));

  const stamp = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Stamp', P: page.ref,
    Rect: [20, 180, 100, 210], NM: PDFString.of('imported-stamp'),
    AP: { N: stampAp },
  }));
  const richText = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'FreeText', IT: 'FreeTextCallout', P: page.ref,
    Rect: [100, 250, 250, 300], NM: PDFString.of('imported-freetext'),
    Contents: PDFString.of('Original'),
    RC: PDFString.of('<body><span style="color:#f00">Original</span></body>'),
    AP: { N: textAp },
  }));
  const popup = pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Popup', Parent: richText, P: page.ref,
    Rect: [100, 300, 230, 360],
  }));
  page.node.set(PDFName.of('Annots'), pdf.context.obj([stamp, richText, popup]));
  return pdf.save();
}

describe('native /AP vector flattened export', () => {
  it('removes annotation identities but embeds original form resources as page vectors', async () => {
    const source = await nativeFixture();
    const pdf = await PDFDocument.load(await flattenNativePdfAnnotations(source));
    const page = pdf.getPage(0);

    expect(page.node.get(PDFName.of('Annots'))).toBeUndefined();
    const resources = page.node.lookup(PDFName.of('Resources'), PDFDict);
    const forms = resources.lookup(PDFName.of('XObject'), PDFDict);
    expect(forms.keys()).toHaveLength(2);

    const embeddedStreams = forms.keys().map((name) => forms.lookup(name, PDFStream));
    const decoded = embeddedStreams.map((stream) =>
      new TextDecoder().decode(decodePDFRawStream(stream as PDFRawStream).decode()),
    );
    expect(decoded).toContain('q 0 0.8 0 rg 0 0 80 30 re f Q');
    expect(decoded).toContain('q BT /F1 12 Tf 0 0 Td (Original) Tj ET Q');

    const contents = page.node.lookup(PDFName.of('Contents'), PDFArray);
    const commands = Array.from({ length: contents.size() }, (_, index) =>
      new TextDecoder().decode(decodePDFRawStream(contents.lookup(index, PDFStream) as PDFRawStream).decode()),
    ).join('\n');
    expect(commands).toContain(' re');
    expect(commands).toContain(' Do');
  });

  it('keeps the visible appearance state of a stamp without retaining a clickable /Annot', async () => {
    const source = await nativeFixture();
    const doc = await PDFDocument.load(source);
    const page = doc.getPage(0);
    const stamp = page.node.lookup(PDFName.of('Annots'), PDFArray).lookup(0, PDFDict);
    const firstForm = stamp.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'));
    stamp.set(PDFName.of('AP'), doc.context.obj({
      N: { Off: firstForm, Approved: firstForm },
    }));
    stamp.set(PDFName.of('AS'), PDFName.of('Approved'));
    const exported = await PDFDocument.load(
      await flattenNativePdfAnnotations(await doc.save()),
    );
    expect(exported.getPage(0).node.get(PDFName.of('Annots'))).toBeUndefined();
    const resources = exported.getPage(0).node.lookup(PDFName.of('Resources'), PDFDict);
    expect(resources.lookup(PDFName.of('XObject'), PDFDict).keys()).toHaveLength(2);
  });
});
