import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist';
import { exportRoundTripWriterPdf } from './roundTripPdfExport';
import { extractWriterProjectFromPdf, extractWriterProjectZipFromPdf } from './roundTripPdfImport';
import { readOriginalXref } from '@/core/pdf/incrementalPdfUpdate';
import type { WriterElementV2 } from '../types';

const PAYLOAD_BYTES = 600_000;

/** A multi-page source carrying ~600 KB of incompressible stream data, like a scanned drawing. */
async function makeHeavyPdf(useObjectStreams: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const payload = new Uint8Array(PAYLOAD_BYTES);
  let seed = 0x2545f491;
  for (let index = 0; index < payload.length; index += 1) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    payload[index] = seed & 0xff;
  }
  const blob = doc.context.register(PDFRawStream.of(doc.context.obj({}), payload));
  for (let index = 0; index < 3; index += 1) {
    const page = doc.addPage([595, 842]);
    page.node.set(PDFName.of('PieceInfo'), blob);
    page.drawText(`Source page ${index + 1}`, { x: 72, y: 760, size: 14 });
  }
  return doc.save({ useObjectStreams });
}

function element(pageIndex: number, text: string): WriterElementV2 {
  const now = new Date().toISOString();
  return {
    id: `el_${pageIndex}`,
    documentFingerprint: 'fp-incremental',
    pageIndex,
    type: 'richTextBox',
    rect: { x: 72, y: 600, width: 300, height: 60 },
    plainText: text,
    style: { zIndex: 1, fontSize: 12 },
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };
}

async function pdfJsPageText(bytes: Uint8Array, pageNumber: number): Promise<string> {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  } finally {
    await pdf.destroy();
  }
}

describe.each([
  ['cross-reference table', false, 'table'],
  ['cross-reference stream', true, 'stream'],
] as const)('editable Writer PDF as an incremental update (%s source)', (_label, useObjectStreams, xrefKind) => {
  it('keeps the original as an exact prefix and adds only overlay + project data', async () => {
    const original = await makeHeavyPdf(useObjectStreams);
    expect(readOriginalXref(original)?.kind).toBe(xrefKind);

    const result = await exportRoundTripWriterPdf({
      pdfBytes: original,
      elements: [element(0, 'Overlay on page one'), element(2, 'Overlay on page three')],
      assets: [],
      documentFingerprint: 'fp-incremental',
    });

    expect(result.bytes.subarray(0, original.length)).toEqual(original);
    // The original is no longer stored a second time inside the project.
    expect(result.bytes.length - original.length).toBeLessThan(100_000);

    const zip = await extractWriterProjectZipFromPdf(result.bytes);
    expect(zip).not.toBeNull();

    // Viewers see the flattened overlay on top of the untouched source pages.
    expect(await pdfJsPageText(result.bytes, 1)).toContain('Overlay on page one');
    expect(await pdfJsPageText(result.bytes, 1)).toContain('Source page 1');
    expect(await pdfJsPageText(result.bytes, 3)).toContain('Overlay on page three');
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(3);
  });

  it('restores the exact original bytes and elements on re-open', async () => {
    const original = await makeHeavyPdf(useObjectStreams);
    const result = await exportRoundTripWriterPdf({
      pdfBytes: original,
      elements: [element(1, 'Editable again')],
      assets: [],
      documentFingerprint: 'fp-incremental',
    });

    const imported = await extractWriterProjectFromPdf(result.bytes);
    expect(imported).not.toBeNull();
    expect(imported!.originalPdfBytes).toEqual(original);
    expect(imported!.manifest.source?.originalPdfStorage).toEqual({
      kind: 'host-pdf-prefix',
      byteLength: original.length,
    });
    expect(imported!.elements.map((entry) => entry.plainText)).toEqual(['Editable again']);
  });

  it('does not restore an original prefix that was modified after export', async () => {
    const original = await makeHeavyPdf(useObjectStreams);
    const result = await exportRoundTripWriterPdf({
      pdfBytes: original,
      elements: [element(0, 'x')],
      assets: [],
      documentFingerprint: 'fp-incremental',
    });
    const tampered = result.bytes.slice();
    // Flip one byte inside the opaque payload; the PDF still parses.
    const at = original.indexOf(0x0a, Math.floor(original.length / 2)) + 1;
    tampered[at] ^= 0xff;

    expect(await extractWriterProjectZipFromPdf(tampered)).toBeNull();
  });
});
