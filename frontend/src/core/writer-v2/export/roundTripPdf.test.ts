import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { exportRoundTripWriterPdf } from './roundTripPdfExport';
import { extractWriterProjectFromPdf } from './roundTripPdfImport';
import type { WriterElementV2 } from '../types';

async function makeBlankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
}

function makeElement(): WriterElementV2 {
  const now = new Date().toISOString();
  return {
    id: 'el_roundtrip_1',
    documentFingerprint: 'fp-roundtrip',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 36, y: 720, width: 200, height: 60 },
    plainText: 'Hello round trip',
    style: { zIndex: 1, fontSize: 12 },
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };
}

describe('round-trip editable PDF (Option C)', () => {
  it('embeds the editable project and restores it on re-open', async () => {
    const pdfBytes = await makeBlankPdf();
    const element = makeElement();

    const result = await exportRoundTripWriterPdf({
      pdfBytes,
      elements: [element],
      assets: [],
      documentFingerprint: 'fp-roundtrip',
    });

    // Output is a valid, loadable PDF.
    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(1);
    expect(result.elementCount).toBe(1);

    // The editable layer can be detected and extracted back.
    const imported = await extractWriterProjectFromPdf(result.bytes);
    expect(imported).not.toBeNull();
    expect(imported!.manifest.documentFingerprint).toBe('fp-roundtrip');
    expect(imported!.elements).toHaveLength(1);
    expect(imported!.elements[0].id).toBe('el_roundtrip_1');
    expect(imported!.elements[0].plainText).toBe('Hello round trip');
  });

  it('returns null for a plain PDF with no editable layer', async () => {
    const pdfBytes = await makeBlankPdf();
    const imported = await extractWriterProjectFromPdf(pdfBytes);
    expect(imported).toBeNull();
  });
});
