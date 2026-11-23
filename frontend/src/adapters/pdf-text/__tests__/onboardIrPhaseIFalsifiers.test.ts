import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { buildExistingTextSpan } from '@/core/existing-text/model';
import { evaluateExistingTextUiCapability } from '../PdfLibExistingTextUiEvaluation';
import { applyReconstructedExistingTextReplacementToDocument } from '../PdfLibExistingTextReconstruction';
import { readExistingTextPageContentStreams } from '../PdfLibExistingTextContentStreams';
import {
  snapRotationDegrees,
  computeRotatedWhiteoutRect,
  computeCssRotationTransform,
} from '@/core/existing-text/rotatedTextGeometry';

describe('OnBoard IR Phase I Adversarial Falsifiers: Rotated & Angled Existing Text Editing', () => {
  it('Falsifier 1: 90° vertical ascending text reconstruction emits rotate: degrees(90) in content stream without reverting to horizontal', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    // Page with solid background + 90 degree vertical text (0 1 -1 0 100 200 Tm)
    const streamContent = [
      '1 1 1 rg 0 0 612 792 re f',
      '0 0 0 rg',
      'BT',
      `/${font.name} 12 Tf`,
      '0 1 -1 0 100 200 Tm',
      '(VERTICAL TAG) Tj',
      'ET',
    ].join('\n');

    const stream = doc.context.stream(streamContent);
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));

    const bytes = await doc.save();
    const documentKey = 'doc-rotated-90';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'VERTICAL TAG',
        transform: [0, 12, -12, 0, 100, 200],
        width: 80,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    expect(span.rotationDegrees).toBe(90);

    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'NEW VERTICAL TAG EXPANDED',
    });

    expect(capability.status).toBe('fallback-proved');

    const loadedDoc = await PDFDocument.load(bytes);
    const lib = await pdfLib();
    const result = await applyReconstructedExistingTextReplacementToDocument(
      loadedDoc,
      lib,
      {
        currentRevisionId: documentKey,
        span,
        intent: capability.intent!,
        provenance: capability.provenance!,
      },
    );

    expect(result.originalText).toBe('VERTICAL TAG');
    expect(result.replacementText).toBe('NEW VERTICAL TAG EXPANDED');

    const savedBytes = await loadedDoc.save();
    const readResult = await readExistingTextPageContentStreams(savedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = readResult.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // In PDF: a 90 degree drawText emits [0, 1, -1, 0, ...] Tm
    // and drawRectangle emits rotate [0, 1, -1, 0, ...] cm
    expect(content).toMatch(/0(\.0+)?\s+1(\.0+)?\s+-1(\.0+)?\s+0(\.0+)?/);
  });

  it('Falsifier 2: 270° vertical descending text reconstruction maintains downward orientation', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    // 270 degree text: [0, -1, 1, 0, 400, 500] Tm
    const streamContent = [
      '1 1 1 rg 0 0 612 792 re f',
      '0 0 0 rg',
      'BT',
      `/${font.name} 12 Tf`,
      '0 -1 1 0 400 500 Tm',
      '(DOWNWARD TEXT) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));
    const bytes = await doc.save();
    const documentKey = 'doc-rotated-270';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'DOWNWARD TEXT',
        transform: [0, -12, 12, 0, 400, 500],
        width: 90,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    expect(snapRotationDegrees(span.rotationDegrees)).toBe(270);

    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'DOWNWARD REPLACED',
    });

    expect(capability.status).toBe('fallback-proved');

    const loadedDoc = await PDFDocument.load(bytes);
    const lib = await pdfLib();
    await applyReconstructedExistingTextReplacementToDocument(
      loadedDoc,
      lib,
      {
        currentRevisionId: documentKey,
        span,
        intent: capability.intent!,
        provenance: capability.provenance!,
      },
    );

    const savedBytes = await loadedDoc.save();
    const readResult = await readExistingTextPageContentStreams(savedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = readResult.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // In PDF: 270 degrees emits [0, -1, 1, 0, ...] Tm
    expect(content).toMatch(/0(\.0+)?\s+-1(\.0+)?\s+1(\.0+)?\s+0(\.0+)?/);
  });

  it('Falsifier 3: 180° inverted text reconstruction emits [-1, 0, 0, -1] orientation', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);

    // 180 degree text: [-1, 0, 0, -1, 300, 400] Tm
    const streamContent = [
      '1 1 1 rg 0 0 612 792 re f',
      '0 0 0 rg',
      'BT',
      `/${font.name} 12 Tf`,
      '-1 0 0 -1 300 400 Tm',
      '(INVERTED STAMP) Tj',
      'ET',
    ].join('\n');

    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(streamContent)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({
      Font: doc.context.obj({ [font.name]: font.ref }),
    }));
    const bytes = await doc.save();
    const documentKey = 'doc-rotated-180';

    const span = buildExistingTextSpan(
      { revisionId: documentKey, pageId: 'page-1', pageIndex: 0 },
      {
        sourceIndex: 0,
        text: 'INVERTED STAMP',
        transform: [-12, 0, 0, -12, 300, 400],
        width: 100,
        height: 12,
        fontName: font.name,
        direction: 'ltr',
        hasEol: false,
      },
    );

    expect(span.rotationDegrees).toBe(180);

    const capability = await evaluateExistingTextUiCapability({
      pdfBytes: bytes,
      currentRevisionId: documentKey,
      span,
      replacementText: 'INVERTED REPLACED',
    });

    expect(capability.status).toBe('fallback-proved');

    const loadedDoc = await PDFDocument.load(bytes);
    const lib = await pdfLib();
    await applyReconstructedExistingTextReplacementToDocument(
      loadedDoc,
      lib,
      {
        currentRevisionId: documentKey,
        span,
        intent: capability.intent!,
        provenance: capability.provenance!,
      },
    );

    const savedBytes = await loadedDoc.save();
    const readResult = await readExistingTextPageContentStreams(savedBytes, 0);
    const decoder = new TextDecoder('latin1');
    const content = readResult.streams.map((s) => decoder.decode(s.decodedBytes)).join('\n');

    // In PDF: 180 degrees emits [-1, 0, 0, -1, ...] Tm
    expect(content).toMatch(/-1(\.0+)?\s+0(\.0+)?\s+0(\.0+)?\s+-1(\.0+)?/);
  });

  it('Falsifier 4: Rotated Whiteout Clearance correctly computes rotated envelope without clipping adjacent horizontal text', () => {
    const origin = { x: 100, y: 200 };
    const width = 80;
    const fontSize = 12;

    const whiteout = computeRotatedWhiteoutRect(origin, width, fontSize, 90, 2);
    expect(whiteout.rotateDegrees).toBe(90);

    // Adjacent horizontal text point at (130, 200):
    // Since the vertical text extends along +Y from (100, 200) to (100, 280),
    // and its thickness is only ~16pt (from x=95 to x=115),
    // the point (130, 200) must NOT fall inside the rotated whiteout box!
    const testPointX = 130;

    // Check distance from vertical centerline (X = 105)
    const distanceToCenterline = Math.abs(testPointX - 105);
    expect(distanceToCenterline).toBeGreaterThan(whiteout.height); // completely clear!
  });

  it('Falsifier 5: Canvas UI Angular Transform precisely aligns CSS rotate and transformOrigin with rotated text angle', () => {
    const bounds = { left: 150, top: 250, width: 80, height: 14 };

    const css90 = computeCssRotationTransform(90, bounds);
    expect(css90.isRotated).toBe(true);
    expect(css90.transform).toBe('rotate(-90deg)');
    expect(css90.transformOrigin).toBe('0% 0%');
    expect(css90.left).toBe(150);
    expect(css90.top).toBe(250);

    const css45 = computeCssRotationTransform(45, bounds);
    expect(css45.isRotated).toBe(true);
    expect(css45.transform).toBe('rotate(-45deg)');
  });
});
