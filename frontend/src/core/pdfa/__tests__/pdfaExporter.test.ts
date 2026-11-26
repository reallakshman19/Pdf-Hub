import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
  rgb,
} from 'pdf-lib';
import { exportPdfA, PdfABlockerError } from '../pdfaExporter';
import {
  createDefaultPdfAMetadata,
  createDefaultPdfARemediationOptions,
} from '../types';
import { inspectIccProfileHeader } from '../srgbIccProfile';
import { parsePdfAXmpSummary } from '../xmpMetadata';
import { exportFlattenedWriterPdf } from '@/core/writer-v2/export/flattenedPdfExport';
import { generateSearchablePdf } from '@/core/ocr/export/searchablePdfGenerator';

async function buildSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const courier = await doc.embedFont(StandardFonts.Courier);

  const page = doc.addPage([612, 792]);
  page.drawText('PDF/A Sample Line 1', { x: 72, y: 720, font: helv, size: 12 });
  page.drawText('Times Bold Header', { x: 72, y: 700, font: timesBold, size: 14 });
  page.drawText('Courier Code', { x: 72, y: 680, font: courier, size: 10 });

  // Annotation lacking /F and non-printable link
  const linkRef = doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [72, 650, 200, 670],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: 'https://example.com' },
    }),
  );
  page.node.set(PDFName.of('Annots'), doc.context.obj([linkRef]));
  doc.addJavaScript('open', 'app.alert("test");');
  await doc.attach(new Uint8Array([9, 8, 7]), 'project.zip', { mimeType: 'application/zip' });

  return doc.save();
}

