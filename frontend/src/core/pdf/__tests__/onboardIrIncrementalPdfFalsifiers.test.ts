import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist';
import {
  captureIncrementalPdfBaseline,
  readOriginalXref,
} from '../incrementalPdfUpdate';
import { exportRoundTripWriterPdf } from '@/core/writer-v2/export/roundTripPdfExport';
import {
  extractWriterProjectZipFromPdf,
  restoreHostPrefixOriginal,
} from '@/core/writer-v2/export/roundTripPdfImport';
import {
  ORIGINAL_PDF_MEMBER,
  sourcePdfSha256,
} from '@/core/writer-v2/export/projectZip';
import type { WriterElementV2 } from '@/core/writer-v2/types';

async function createClassicTablePdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 650, size: 14, font, color: rgb(0, 0, 0) });
  // pdf-lib creates classic xref tables by default
  return doc.save({ useObjectStreams: false });
}

async function createXrefStreamPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 650, size: 14, font, color: rgb(0, 0, 0) });
  // useObjectStreams: true forces PDF-lib to emit a binary /Type /XRef stream (PDF 1.5+)
  return doc.save({ useObjectStreams: true });
}

function createSampleElement(pageIndex: number, text: string): WriterElementV2 {
  const now = new Date().toISOString();
  return {
    id: `el_${pageIndex}`,
    documentFingerprint: 'fp-incremental',
    pageIndex,
    type: 'richTextBox',
    rect: { x: 72, y: 550, width: 300, height: 60 },
    plainText: text,
    style: { zIndex: 1, fontSize: 12 },
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };
}

const sampleWriterElements: WriterElementV2[] = [
  createSampleElement(0, 'Incremental Annotation'),
];

