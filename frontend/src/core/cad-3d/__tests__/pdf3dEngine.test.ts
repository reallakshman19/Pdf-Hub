import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFString } from 'pdf-lib';
import { zlibSync } from 'fflate';
import { extrudePolygonTo3D } from '../extrudeEngine';
import { parseU3DBinary, serializeMeshesToU3DBinary, U3D_MAGIC_FILE_HEADER } from '../u3dCodec';
import { inspectPrcBinary } from '../prcInspector';
import { embedU3DMeshInPdf, extractPdf3DAnnotations } from '../pdf3dAnnotation';

describe('Phase Q1: Native 3D PDF Engine (ECMA-363 U3D & ISO 14739-1 PRC)', () => {
  it('round-trips multi-mesh geometry through ECMA-363 U3D binary serialization and parsing', () => {
    const box = extrudePolygonTo3D(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 0, y: 20 },
      ],
      { depth: 15, meshId: 'PipeFlangeBox' },
    );
    const hex = extrudePolygonTo3D(
      [
        { x: 60, y: 0 },
        { x: 80, y: 10 },
        { x: 80, y: 30 },
        { x: 60, y: 40 },
        { x: 40, y: 30 },
        { x: 40, y: 10 },
      ],
      { depth: 10, meshId: 'HexValveBody' },
    );

    const u3dBytes = serializeMeshesToU3DBinary([box, hex]);
    expect(u3dBytes.length).toBeGreaterThan(100);

    const view = new DataView(u3dBytes.buffer, u3dBytes.byteOffset, u3dBytes.byteLength);
    expect(view.getUint32(0, true)).toBe(U3D_MAGIC_FILE_HEADER);

    const parsed = parseU3DBinary(u3dBytes);
    expect(parsed.isValidU3D).toBe(true);
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.nodes.map((n) => n.name)).toEqual(['PipeFlangeBox', 'HexValveBody']);
    expect(parsed.blocks.some((b) => b.blockName === 'CLOD_MESH_DECLARATION')).toBe(true);
    expect(parsed.blocks.some((b) => b.blockName === 'CLOD_BASE_MESH_CONTINUATION')).toBe(true);
    expect(parsed.meshes).toHaveLength(2);

    expect(parsed.meshes[0].id).toBe('PipeFlangeBox');
    expect(parsed.meshes[0].vertexCount).toBe(box.vertexCount);
    expect(parsed.meshes[0].triangleCount).toBe(box.triangleCount);
    expect(parsed.meshes[0].volume).toBeCloseTo(box.volume, 1);

    expect(parsed.meshes[1].id).toBe('HexValveBody');
    expect(parsed.meshes[1].vertexCount).toBe(hex.vertexCount);
    expect(parsed.meshes[1].triangleCount).toBe(hex.triangleCount);
  });

  it('inspects ISO 14739-1 PRC headers and compressed section streams cleanly', () => {
    const globalsChunk = zlibSync(new TextEncoder().encode('Globals PRC schema unit mm'));
    const tessChunk = zlibSync(new TextEncoder().encode('Tessellation mesh body vertices'));

    const prc = new Uint8Array(64 + globalsChunk.length + 12 + tessChunk.length);
    prc[0] = 0x50; // P
    prc[1] = 0x52; // R
    prc[2] = 0x43; // C
    const dv = new DataView(prc.buffer);
    dv.setUint32(3, 8137, true); // minimalVersion
    dv.setUint32(7, 10021, true); // authoringVersion
    dv.setUint32(43, 1, true); // 1 file structure
    prc.set(globalsChunk, 56);
    prc.set(tessChunk, 64 + globalsChunk.length + 8);

    const result = inspectPrcBinary(prc);
    expect(result.isValidPrc).toBe(true);
    expect(result.minimalVersion).toBe(8137);
    expect(result.authoringVersion).toBe(10021);
    expect(result.fileStructureCount).toBe(1);
    expect(result.sections.map((s) => s.name)).toContain('Globals');
    expect(result.sections.map((s) => s.name)).toContain('Tessellation');

    const invalid = inspectPrcBinary(new Uint8Array([1, 2, 3, 4]));
    expect(invalid.isValidPrc).toBe(false);
  });

  it('embeds U3D meshes into PDF /Subtype /3D annotations and extracts both U3D and PRC back out', async () => {
    const blankDoc = await PDFDocument.create();
    blankDoc.addPage([612, 792]);
    const baseBytes = await blankDoc.save();

    const plate = extrudePolygonTo3D(
      [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 90, y: 60 },
        { x: 10, y: 60 },
      ],
      { depth: 25, meshId: 'BracketSolid' },
    );

    const embedded = await embedU3DMeshInPdf(baseBytes, [plate], {
      annotationName: 'CAD_Bracket_Twin',
      compressStream: true,
      includeAppearancePreview: true,
      viewName: 'CAD Iso Preset',
    });

    expect(embedded.u3dByteLength).toBeGreaterThan(100);

    const extracted = await extractPdf3DAnnotations(embedded.pdfBytes);
    expect(extracted.pageCount).toBe(1);
    expect(extracted.annotationCount).toBe(1);

    const annot = extracted.annotations[0];
    expect(annot.name).toBe('CAD_Bracket_Twin');
    expect(annot.format).toBe('u3d');
    expect(annot.streamSubtype).toBe('U3D');
    expect(annot.defaultView?.name).toBe('CAD Iso Preset');
    expect(annot.defaultView?.cameraToWorld).toHaveLength(12);
    expect(annot.activation.toolbarEnabled).toBe(true);
    expect(annot.meshes).toHaveLength(1);
    expect(annot.meshes[0].triangleCount).toBe(plate.triangleCount);
    expect(annot.meshes[0].volume).toBeCloseTo(plate.volume, 1);

    // Verify PRC annotation extraction on a second PDF page
    const prcDoc = await PDFDocument.load(embedded.pdfBytes);
    const p2 = prcDoc.addPage([612, 792]);
    const rawPrc = new Uint8Array(64);
    rawPrc.set([0x50, 0x52, 0x43], 0);
    new DataView(rawPrc.buffer).setUint32(3, 8137, true);
    new DataView(rawPrc.buffer).setUint32(7, 9000, true);
    new DataView(rawPrc.buffer).setUint32(43, 2, true);
    const compressedPrc = zlibSync(rawPrc);

    const prcStream = PDFRawStream.of(
      prcDoc.context.obj({
        Type: PDFName.of('3D'),
        Subtype: PDFName.of('PRC'),
        Filter: PDFName.of('FlateDecode'),
        Length: PDFNumber.of(compressedPrc.length),
      }),
      compressedPrc,
    );
    const prcStreamRef = prcDoc.context.register(prcStream);
    const prcAnnotRef = prcDoc.context.register(
      prcDoc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('3D'),
        NM: PDFString.of('Vendor_PRC_Valve'),
        Rect: [50, 50, 300, 300],
        '3DD': prcStreamRef,
      }),
    );
    p2.node.set(PDFName.of('Annots'), prcDoc.context.obj([prcAnnotRef]));

    const combinedBytes = await prcDoc.save();
    const reExtracted = await extractPdf3DAnnotations(combinedBytes);
    expect(reExtracted.annotationCount).toBe(2);
    expect(reExtracted.annotations[1].format).toBe('prc');
    expect(reExtracted.annotations[1].name).toBe('Vendor_PRC_Valve');
    expect(reExtracted.annotations[1].prcDetails?.isValidPrc).toBe(true);
    expect(reExtracted.annotations[1].prcDetails?.fileStructureCount).toBe(2);
  });
});
