import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
import { exportRoundTripWriterPdf, ROUND_TRIP_ATTACHMENT_NAME } from './roundTripPdfExport';
import { extractWriterProjectFromPdf } from './roundTripPdfImport';
import type { WriterElementV2 } from '../types';

// Synthetic test exercises actual pdf-lib serialization, not the private engineering drawing.
// Two pages deliberately reuse the same /NM. Native popup edges are page-scoped.
async function nativeFixture() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([612, 792]);
    const root = doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [40, 40, 60, 60], NM: PDFString.of('reused-name'), Contents: PDFString.of(`note-${i}`), P: page.ref });
    const rootRef = doc.context.register(root);
    const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [70, 40, 170, 140], Parent: rootRef, P: page.ref });
    const popupRef = doc.context.register(popup);
    root.set(PDFName.of('Popup'), popupRef);
    page.node.set(PDFName.of('Annots'), doc.context.obj([rootRef, popupRef]));
  }
  return doc.save();
}
async function nativeGraph(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map(page => {
    const arr = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)!;
    const root = arr.lookup(0, PDFDict);
    const popup = arr.lookup(1, PDFDict);
    return { count: arr.size(), name: root.lookup(PDFName.of('NM'), PDFString).decodeText(),
      text: root.lookup(PDFName.of('Contents'), PDFString).decodeText(),
      pageOwner: root.get(PDFName.of('P'))?.toString() === page.ref.toString() && popup.get(PDFName.of('P'))?.toString() === page.ref.toString(),
      reciprocal: root.get(PDFName.of('Popup'))?.toString() === arr.get(1).toString() && popup.get(PDFName.of('Parent'))?.toString() === arr.get(0).toString(),
      rootRect: root.lookup(PDFName.of('Rect'), PDFArray).toString(), popupRect: popup.lookup(PDFName.of('Rect'), PDFArray).toString() };
  });
}
const fingerprint = 'synthetic-roundtrip-native';
const element: WriterElementV2 = { id: 'writer-1', documentFingerprint: fingerprint, pageIndex: 0, type: 'richTextBox',
  rect: { x: 250, y: 500, width: 180, height: 40 }, plainText: 'Writer content', style: { zIndex: 1, fontSize: 12 },
  locked: false, hidden: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' };

describe('Writer editable PDF native preservation', () => {
  it('retains same-name native annotations and reciprocal popups in appearance and embedded source', async () => {
    const original = await nativeFixture();
    const expected = await nativeGraph(original);
    expect(expected.every(p => p.count === 2 && p.pageOwner && p.reciprocal)).toBe(true);
    const out = await exportRoundTripWriterPdf({ pdfBytes: original, documentFingerprint: fingerprint, elements: [element] });
    expect(await nativeGraph(out.bytes)).toEqual(expected);
    const project = await extractWriterProjectFromPdf(out.bytes);
    expect(project).not.toBeNull();
    expect(await nativeGraph(project!.originalPdfBytes)).toEqual(expected);
    expect(project!.elements[0].plainText).toBe(element.plainText);
  });
  it('does not mistake unrelated ZIP attachments for editable Writer data', async () => {
    const original = await nativeFixture();
    const editable = await exportRoundTripWriterPdf({ pdfBytes: original, documentFingerprint: fingerprint, elements: [element] });
    const doc = await PDFDocument.load(editable.bytes);
    const embedded = doc.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict);
    const names = embedded.lookup(PDFName.of('Names'), PDFArray);
    // A valid ZIP payload under an unrelated filename must be ignored.
    names.set(0, PDFHexString.fromText('unrelated.zip'));
    expect(await extractWriterProjectFromPdf(await doc.save())).toBeNull();
    names.set(0, PDFHexString.fromText(ROUND_TRIP_ATTACHMENT_NAME));
    expect((await extractWriterProjectFromPdf(await doc.save()))?.elements[0].id).toBe(element.id);
  });
});
