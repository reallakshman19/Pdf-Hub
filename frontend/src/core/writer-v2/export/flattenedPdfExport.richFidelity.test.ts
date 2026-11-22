import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib';
import type { WriterElementV2 } from '../types';
import { exportFlattenedWriterPdf } from './flattenedPdfExport';
import { editorStateToPdfBlocks } from './richTextRenderer';

const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DQwPCfgQEADX4CfyHfqZgAAAAASUVORK5CYII=';
const json = (...children: object[]) => JSON.stringify({ root: { type: 'root', children } });
const text = (value: string, format = 0) => ({ type: 'text', text: value, format });
const paragraph = (...children: object[]) => ({ type: 'paragraph', children });
const image = { type: 'inline-image', src: source, width: 40, height: 'inherit' };
const element = (id: string, editorStateJson: string, patch: Partial<WriterElementV2> = {}): WriterElementV2 => ({
  id, documentFingerprint: 'synthetic', pageIndex: 0, type: 'richTextBox', editorStateJson,
  rect: { x: 60, y: 60, width: 400, height: 500 }, plainText: '', style: { zIndex: 1, padding: 8 },
  locked: false, hidden: false, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...patch,
});
async function nativeFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const note = doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [40, 40, 60, 60], NM: PDFString.of('original'), Contents: PDFString.of('native'), P: page.ref });
  const noteRef = doc.context.register(note);
  const popupRef = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [70, 40, 170, 140], Parent: noteRef, P: page.ref }));
  note.set(PDFName.of('Popup'), popupRef);
  page.node.set(PDFName.of('Annots'), doc.context.obj([noteRef, popupRef]));
  return doc.save();
}

describe('rich PDF fidelity — actual pdf-lib serialization', () => {
  it('appends only real table link geometry and retains the original native popup edges', async () => {
    const uri = 'https://example.org/path?q=1';
    const table = { type: 'table', children: [{ type: 'tablerow', children: [{ type: 'tablecell', children: [paragraph({ type: 'link', url: uri, children: [text('link')] })] }] }] };
    const result = await exportFlattenedWriterPdf({ pdfBytes: await nativeFixture(), elements: [element('link', json(table))] });
    const doc = await PDFDocument.load(result.bytes);
    const page = doc.getPage(0);
    const arr = page.node.lookup(PDFName.of('Annots'), PDFArray);
    expect(arr.size()).toBe(3);
    const note = arr.lookup(0, PDFDict), popup = arr.lookup(1, PDFDict), nativeLink = arr.lookup(2, PDFDict);
    expect(note.lookup(PDFName.of('NM'), PDFString).decodeText()).toBe('original');
    expect(note.get(PDFName.of('Popup'))?.toString()).toBe(arr.get(1).toString());
    expect(popup.get(PDFName.of('Parent'))?.toString()).toBe(arr.get(0).toString());
    expect(nativeLink.lookup(PDFName.of('Subtype'), PDFName).toString()).toBe('/Link');
    const action = nativeLink.lookup(PDFName.of('A'), PDFDict);
    expect(action.lookup(PDFName.of('URI'), PDFHexString).decodeText()).toBe(uri);
    const rect = nativeLink.lookup(PDFName.of('Rect'), PDFArray).asRectangle();
    expect(rect.y).toBeGreaterThanOrEqual(60);
    expect(rect.y + rect.height).toBeLessThanOrEqual(560);
  });
  it('retains ordered inline images and actual alpha resources for repeated placement', async () => {
    const state = json(paragraph(text('before'), image, text('after')));
    expect(editorStateToPdfBlocks(state, '').map(block => block.type)).toEqual(['paragraph', 'image', 'paragraph']);
    const result = await exportFlattenedWriterPdf({ pdfBytes: await nativeFixture(), elements: [element('a', state), element('b', state, { rect: { x: 80, y: 300, width: 300, height: 250 } })] });
    const doc = await PDFDocument.load(result.bytes);
    const resources = doc.getPage(0).node.lookup(PDFName.of('Resources'), PDFDict);
    const xobjects = resources.lookup(PDFName.of('XObject'), PDFDict);
    const images = xobjects.entries().map(([, ref]) => doc.context.lookup(ref)).filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.lookup(PDFName.of('Subtype'), PDFName).toString() === '/Image');
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(images.every(object => object.dict.has(PDFName.of('SMask')))).toBe(true);
  });
  it('rejects unsupported font encodings, unsafe URI schemes and malformed rich state', async () => {
    const pdfBytes = await nativeFixture();
    await expect(exportFlattenedWriterPdf({ pdfBytes, elements: [element('unicode', json(paragraph(text('測試'))))] })).rejects.toThrow(/font cannot encode/);
    await expect(exportFlattenedWriterPdf({ pdfBytes, elements: [element('bad-link', json(paragraph({ type: 'link', url: 'javascript:alert(1)', children: [text('link')] })))] })).rejects.toThrow(/HTTP or HTTPS/);
    await expect(exportFlattenedWriterPdf({ pdfBytes, elements: [element('bad-json', '{invalid')] })).rejects.toThrow(/could not be parsed/);
  });
});
