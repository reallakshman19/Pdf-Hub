import { beforeEach, describe, expect, it } from 'vitest';
import { usePipingTableStore } from '../pipingTableStore';
import type { PdfAnnotation, ScaleCalibration } from '../../../annotations/types';

const mockCalibration: ScaleCalibration = {
  scaleRatio: 100, // 1:100 scale (72pt = 2540mm)
  unit: 'mm',
  precision: 0,
};

const getCalibration = () => mockCalibration;

const sampleLineAnnotation: PdfAnnotation = {
  id: 'pipe-1',
  type: 'line',
  pageNumber: 1,
  rect: { x: 100, y: 100, width: 200, height: 0 },
  createdAt: 1,
  updatedAt: 1,
  data: {
    points: [0, 0, 200, 0], // x1=100, y1=100, x2=300, y2=100
    branchName: '/4"-LINE/B1',
    systemType: 'pipe',
  },
};

describe('usePipingTableStore - Bidirectional Round Trip', () => {
  beforeEach(() => {
    usePipingTableStore.setState({
      activeTableTab: 'coordinates',
      coordinateRows: [],
      branchRows: [],
      restraintRows: [],
      weightRows: [],
      dtxrRows: [],
      dirtyCells: {},
      selectedNodeNumber: null,
      selectedRowIndex: null,
    });
  });

  it('syncs 5-table model forward from annotations', () => {
    const store = usePipingTableStore.getState();
    store.syncFromAnnotations([sampleLineAnnotation], getCalibration);

    const coords = usePipingTableStore.getState().coordinateRows;
    expect(coords.length).toBe(2); // start node (100) and end node (110)
    expect(coords[0].nodeNumber).toBe(100);
    expect(coords[1].nodeNumber).toBe(110);
    expect(coords[0].branchName).toBe('/4"-LINE/B1');
  });

  it('updates coordinate row and tracks dirty cells', () => {
    const store = usePipingTableStore.getState();
    store.syncFromAnnotations([sampleLineAnnotation], getCalibration);

    // Edit elevation Z of node 100
    store.updateCoordinateRow(100, { z: 105000 });

    const state = usePipingTableStore.getState();
    const node100 = state.coordinateRows.find((r) => r.nodeNumber === 100);
    expect(node100?.z).toBe(105000);
    expect(state.dirtyCells['coordinates:100:z']).toBe(true);
  });

  it('preserves dirty cell values during forward re-sync', () => {
    const store = usePipingTableStore.getState();
    store.syncFromAnnotations([sampleLineAnnotation], getCalibration);

    // User edits X coordinate of node 110 to 99999
    store.updateCoordinateRow(110, { x: 99999 });
    expect(usePipingTableStore.getState().dirtyCells['coordinates:110:x']).toBe(true);

    // Re-sync from drawing annotations
    store.syncFromAnnotations([sampleLineAnnotation], getCalibration);

    const node110 = usePipingTableStore.getState().coordinateRows.find((r) => r.nodeNumber === 110);
    expect(node110?.x).toBe(99999); // preserved because it was dirty
  });

  it('computes reverse annotation patches for dirty table cells', () => {
    const store = usePipingTableStore.getState();
    store.syncFromAnnotations([sampleLineAnnotation], getCalibration);

    // User modifies Node 100 elevation Z and Node 110 X
    store.updateCoordinateRow(100, { z: 108000 });

    const patches = store.computeAnnotationPatches([sampleLineAnnotation], getCalibration);
    expect(patches.length).toBeGreaterThanOrEqual(1);

    const pipePatch = patches.find((p) => p.id === 'pipe-1');
    expect(pipePatch).toBeDefined();
    expect((pipePatch?.patch.data?.nodeElevations as Record<number, number> | undefined)?.[100]).toBe(108000);
  });

  it('pastes TSV clipboard rows and updates coordinate table', () => {
    const store = usePipingTableStore.getState();
    store.syncFromAnnotations([sampleLineAnnotation], getCalibration);

    const tsv = '/4"-LINE/B1\t100\t5000\t6000\t100000\n/4"-LINE/B1\t110\t8000\t6000\t100000';
    const success = store.pasteTsvToTable('coordinates', tsv);
    expect(success).toBe(true);

    const state = usePipingTableStore.getState();
    const node100 = state.coordinateRows.find((r) => r.nodeNumber === 100);
    expect(node100?.x).toBe(5000);
    expect(node100?.y).toBe(6000);
    expect(state.dirtyCells['coordinates:100:x']).toBe(true);
  });
});
