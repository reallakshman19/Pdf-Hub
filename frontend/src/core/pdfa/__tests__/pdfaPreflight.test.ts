import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { runPdfAPreflight } from '../pdfaPreflight';

describe('pdfaPreflight', () => {
  it('flags Standard-14 fonts, missing OutputIntent, XMP, Trailer /ID, JS, and attachments', async () => {
    const doc = await PDFDocument.create();
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const times = await doc.embedFont(StandardFonts.TimesRoman);
    const page = doc.addPage([612, 792]);
    page.drawText('Hello Standard 14', { x: 72, y: 700, font: helv, size: 12 });
    page.drawText('Serif text', { x: 72, y: 680, font: times, size: 12 });
    doc.addJavaScript('init', 'console.println("hi");');
    await doc.attach(new Uint8Array([1, 2, 3]), 'notes.zip', { mimeType: 'application/zip' });

    const bytes = await doc.save();
    const report = await runPdfAPreflight(bytes, 'PDFA_2B', { fileName: 'sample.pdf' });

    expect(report.hasTrailerId).toBe(false);
    expect(report.hasXmpMetadata).toBe(false);
    expect(report.hasOutputIntent).toBe(false);
    expect(report.hasJavaScriptOrActions).toBe(true);
    expect(report.attachments.map((a) => a.name)).toContain('notes.zip');
    expect(report.fonts.filter((f) => f.classification === 'unembedded-standard14-remediable')).toHaveLength(2);
    expect(report.readyWithoutRemediation).toBe(false);
    expect(report.canExportWithRemediation).toBe(true);
  });

  it('blocks unembedded external non-Standard-14 fonts unless fallback substitution is opted in', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const customFontRef = doc.context.register(
      doc.context.obj({
        Type: 'Font',
        Subtype: 'Type1',
        BaseFont: 'FrutigerLT-Bold',
        Encoding: 'WinAnsiEncoding',
      }),
    );
    page.node.setFontDictionary(PDFName.of('FExt'), customFontRef);
    const report = await runPdfAPreflight(await doc.save(), 'PDFA_2B');

    const blocker = report.checks.find((c) => c.id === 'PDFA-FONTS-EXT');
    expect(blocker?.severity).toBe('blocker');
    expect(report.canExportWithRemediation).toBe(false);
  });

  it('allows transparency in PDF/A-2b while blocking alpha transparency in PDF/A-1b', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.drawRectangle({
      x: 50,
      y: 600,
      width: 120,
      height: 40,
      color: rgb(1, 0.9, 0.2),
      opacity: 0.4,
    });
    const bytes = await doc.save();

    const r2b = await runPdfAPreflight(bytes, 'PDFA_2B');
    expect(r2b.hasTransparency).toBe(true);
    expect(r2b.canExportWithRemediation).toBe(true);

    const r1b = await runPdfAPreflight(bytes, 'PDFA_1B');
    expect(r1b.hasTransparency).toBe(true);
    expect(r1b.transparencyPages).toEqual([1]);
    expect(r1b.checks.find((c) => c.id === 'PDFA-TRANSP')?.severity).toBe('blocker');
    expect(r1b.canExportWithRemediation).toBe(false);
  });

  it('detects unembedded fonts inside nested Form XObjects and encryption markers', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const xFont = doc.context.register(
      doc.context.obj({
        Type: 'Font',
        Subtype: 'Type1',
        BaseFont: 'Courier',
        Encoding: 'WinAnsiEncoding',
      }),
    );
    const formStream = doc.context.flateStream('q Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 100, 100],
      Resources: { Font: { F9: xFont } },
    });
    const formRef = doc.context.register(formStream);
    page.node.setXObject(PDFName.of('Fm1'), formRef);

    const bytes = await doc.save();
    const report = await runPdfAPreflight(bytes, 'PDFA_2B');
    expect(report.fonts.some((f) => f.baseFont === 'Courier' && f.pages.includes(1))).toBe(true);

    // Mark an /Encrypt trailer dictionary cleanly to test encryption gate
    const encDoc = await PDFDocument.load(bytes);
    const encRef = encDoc.context.register(encDoc.context.obj({ Filter: 'Standard', V: 2, R: 3, P: -4 }));
    encDoc.context.trailerInfo.Encrypt = encRef;
    const encReport = await runPdfAPreflight(await encDoc.save(), 'PDFA_2B');
    expect(encReport.isEncrypted).toBe(true);
    expect(encReport.checks.find((c) => c.id === 'PDFA-ENC')?.severity).toBe('blocker');
    expect(encReport.canExportWithRemediation).toBe(false);
  });
});
