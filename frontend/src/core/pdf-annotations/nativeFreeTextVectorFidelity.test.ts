import { describe, expect, it } from 'vitest';
import * as pdfLib from 'pdf-lib';
import { attachNativeFreeTextAppearance } from './nativeFreeTextAppearance';
import type { PdfAnnotation } from '@/core/annotations/types';

describe('native FreeText and Callout vector AP generator fidelity', () => {
  it('parses rgb(), rgba(), and CSS named colors without error', async () => {
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const rect: [number, number, number, number] = [20, 20, 200, 100];
    const dict = doc.context.obj({
      Type: 'Annot', Subtype: 'FreeText', Rect: rect, P: page.ref,
      Contents: pdfLib.PDFString.of('Colored text'),
      RC: pdfLib.PDFHexString.fromText(
        '<body xmlns="http://www.w3.org/1999/xhtml"><p style="color: rgb(255, 0, 0)">Red</p><p style="color: blue">Blue</p><p style="color: rgba(0, 128, 0, 0.8)">Green</p></body>'
      ),
    });
    const annotation: PdfAnnotation = {
      id: 'test-color-annot', type: 'textbox', pageNumber: 1,
      rect: { x: 20, y: 200, width: 180, height: 80 },
      data: { text: 'Colored text', fontSize: 12 },
      createdAt: 1, updatedAt: 1,
    };
    await attachNativeFreeTextAppearance(
      doc, dict, annotation, rect,
      { r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, 1, 1, pdfLib
    );
    const ap = dict.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict);
    expect(ap?.get(pdfLib.PDFName.of('N'))).toBeDefined();
  });

  it('maps web and system fonts (Calibri, Segoe UI, Roboto, Consolas) to standard PDF fonts without error', async () => {
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const rect: [number, number, number, number] = [20, 20, 200, 100];
    const dict = doc.context.obj({
      Type: 'Annot', Subtype: 'FreeText', Rect: rect, P: page.ref,
      Contents: pdfLib.PDFString.of('Font test'),
      RC: pdfLib.PDFHexString.fromText(
        '<body xmlns="http://www.w3.org/1999/xhtml">' +
        '<p style="font-family: Calibri, sans-serif">Calibri</p>' +
        '<p style="font-family: \'Segoe UI\', sans-serif">Segoe</p>' +
        '<p style="font-family: Consolas, monospace">Consolas</p>' +
        '<p style="font-family: Georgia, serif">Georgia</p>' +
        '<p style="font-family: UnknownForeignFont">Fallback</p>' +
        '</body>'
      ),
    });
    const annotation: PdfAnnotation = {
      id: 'test-fonts-annot', type: 'textbox', pageNumber: 1,
      rect: { x: 20, y: 200, width: 180, height: 80 },
      data: { text: 'Font test', fontSize: 11 },
      createdAt: 1, updatedAt: 1,
    };
    await attachNativeFreeTextAppearance(
      doc, dict, annotation, rect,
      { r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, 1, 1, pdfLib
    );
    const ap = dict.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict);
    expect(ap?.get(pdfLib.PDFName.of('N'))).toBeDefined();
  });

  it('gracefully clips overflowing text instead of throwing an unhandled error', async () => {
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([300, 300]);
    // Tiny box with long text
    const rect: [number, number, number, number] = [20, 20, 40, 28];
    const longText = 'This is an excessively long text that definitely cannot fit in a 20x8 pt rectangle at normal font sizes.';
    const dict = doc.context.obj({
      Type: 'Annot', Subtype: 'FreeText', Rect: rect, P: page.ref,
      Contents: pdfLib.PDFString.of(longText),
    });
    const annotation: PdfAnnotation = {
      id: 'test-overflow-annot', type: 'textbox', pageNumber: 1,
      rect: { x: 20, y: 272, width: 20, height: 8 },
      data: { text: longText, fontSize: 14 },
      createdAt: 1, updatedAt: 1,
    };
    // Must not throw:
    await expect(attachNativeFreeTextAppearance(
      doc, dict, annotation, rect,
      { r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, 1, 1, pdfLib
    )).resolves.not.toThrow();
    const ap = dict.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict);
    expect(ap?.get(pdfLib.PDFName.of('N'))).toBeDefined();
  });

  it.each([
    ['/OpenArrow', 'OpenArrow'],
    ['/ClosedArrow', 'ClosedArrow'],
    ['/Circle', 'Circle'],
    ['/Square', 'Square'],
    ['/Slash', 'Slash'],
    ['/Diamond', 'Diamond'],
    ['/None', 'None'],
  ] as const)('renders callout leader ending %s into vector commands without error', async (endingPdfName, label) => {
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const rect: [number, number, number, number] = [50, 50, 250, 150];
    const dict = doc.context.obj({
      Type: 'Annot', Subtype: 'FreeText', IT: 'FreeTextCallout',
      Rect: rect, P: page.ref,
      Contents: pdfLib.PDFString.of(`Callout with ${label}`),
      CL: [60, 60, 100, 100, 150, 100],
      LE: pdfLib.PDFName.of(endingPdfName.replace('/', '')),
    });
    const annotation: PdfAnnotation = {
      id: `callout-${label}`, type: 'callout', pageNumber: 1,
      rect: { x: 50, y: 250, width: 200, height: 100 },
      data: {
        text: `Callout with ${label}`,
        fontSize: 12,
        anchor: { x: 60, y: 340 },
        knee: { x: 100, y: 300 },
      },
      createdAt: 1, updatedAt: 1,
    };
    await attachNativeFreeTextAppearance(
      doc, dict, annotation, rect,
      { r: 0.8, g: 0.1, b: 0.1 }, { r: 1, g: 1, b: 1 }, 1, 1.5, pdfLib
    );
    const ap = dict.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict);
    expect(ap?.get(pdfLib.PDFName.of('N'))).toBeDefined();

    // Verify stream content contains vector operators
    const rawStream = ap!.lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream) as pdfLib.PDFRawStream;
    const content = new TextDecoder().decode(pdfLib.decodePDFRawStream(rawStream).decode());
    expect(content).toContain('RG'); // Stroke color
    expect(content).toContain('BT'); // Text begin
    expect(content).toContain('ET'); // Text end

    if (endingPdfName === '/ClosedArrow') {
      expect(content).toContain('h B');
    } else if (endingPdfName === '/Circle') {
      expect(content).toContain(' c\n');
      expect(content).toContain('h B');
    } else if (endingPdfName === '/Square') {
      expect(content).toContain('re h B');
    } else if (endingPdfName === '/Slash') {
      expect(content).toContain(' l S');
    } else if (endingPdfName === '/Diamond') {
      expect(content).toContain('h B');
    }
  });
});