describe('pdfaExporter', () => {
  it('remediates and self-verifies PDF/A-2b with embedded fonts, ICC OutputIntent, XMP, and Trailer /ID', async () => {
    const srcBytes = await buildSamplePdf();
    const meta = createDefaultPdfAMetadata('engineering.pdf', {
      title: 'Engineering Spec Rev A',
      author: 'QA Engineer',
      subject: 'Archival Release',
      keywords: 'iso-19005, pdfa-2b',
    });
    const options = createDefaultPdfARemediationOptions('PDFA_2B', meta);

    const result = await exportPdfA({
      pdfBytes: srcBytes,
      options,
      fileName: 'engineering.pdf',
    });

    expect(result.certificate.passed).toBe(true);
    expect(result.certificate.remainingBlockers).toHaveLength(0);
    expect(result.certificate.remainingWarnings).toHaveLength(0);
    expect(result.postExportReport.readyWithoutRemediation).toBe(true);
    expect(result.postExportReport.hasOutputIntent).toBe(true);
    expect(result.postExportReport.hasTrailerId).toBe(true);
    expect(result.postExportReport.hasJavaScriptOrActions).toBe(false);
    expect(result.postExportReport.attachments).toHaveLength(0);
    expect(result.postExportReport.fonts.every((f) => f.embedded)).toBe(true);

    // Inspect low-level PDF objects directly
    const outDoc = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(outDoc.context.trailerInfo.ID).toBeInstanceOf(PDFArray);

    const xmpStream = outDoc.catalog.lookup(PDFName.of('Metadata')) as PDFStream;
    expect(xmpStream.dict.get(PDFName.of('Filter'))).toBeUndefined();
    const xmpText = new TextDecoder('utf-8').decode(xmpStream.getContents());
    const xmp = parsePdfAXmpSummary(xmpText);
    expect(xmp.pdfaPart).toBe(2);
    expect(xmp.pdfaConformance).toBe('B');
    expect(xmp.title).toBe('Engineering Spec Rev A');
    expect(xmp.author).toBe('QA Engineer');

    const intents = outDoc.catalog.lookup(PDFName.of('OutputIntents'), PDFArray);
    const iccRaw = intents.lookup(0, PDFDict).lookup(PDFName.of('DestOutputProfile')) as PDFRawStream;
    const iccSummary = inspectIccProfileHeader(decodePDFRawStream(iccRaw).decode());
    expect(iccSummary.valid).toBe(true);
    expect(iccSummary.componentCount).toBe(3);

    // Surviving Link annotation should have Print flag (/F 4) set
    const annots = outDoc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
    expect(annots.lookup(0, PDFDict).get(PDFName.of('F'))?.toString()).toBe('4');
  });

  it('produces ToUnicode CMaps across all fonts for PDF/A-2u compliance', async () => {
    const srcBytes = await buildSamplePdf();
    const options = createDefaultPdfARemediationOptions(
      'PDFA_2U',
      createDefaultPdfAMetadata('unicode.pdf'),
    );
    const result = await exportPdfA({ pdfBytes: srcBytes, options });
    expect(result.certificate.passed).toBe(true);
    expect(result.postExportReport.declaredPdfAConformance).toBe('U');
    expect(result.postExportReport.fonts.every((f) => f.embedded && f.hasToUnicode)).toBe(true);
  });

  it('registers Catalog /AF & /AFRelationship attachments for PDF/A-3b', async () => {
    const srcBytes = await buildSamplePdf();
    const options = createDefaultPdfARemediationOptions(
      'PDFA_3B',
      createDefaultPdfAMetadata('bundle.pdf'),
    );
    const result = await exportPdfA({ pdfBytes: srcBytes, options });
    expect(result.certificate.passed).toBe(true);
    expect(result.postExportReport.declaredPdfAPart).toBe(3);
    expect(result.postExportReport.attachments.length).toBeGreaterThanOrEqual(2);
    expect(result.postExportReport.attachments.every((a) => a.hasAfRelationship && a.mimeType)).toBe(true);

    const outDoc = await PDFDocument.load(result.bytes, { updateMetadata: false });
    const af = outDoc.catalog.lookup(PDFName.of('AF'), PDFArray);
    expect(af.size()).toBeGreaterThanOrEqual(2);
  });

  it('emits %PDF-1.4 with classic xref for opaque PDF/A-1b and blocks unflattened transparency', async () => {
    const opaqueDoc = await PDFDocument.create();
    const font = await opaqueDoc.embedFont(StandardFonts.Helvetica);
    const page = opaqueDoc.addPage([612, 792]);
    page.drawText('Legacy PDF/A-1b', { x: 72, y: 700, font, size: 12 });

    const r1b = await exportPdfA({
      pdfBytes: await opaqueDoc.save(),
      options: createDefaultPdfARemediationOptions('PDFA_1B', createDefaultPdfAMetadata('legacy.pdf')),
    });
    expect(r1b.certificate.passed).toBe(true);
    expect(new TextDecoder('latin1').decode(r1b.bytes.subarray(0, 8))).toBe('%PDF-1.4');
    expect(r1b.postExportReport.usesObjectStreams).toBe(false);

    // Alpha transparency must fail closed on PDF/A-1b
    const transpDoc = await PDFDocument.create();
    transpDoc.addPage([612, 792]).drawRectangle({
      x: 50,
      y: 600,
      width: 100,
      height: 50,
      color: rgb(0.2, 0.4, 0.9),
      opacity: 0.5,
    });
    await expect(
      exportPdfA({
        pdfBytes: await transpDoc.save(),
        options: createDefaultPdfARemediationOptions('PDFA_1B'),
      }),
    ).rejects.toThrow(PdfABlockerError);
  });

  it('embeds Writer V2 & OCR searchable text via fontkit when archivalFontMode is enabled', async () => {
    const base = await PDFDocument.create();
    base.addPage([612, 792]);
    const baseBytes = await base.save();

    const flattened = await exportFlattenedWriterPdf({
      pdfBytes: baseBytes,
      archivalFontMode: true,
      elements: [
        {
          id: 'w1',
          documentFingerprint: 'doc-a',
          pageIndex: 0,
          type: 'richTextBox',
          rect: { x: 72, y: 650, width: 220, height: 60 },
          plainText: 'Archival Writer Café',
          style: { zIndex: 1, fontSize: 12 },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          locked: false,
          hidden: false,
        },
      ],
    });

    const ocrPdf = await generateSearchablePdf({
      pdfBytes: flattened.bytes,
      options: { archivalFontMode: true },
      ocrResult: {
        documentFingerprint: 'doc-a',
        createdAt: '2026-01-01T00:00:00Z',
        engineId: 'tesseract',
        profileId: 'default',
        diagnostics: [],
        pages: [
          {
            pageNumber: 1,
            pageIndex: 0,
            status: 'complete',
            width: 612,
            height: 792,
            geometryProvenance: 'pdf-user-space-v2',
            words: [
              { id: 'w-ocr', pageIndex: 0, text: 'Scanned', normalizedText: 'scanned', confidence: 0.98, bbox: { x: 72, y: 500, width: 60, height: 14 } },
            ],
            lines: [],
            blocks: [],
          },
        ],
      },
    });

    const exported = await exportPdfA({
      pdfBytes: ocrPdf.bytes,
      options: createDefaultPdfARemediationOptions('PDFA_2U', createDefaultPdfAMetadata('ocr-writer.pdf')),
    });
    expect(exported.certificate.passed).toBe(true);
    expect(exported.postExportReport.fonts.every((f) => f.embedded && f.hasToUnicode)).toBe(true);
  });
});
