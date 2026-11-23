import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { writeNativePdfAnnotations } from './nativeAnnotationWriter';
import type { PdfAnnotation } from '@/core/annotations/types';

describe('ISO 32000-1 §12.4.2 Viewport Scale & Takeoff Intent Serialization', () => {
  it('serializes /VP viewport scale dictionary on pages containing calibrated dimension annotations', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    const baseBytes = await doc.save();

    const dimensionAnnotation: PdfAnnotation = {
      id: 'pipe-dimension-1',
      type: 'line',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 200, height: 20 },
      data: {
        points: [100, 100, 300, 100],
        dimensionScale: 100, // 1:100 scale
        dimensionUnit: 'mm',
        isDimension: true,
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const result = await writeNativePdfAnnotations(baseBytes, [dimensionAnnotation]);
    const loaded = await PDFDocument.load(result.bytes);
    const page = loaded.getPage(0);

    // Verify /VP is attached to page dictionary
    const vpArray = page.node.lookupMaybe(PDFName.of('VP'), PDFArray);
    expect(vpArray).toBeDefined();
    expect(vpArray?.size()).toBe(1);

    const vpDict = vpArray?.lookup(0, PDFDict);
    expect(vpDict?.lookupMaybe(PDFName.of('Type'), PDFName)?.decodeText()).toBe('Viewport');
    expect(vpDict?.lookupMaybe(PDFName.of('Name'), PDFString)?.decodeText()).toBe('CAD Scale');

    // Verify /Measure dictionary inside viewport
    const measureDict = vpDict?.lookupMaybe(PDFName.of('Measure'), PDFDict);
    expect(measureDict?.lookupMaybe(PDFName.of('Type'), PDFName)?.decodeText()).toBe('Measure');
    expect(measureDict?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()).toBe('RL');
    expect(measureDict?.lookupMaybe(PDFName.of('R'), PDFString)?.decodeText()).toBe('1 / 100');

    // Verify Line annotation has /IT /LineDimension
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    expect(annots?.size()).toBe(1);
    const lineDict = annots?.lookup(0, PDFDict);
    expect(lineDict?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()).toBe('Line');
    expect(lineDict?.lookupMaybe(PDFName.of('IT'), PDFName)?.decodeText()).toBe('LineDimension');
  });

  it('serializes /IT /PolygonDimension on area takeoff annotations', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    const baseBytes = await doc.save();

    const areaTakeoffAnnotation: PdfAnnotation = {
      id: 'slab-area-takeoff-1',
      type: 'shape-polygon',
      pageNumber: 1,
      rect: { x: 50, y: 50, width: 100, height: 100 },
      data: {
        points: [50, 50, 150, 50, 150, 150, 50, 150],
        isAreaTakeoff: true,
        dimensionScale: 50, // 1:50 scale
        dimensionUnit: 'm',
      },
      createdAt: 1,
      updatedAt: 1,
    };

    const result = await writeNativePdfAnnotations(baseBytes, [areaTakeoffAnnotation]);
    const loaded = await PDFDocument.load(result.bytes);
    const page = loaded.getPage(0);

    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    const polyDict = annots?.lookup(0, PDFDict);
    expect(polyDict?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()).toBe('Polygon');
    expect(polyDict?.lookupMaybe(PDFName.of('IT'), PDFName)?.decodeText()).toBe('PolygonDimension');
  });
});