describe('OnBoard-IR Self-Audit: Incremental PDF Updates (Commit ce82ba96)', () => {
  it('Falsifier 1 (Exact Prefix Byte Identity & Size Bounding): Preserves host PDF bytes as untouched prefix with minimal overhead', async () => {
    const originalBytes = await createClassicTablePdf('Base document content');
    const result = await exportRoundTripWriterPdf({
      pdfBytes: originalBytes,
      documentFingerprint: 'fp-audit-1',
      elements: sampleWriterElements,
      assets: [],
    });

    // 1. Exact byte prefix match
    expect(result.bytes.length).toBeGreaterThan(originalBytes.length);
    const prefix = result.bytes.subarray(0, originalBytes.length);
    for (let i = 0; i < originalBytes.length; i++) {
      expect(prefix[i]).toBe(originalBytes[i]);
    }

    // 2. Size overhead bounding: Real PDFs grow by only ~3-5 KB instead of doubling
    const overheadBytes = result.bytes.length - originalBytes.length;
    expect(overheadBytes).toBeLessThan(8192); // Under 8KB
  });

  it('Falsifier 2 (Classic XRef Table ISO 32000-1 §7.5.6 Specification Audit): Emits compliant xref table and /Prev linkage', async () => {
    const originalBytes = await createClassicTablePdf('Classic XRef Audit');
    const origXref = readOriginalXref(originalBytes);
    expect(origXref).not.toBeNull();
    expect(origXref!.kind).toBe('table');

    const result = await exportRoundTripWriterPdf({
      pdfBytes: originalBytes,
      documentFingerprint: 'fp-audit-2',
      elements: sampleWriterElements,
      assets: [],
    });

    const appendedText = new TextDecoder('latin1').decode(result.bytes.subarray(originalBytes.length));

    // Must start with newline to avoid gluing tokens onto original %%EOF
    expect(appendedText.startsWith('\n')).toBe(true);

    // Must contain /Prev pointing to original xref offset
    expect(appendedText).toContain(`/Prev ${origXref!.offset}`);

    // Must contain trailer with /Size >= origXref.size
    const sizeMatch = /\/Size\s+(\d+)/.exec(appendedText);
    expect(sizeMatch).not.toBeNull();
    expect(Number(sizeMatch![1])).toBeGreaterThanOrEqual(origXref!.size);

    // Must contain valid xref entries (each exactly 20 bytes: 10 digit offset + 5 digit gen + n\r\n)
    const xrefIndex = appendedText.indexOf('xref\n');
    expect(xrefIndex).toBeGreaterThan(-1);
    const trailerIndex = appendedText.indexOf('trailer\n');
    const xrefBody = appendedText.slice(xrefIndex + 5, trailerIndex);
    const lines = xrefBody.split(/\r?\n/).filter(Boolean);
    // Each subsection has header `start count` followed by 20-byte entries
    expect(lines.length).toBeGreaterThan(1);
    const entryLines = lines.filter((l) => /^\d{10}\s\d{5}\s[nf]/.test(l));
    expect(entryLines.length).toBeGreaterThan(0);
    for (const entry of entryLines) {
      expect(entry.length).toBe(18); // 18 chars without \r\n
    }
  });

  it('Falsifier 3 (Binary XRef Stream ISO 32000-1 §7.5.8 Specification Audit): Emits compliant /Type /XRef stream for PDF 1.5+ sources', async () => {
    const originalBytes = await createXrefStreamPdf('XRef Stream Audit');
    const origXref = readOriginalXref(originalBytes);
    expect(origXref).not.toBeNull();
    expect(origXref!.kind).toBe('stream');

    const result = await exportRoundTripWriterPdf({
      pdfBytes: originalBytes,
      documentFingerprint: 'fp-audit-3',
      elements: sampleWriterElements,
      assets: [],
    });

    const appendedText = new TextDecoder('latin1').decode(result.bytes.subarray(originalBytes.length));

    // Must contain /Type /XRef
    expect(appendedText).toContain('/Type /XRef');
    // Must contain /W [1 4 2]
    expect(appendedText).toContain('/W [1 4 2]');
    // Must contain /Prev linking to original xref stream offset
    expect(appendedText).toContain(`/Prev ${origXref!.offset}`);
    // Must contain /Index
    expect(appendedText).toContain('/Index [');

    // PDF.js must be able to load and parse the incrementally-updated document
    const loadingTask = getDocument({ data: result.bytes });
    const pdfDoc = await loadingTask.promise;
    expect(pdfDoc.numPages).toBe(1);
    const page = await pdfDoc.getPage(1);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map((i) => ('str' in i ? i.str : ''));
    expect(strings).toContain('XRef Stream Audit');
    expect(strings).toContain('Incremental Annotation');
  });

  it('Falsifier 4 (Object ID High-Water Mark Anti-Collision): Advances largestObjectNumber past xref.size', async () => {
    const originalBytes = await createClassicTablePdf('Object Collision Test');
    const origXref = readOriginalXref(originalBytes);
    expect(origXref).not.toBeNull();

    const lib = await import('pdf-lib');
    const doc = await lib.PDFDocument.load(originalBytes);

    const baseline = captureIncrementalPdfBaseline(doc, lib as unknown as Parameters<typeof captureIncrementalPdfBaseline>[1], originalBytes);
    expect(baseline).not.toBeNull();

    // Verify context.largestObjectNumber has been advanced to at least xref.size - 1
    expect(doc.context.largestObjectNumber).toBeGreaterThanOrEqual(origXref!.size - 1);

    // Any new object assigned must have an objectNumber >= xref.size
    const newRef = doc.context.nextRef();
    expect(newRef.objectNumber).toBeGreaterThanOrEqual(origXref!.size);
  });

  it('Falsifier 5 (SHA-256 Tamper / External Rewrite Detection & Honest Fallback): Falls back to flattened PDF when prefix is altered', async () => {
    const originalBytes = await createClassicTablePdf('Tamper Detection Document');
    const exportResult = await exportRoundTripWriterPdf({
      pdfBytes: originalBytes,
      documentFingerprint: 'fp-audit-5',
      elements: sampleWriterElements,
      assets: [],
    });

    // 1. Untouched export re-opens with original bytes restored
    const cleanZip = await extractWriterProjectZipFromPdf(exportResult.bytes);
    expect(cleanZip).not.toBeNull();
    const JSZip = (await import('jszip')).default;
    const cleanLoadedZip = await JSZip.loadAsync(cleanZip!);
    const restoredPdf = await cleanLoadedZip.file(ORIGINAL_PDF_MEMBER)?.async('uint8array');
    expect(restoredPdf).toBeDefined();
    expect(restoredPdf!.length).toBe(originalBytes.length);

    // 2. Mutate one byte in the host PDF prefix (simulating external modification)
    const tamperedBytes = new Uint8Array(exportResult.bytes);
    tamperedBytes[15] = (tamperedBytes[15] + 1) % 256;

    // extractWriterProjectZipFromPdf must detect mismatch and return null (honest fallback to flattened PDF)
    const tamperedZip = await extractWriterProjectZipFromPdf(tamperedBytes);
    expect(tamperedZip).toBeNull();
  });

  it('Falsifier 6 (Encrypted Source Safety Fallback): Returns null baseline and falls back to member storage for encrypted PDFs', async () => {
    const originalBytes = await createClassicTablePdf('Encrypted Safety Test');
    const lib = await import('pdf-lib');
    const doc = await lib.PDFDocument.load(originalBytes);

    // Simulate an encrypted PDF by setting trailerInfo.Encrypt
    doc.context.trailerInfo.Encrypt = doc.context.nextRef();

    const baseline = captureIncrementalPdfBaseline(doc, lib as unknown as Parameters<typeof captureIncrementalPdfBaseline>[1], originalBytes);
    expect(baseline).toBeNull();
  });

  it('Falsifier 7 (Missing / Corrupted Trailing XRef Fallback): Safely rejects invalid startxref without crashing', () => {
    // PDF missing startxref
    const invalidPdf1 = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    expect(readOriginalXref(invalidPdf1)).toBeNull();

    // PDF with out-of-bounds startxref offset
    const invalidPdf2 = new TextEncoder().encode('%PDF-1.4\nstartxref\n9999999\n%%EOF\n');
    expect(readOriginalXref(invalidPdf2)).toBeNull();

    // PDF with non-xref content at target offset
    const invalidPdf3 = new TextEncoder().encode('%PDF-1.4\nstartxref\n5\n%%EOF\n');
    expect(readOriginalXref(invalidPdf3)).toBeNull();
  });

  it('Falsifier 8 (Conflicting Declarations Rejection - Fail-Closed): Rejects ZIP with both host-prefix storage and original.pdf member', async () => {
    const originalBytes = await createClassicTablePdf('Conflicting Declarations');
    const originalHash = await sourcePdfSha256(originalBytes);

    // Construct an adversarial ZIP that illegally contains both host-pdf-prefix and original.pdf member
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        schemaVersion: '1.0.0',
        kind: 'pdf-hub-writer-project',
        source: {
          kind: 'imported-pdf',
          hasOriginalPdf: true,
          originalPdfSha256: originalHash,
          originalPdfStorage: {
            kind: 'host-pdf-prefix',
            byteLength: originalBytes.byteLength,
          },
        },
        files: {
          originalPdf: ORIGINAL_PDF_MEMBER,
        },
      }),
    );
    // Intentionally add duplicate original.pdf member
    zip.file(ORIGINAL_PDF_MEMBER, originalBytes);
    const adversarialZipBytes = await zip.generateAsync({ type: 'uint8array' });

    // restoreHostPrefixOriginal must reject conflicting storage declarations
    await expect(
      restoreHostPrefixOriginal(adversarialZipBytes, originalBytes),
    ).rejects.toThrow('Editable PDF stores the original PDF twice with conflicting locations.');
  });
});
