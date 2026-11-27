import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { convertPdfVectorsToAnnotations } from '../pdfToCanvasAnnotations';
import type { CadPageVectorExtractResult } from '../types';
import { writeNativePdfAnnotations } from '../../pdf-annotations/nativeAnnotationWriter';
import { readNativePdfAnnotations } from '../../pdf-annotations/nativeAnnotationReader';
import type { PdfAnnotation } from '../../annotations/types';

function makeIdFactory(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe('convertPdfVectorsToAnnotations & ISO 32000 PolyLine round-trip (Layer 2)', () => {
  it('stitches connected pipe segments into page-space polyline annotations with calibration and layer info', () => {
    const extract: CadPageVectorExtractResult = {
      imageXObjectCount: 0,
      isRasterOnlyLikely: false,
      layersDetected: ['P-101', 'A-WALL'],
      skippedOutOfRegionCount: 0,
      geometry: {
        pageNumber: 1,
        pageWidth: 612,
        pageHeight: 792,
        totalExtractedSegments: 3,
        lines: [
          {
            id: 's1',
            start: { x: 40, y: 100 },
            end: { x: 140, y: 100 },
            length: 100,
            strokeColor: '#0066cc',
            strokeWidth: 2,
            layerName: 'P-101',
          },
          {
            id: 's2',
            start: { x: 140.4, y: 100.2 }, // within snapEpsilon
            end: { x: 140.4, y: 180 },
            length: 79.8,
            strokeColor: '#0066cc',
            strokeWidth: 2,
            layerName: 'P-101',
          },
          {
            id: 's3',
            start: { x: 20, y: 40 },
            end: { x: 90, y: 40 },
            length: 70,
            strokeColor: '#333333',
            strokeWidth: 1,
            dashArray: [4, 2],
            layerName: 'A-WALL',
          },
        ],
        beziers: [],
        rectangles: [
          {
            id: 'r1',
            x: 200,
            y: 200,
            width: 60,
            height: 40,
            strokeColor: '#111827',
            strokeWidth: 1.5,
            layerName: 'P-101',
          },
        ],
        paths: [],
      },
      textAnchors: [
        {
          id: 't1',
          text: '4"-P-101-CS',
          x: 60,
          y: 82,
          width: 64,
          height: 12,
          fontSize: 10,
          angleRad: 0,
        },
      ],
    };

    const res = convertPdfVectorsToAnnotations(extract, {
      defaultPolylineType: 'perimeter-takeoff',
      calibration: { scaleRatio: 50, unit: 'mm', precision: 0 },
      idFactory: makeIdFactory(),
      timestamp: 1000,
    });

    expect(res.stats.rectsCreated).toBe(1);
    expect(res.stats.polylinesCreated).toBe(1);
    expect(res.stats.linesCreated).toBe(1);
    expect(res.stats.labelsCreated).toBe(1);

    const pipe = res.annotations.find((a) => a.type === 'perimeter-takeoff');
    expect(pipe).toBeDefined();
    expect(pipe?.data.coordinateSpace).toBe('page');
    expect(pipe?.data.points).toHaveLength(6);
    expect(pipe?.data.cadLayerName).toBe('P-101');
    expect(pipe?.data.dimensionScale).toBe(50);
    expect(pipe?.data.isPipeRun).toBe(true);
    expect(pipe?.data.importedFromPdfVector).toBe(true);

    const dashedWall = res.annotations.find((a) => a.type === 'line');
    expect(dashedWall?.data.borderStyle).toBe('dashed');
    expect(dashedWall?.data.cadLayerName).toBe('A-WALL');

    const label = res.annotations.find((a) => a.type === 'textbox');
    expect(label?.data.text).toBe('4"-P-101-CS');
  });

  it('promotes closed stitched loops to shape-polygon, filters by includeLayers, and deduplicates rect edges', () => {
    const res = convertPdfVectorsToAnnotations(
      {
        geometry: {
          pageNumber: 1,
          pageWidth: 400,
          pageHeight: 400,
          totalExtractedSegments: 5,
          rectangles: [
            { id: 'box', x: 10, y: 10, width: 40, height: 20, layerName: 'VALVES' },
          ],
          lines: [
            // Duplicate top edge of rect box -> skipped!
            { id: 'dup', start: { x: 10, y: 10 }, end: { x: 50, y: 10 }, length: 40, layerName: 'VALVES' },
            // Closed triangle on VALVES layer -> promoted to shape-polygon
            { id: 't1', start: { x: 100, y: 100 }, end: { x: 140, y: 100 }, length: 40, layerName: 'VALVES' },
            { id: 't2', start: { x: 140, y: 100 }, end: { x: 120, y: 130 }, length: 36, layerName: 'VALVES' },
            { id: 't3', start: { x: 120, y: 130 }, end: { x: 100, y: 100 }, length: 36, layerName: 'VALVES' },
            // Ignored GRID line
            { id: 'g1', start: { x: 0, y: 200 }, end: { x: 300, y: 200 }, length: 300, layerName: 'GRID' },
          ],
          beziers: [],
          paths: [],
        },
        textAnchors: [],
      },
      {
        includeLayers: ['VALVES'],
        idFactory: makeIdFactory(),
        timestamp: 2000,
      },
    );

    expect(res.stats.rectsCreated).toBe(1);
    expect(res.stats.polygonsCreated).toBe(1);
    expect(res.stats.linesCreated).toBe(0);
    expect(res.stats.skippedSegments).toBe(2); // 1 rect edge + 1 GRID line
  });

  it('flattens cubic beziers into polyline segments and preserves chord points', () => {
    const res = convertPdfVectorsToAnnotations(
      {
        geometry: {
          pageNumber: 1,
          pageWidth: 300,
          pageHeight: 300,
          totalExtractedSegments: 1,
          lines: [],
          beziers: [
            {
              id: 'b1',
              p0: { x: 20, y: 100 },
              p1: { x: 20, y: 50 },
              p2: { x: 70, y: 50 },
              p3: { x: 70, y: 100 },
            },
          ],
          rectangles: [],
          paths: [],
        },
        textAnchors: [],
      },
      {
        bezierChordSegments: 4,
        idFactory: makeIdFactory(),
        timestamp: 3000,
      },
    );

    expect(res.stats.polylinesCreated).toBe(1);
    const poly = res.annotations[0];
    // 4 chords = 5 vertices = 10 numbers
    expect(poly.data.points).toHaveLength(10);
  });

  it('writes and round-trips multi-vertex perimeter-takeoff as ISO 32000 PolyLine /Vertices', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 300]);
    const blankPdf = new Uint8Array(await doc.save());

    const polylineAnn: PdfAnnotation = {
      id: 'pipe-run-native-1',
      type: 'perimeter-takeoff',
      pageNumber: 1,
      rect: { x: 50, y: 40, width: 120, height: 80 },
      createdAt: 1000,
      updatedAt: 1000,
      data: {
        coordinateSpace: 'page',
        points: [50, 40, 170, 40, 170, 120],
        borderColor: '#2563eb',
        borderWidth: 2,
        isPipeRun: true,
        dimensionScale: 100,
        dimensionUnit: 'mm',
      },
    };

    const written = await writeNativePdfAnnotations(blankPdf, [polylineAnn]);

    // Verify raw PDF dictionary uses /Annots with /PolyLine
    const parsedDoc = await PDFDocument.load(written.bytes);
    const page = parsedDoc.getPage(0);
    const annotsRef = page.node.get(PDFName.of('Annots'));
    expect(annotsRef).toBeDefined();

    // Read back using nativeAnnotationReader
    const readBack = await readNativePdfAnnotations(written.bytes);
    expect(readBack.annotations).toHaveLength(1);
    const item = readBack.annotations[0];
    expect(item.type).toBe('perimeter-takeoff');
    expect(item.data.coordinateSpace).toBe('page');
    expect(item.data.points).toHaveLength(6);
    expect(item.data.points?.[0]).toBeCloseTo(50, 1);
    expect(item.data.points?.[1]).toBeCloseTo(40, 1);
    expect(item.data.points?.[4]).toBeCloseTo(170, 1);
    expect(item.data.points?.[5]).toBeCloseTo(120, 1);
  });
});
