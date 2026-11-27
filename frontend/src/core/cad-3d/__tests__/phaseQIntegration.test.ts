import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { CadWorkerClient } from '../../cad-geometry/cadWorkerClient';
import { extrudePolygonTo3D } from '../extrudeEngine';
import { embedU3DMeshInPdf } from '../pdf3dAnnotation';
import type { FullXmlBuilderModel } from '../../pipeline-geometry/types';

describe('Phase Q4: CadWorkerClient 3D Digital Twin & Clash Offload', () => {
  it('executes volumetric piping + spatial clash audit and PDF 3D extraction through CadWorkerClient', async () => {
    const client = new CadWorkerClient();
    try {
      const model: FullXmlBuilderModel = {
        coordinateRows: [
          { branchName: '/MAIN', nodeNumber: 10, x: 0, y: 0, z: 0, pageNumber: 1, annotationId: 'p1' },
          { branchName: '/MAIN', nodeNumber: 20, x: 1500, y: 0, z: 0, pageNumber: 1, annotationId: 'p1' },
          { branchName: '/MAIN', nodeNumber: 30, x: 1500, y: 1500, z: 0, pageNumber: 1, annotationId: 'p1' },
          { branchName: '/CROSS', nodeNumber: 40, x: 750, y: -500, z: 0, pageNumber: 1, annotationId: 'p2' },
          { branchName: '/CROSS', nodeNumber: 50, x: 750, y: 500, z: 0, pageNumber: 1, annotationId: 'p2' },
        ],
        branchRows: [
          { branchName: '/MAIN', nodeNumber: 10, boreMm: 100, wallThickness: 5, p1: 100, t1: 100 },
          { branchName: '/CROSS', nodeNumber: 40, boreMm: 100, wallThickness: 5, p1: 100, t1: 100 },
        ],
        restraintRows: [],
        weightRows: [],
        dtxrRows: [],
      };

      const { scene, clashReport } = await client.buildPiping3DAndAuditClashes({
        model,
        clashOptions: { minClearanceMm: 30 },
      });

      expect(scene.elbowCount).toBe(1);
      expect(clashReport.hardClashCount).toBe(1);

      const blank = await PDFDocument.create();
      blank.addPage([600, 600]);
      const baseBytes = await blank.save();

      const solid = extrudePolygonTo3D(
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
        { depth: 10, meshId: 'WorkerTestSolid' },
      );

      const embedded = await embedU3DMeshInPdf(baseBytes, [solid], {
        annotationName: 'Worker_U3D_Annot',
      });

      const extracted = await client.parsePdf3DAnnotations({ pdfBytes: embedded.pdfBytes });
      expect(extracted.annotationCount).toBe(1);
      expect(extracted.annotations[0].name).toBe('Worker_U3D_Annot');
      expect(extracted.annotations[0].meshes[0].triangleCount).toBe(solid.triangleCount);
    } finally {
      client.terminate();
    }
  });
});
