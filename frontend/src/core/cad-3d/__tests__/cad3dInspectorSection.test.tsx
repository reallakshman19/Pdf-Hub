import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { serializeMeshToGltf } from '../gltfExport';
import { extrudePolygonTo3D } from '../extrudeEngine';
import { useCadModelingStore } from '../../cad-modeling/store';
import { Cad3DInspectorSection } from '@/components/inspector/Cad3DInspectorSection';
import type { CadClosedLoop } from '../../cad-geometry/types';

describe('CAD 3D Inspector Section & glTF 2.0 Export - Mini-Phase P.4', () => {
  beforeEach(() => {
    useCadModelingStore.getState().reset();
  });

  describe('FALSIFY-INSP-01: glTF 2.0 Serialization', () => {
    it('serializes 3D extruded mesh into valid glTF 2.0 JSON schema with base64 embedded buffer', () => {
      const poly = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 30 },
        { x: 0, y: 30 },
      ];

      const mesh = extrudePolygonTo3D(poly, { depth: 15 });
      const gltfString = serializeMeshToGltf(mesh, 'TestBox');

      const doc = JSON.parse(gltfString);

      // Verify glTF 2.0 mandatory fields
      expect(doc.asset.version).toBe('2.0');
      expect(doc.asset.generator).toContain('PDF Hub');
      expect(doc.scene).toBe(0);
      expect(doc.scenes).toHaveLength(1);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.nodes[0].name).toBe('TestBox');

      // Meshes and primitives
      expect(doc.meshes).toHaveLength(1);
      const prim = doc.meshes[0].primitives[0];
      expect(prim.attributes.POSITION).toBe(0);
      expect(prim.attributes.NORMAL).toBe(1);
      expect(prim.indices).toBe(2);

      // Accessors
      expect(doc.accessors).toHaveLength(3);
      expect(doc.accessors[0].type).toBe('VEC3'); // POSITION
      expect(doc.accessors[0].count).toBe(mesh.vertexCount);
      expect(doc.accessors[1].type).toBe('VEC3'); // NORMAL
      expect(doc.accessors[2].type).toBe('SCALAR'); // INDICES

      // Embedded buffer
      expect(doc.buffers).toHaveLength(1);
      expect(doc.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
    });
  });

  describe('FALSIFY-INSP-02 & FALSIFY-INSP-04: Extrusion Controls & Live Solid Metrics', () => {
    it('mutates extrude depth and bevel size while updating live solid metrics and dimensions', () => {
      const sampleLoop: CadClosedLoop = {
        id: 'test_loop_1',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ],
        area: 5000,
        perimeter: 300,
        centroid: { x: 50, y: 25 },
        isClockwise: false,
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
        edgeIds: ['e1'],
      };

      useCadModelingStore.getState().setHarvestedLoops([sampleLoop]);

      render(<Cad3DInspectorSection />);

      // Verify initial depth is 20
      const depthSlider = screen.getByTestId('inspector-depth-slider') as HTMLInputElement;
      expect(depthSlider.value).toBe('20');

      // Change depth to 50
      fireEvent.change(depthSlider, { target: { value: '50' } });
      expect(useCadModelingStore.getState().dock3d.extrudeDepth).toBe(50);

      // Verify metrics update
      const metrics = screen.getByTestId('inspector-mesh-metrics');
      // Volume for 100x50x50 = 250,000 pt^3
      expect(metrics.textContent).toContain('250,000 pt³');
      expect(metrics.textContent).toContain('100.0 × 50.0 × 50.0 pt');

      // Change bevel size
      const bevelInput = screen.getByTestId('inspector-bevel-input') as HTMLInputElement;
      fireEvent.change(bevelInput, { target: { value: '5' } });
      expect(useCadModelingStore.getState().dock3d.bevelSize).toBe(5);
    });
  });

  describe('FALSIFY-INSP-03: Material Palette & Render Mode', () => {
    it('updates shaded material color and wireframe accent via preset buttons', () => {
      render(<Cad3DInspectorSection />);

      // Preset colors
      const brassBtn = screen.getByTestId('preset-color-#d97706');
      fireEvent.click(brassBtn);
      expect(useCadModelingStore.getState().dock3d.shadedColor).toBe('#d97706');

      const neonWireBtn = screen.getByTestId('preset-wire-#22c55e');
      fireEvent.click(neonWireBtn);
      expect(useCadModelingStore.getState().dock3d.wireframeColor).toBe('#22c55e');

      // Render mode
      const wireframeBtn = screen.getByTestId('inspector-mode-wireframe');
      fireEvent.click(wireframeBtn);
      expect(useCadModelingStore.getState().dock3d.viewMode).toBe('wireframe');
    });
  });

  describe('FALSIFY-INSP-05: OBJ & glTF Export Triggers', () => {
    it('triggers file download on clicking Export OBJ and Export glTF buttons', () => {
      const sampleLoop: CadClosedLoop = {
        id: 'export_loop',
        vertices: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
        ],
        area: 200,
        perimeter: 60,
        centroid: { x: 10, y: 10 },
        isClockwise: false,
        bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
        edgeIds: ['e1'],
      };

      useCadModelingStore.getState().setHarvestedLoops([sampleLoop]);

      // Mock URL.createObjectURL and URL.revokeObjectURL
      const createObjectURLMock = vi.fn(() => 'blob:mock-url');
      const revokeObjectURLMock = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLMock;
      globalThis.URL.revokeObjectURL = revokeObjectURLMock;

      render(<Cad3DInspectorSection />);

      const exportObjBtn = screen.getByTestId('inspector-btn-export-obj');
      const exportGltfBtn = screen.getByTestId('inspector-btn-export-gltf');

      fireEvent.click(exportObjBtn);
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);

      fireEvent.click(exportGltfBtn);
      expect(createObjectURLMock).toHaveBeenCalledTimes(2);
    });
  });
});
