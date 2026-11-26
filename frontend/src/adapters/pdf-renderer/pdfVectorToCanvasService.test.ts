import { afterEach, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import { portPdfPageVectorsToAnnotations } from './pdfVectorToCanvasService';
import { extractFullXmlBuilderModel } from '@/core/pipeline-geometry/pipelineModelAggregator';
import { buildVolumetricPipingScene } from '@/core/cad-3d/pipingVolumeBuilder';

const openedDocs: PDFDocumentProxy[] = [];

afterEach(async () => {
  while (openedDocs.length > 0) {
    const doc = openedDocs.pop();
    if (doc) await doc.destroy();
  }
});

async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  openedDocs.push(doc);
  return doc;
}

describe('pdfVectorToCanvasService end-to-end (Layer 1 -> Layer 2 -> Layer 3 -> 3D Piping)', () => {
  it('ports an L-shaped vector pipe + branch tag from a real PDF into 3D Piping & CAESAR II XML tables', async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([400, 300]);

    // Draw L-shaped vector pipe run (view space: (72,100)->(216,100)->(216,172))
    page.drawLine({
      start: { x: 72, y: 200 },
      end: { x: 216, y: 200 },
      thickness: 2.5,
      color: rgb(0, 0.35, 0.85),
    });
    page.drawLine({
      start: { x: 216, y: 200 },
      end: { x: 216, y: 128 },
      thickness: 2.5,
      color: rgb(0, 0.35, 0.85),
    });

    // Nearby piping tag label directly above the horizontal run
    page.drawText('4"-P-202-CS', {
      x: 115,
      y: 208,
      size: 10,
      font,
    });

    // Distractor outside ROI region
    page.drawLine({
      start: { x: 320, y: 30 },
      end: { x: 380, y: 30 },
      thickness: 1.5,
    });

    const bytes = await pdfDoc.save();
    const jsDoc = await openPdf(bytes);
    const jsPage = await jsDoc.getPage(1);

    const ported = await portPdfPageVectorsToAnnotations(jsPage, {
      mode: 'pipe',
      calibration: { scaleRatio: 100, unit: 'mm', precision: 0 },
      extract: {
        regionRect: { x: 50, y: 70, width: 200, height: 140 },
      },
    });

    expect(ported.isRasterOnlyLikely).toBe(false);
    expect(ported.stats.polylinesCreated).toBe(1);
    expect(ported.stats.linesCreated).toBe(0);
    expect(ported.attachedBranchCount).toBe(1);

    const pipeAnn = ported.annotations.find((a) => a.type === 'perimeter-takeoff');
    expect(pipeAnn).toBeDefined();
    expect(pipeAnn?.data.coordinateSpace).toBe('page');
    expect(pipeAnn?.data.isPipeRun).toBe(true);
    expect(pipeAnn?.data.branchName).toBe('4"-P-202-CS');
    expect(pipeAnn?.data.points).toHaveLength(6);

    // Pipe straight into Layer 3 CAESAR II 5-table extractor & Volumetric 3D Extrusion
    const xmlModel = extractFullXmlBuilderModel(
      ported.annotations,
      () => ({ scaleRatio: 100, unit: 'mm', precision: 0 }),
    );
    expect(xmlModel.coordinateRows).toHaveLength(3);
    expect(xmlModel.coordinateRows[0].branchName).toBe('4"-P-202-CS');
    // Segment 1 length: 144pt = 2 inches * 100 = 5080 mm; Segment 2: 72pt = 2540 mm
    expect(xmlModel.coordinateRows[0].lengthToNextMm).toBeCloseTo(5080, -1);
    expect(xmlModel.coordinateRows[1].lengthToNextMm).toBeCloseTo(2540, -1);

    const scene3d = buildVolumetricPipingScene(xmlModel);
    expect(scene3d.parts.some((p) => p.kind === 'pipe_segment')).toBe(true);
    expect(scene3d.elbowCount).toBe(1);
    expect(scene3d.totalPipeLengthMm).toBeGreaterThan(7000);

    jsPage.cleanup();
  });

  it('flags raster-only PDFs cleanly without emitting bogus vector annotations', async () => {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]);
    const embedded = await pdfDoc.embedPng(pngBytes);
    page.drawImage(embedded, { x: 0, y: 0, width: 200, height: 200 });

    const bytes = await pdfDoc.save();
    const jsDoc = await openPdf(bytes);
    const jsPage = await jsDoc.getPage(1);

    const ported = await portPdfPageVectorsToAnnotations(jsPage, { mode: 'pipe' });
    expect(ported.isRasterOnlyLikely).toBe(true);
    expect(ported.imageXObjectCount).toBe(1);
    expect(ported.annotations).toHaveLength(0);

    jsPage.cleanup();
  });
});
