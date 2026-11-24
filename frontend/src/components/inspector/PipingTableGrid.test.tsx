import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipingTableGrid } from './PipingTableGrid';
import { usePipingTableStore } from '@/core/pipeline-geometry/table-store/pipingTableStore';
import type { FullXmlBuilderModel } from '@/core/pipeline-geometry/types';

describe('PipingTableGrid Component', () => {
  const mockOnApplyToSheet = vi.fn();
  const mockOnResetFromSheet = vi.fn();
  const mockOnSelectNode = vi.fn();

  const sampleModel: FullXmlBuilderModel = {
    coordinateRows: [
      {
        branchName: '/PIPE-4/B1',
        nodeNumber: 100,
        x: 0,
        y: 0,
        z: 100000,
        pageNumber: 1,
        annotationId: 'pipe-1',
        lengthToNextMm: 2500,
      },
      {
        branchName: '/PIPE-4/B1',
        nodeNumber: 110,
        x: 2500,
        y: 0,
        z: 100000,
        pageNumber: 1,
        annotationId: 'pipe-1',
        lengthToNextMm: 3000,
      },
      {
        branchName: '/PIPE-4/B1',
        nodeNumber: 120,
        x: 2500,
        y: 3000,
        z: 100000,
        pageNumber: 1,
        annotationId: 'pipe-1',
        lengthToNextMm: 0,
      },
    ],
    branchRows: [
      {
        branchName: '/PIPE-4/B1',
        nodeNumber: 100,
        boreMm: 100,
        wallThickness: 6.02,
        p1: 10,
        t1: 150,
      },
    ],
    restraintRows: [
      {
        branchName: '/PIPE-4/B1',
        nodeNumber: 110,
        nodeName: 'PS-101',
        restraintType: 'GUIDE',
        friction: 0.3,
      },
    ],
    weightRows: [
      {
        branchName: '/PIPE-4/B1',
        nodeNumber: 110,
        componentType: 'VALVE',
        weight: 45,
        componentRefNo: 'V-101',
        rigid: true,
        endpoint: 110,
      },
    ],
    dtxrRows: [
      {
        nodeNumber: 100,
        branchName: '/PIPE-4/B1',
        dtxr: '10.5 0 0',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usePipingTableStore.setState({
      coordinateRows: sampleModel.coordinateRows,
      branchRows: sampleModel.branchRows,
      restraintRows: sampleModel.restraintRows,
      weightRows: sampleModel.weightRows,
      dtxrRows: sampleModel.dtxrRows,
      dirtyCells: {},
      activeTableTab: 'coordinates',
    });
  });

  it('renders all 5 table sub-tabs with correct row counts', () => {
    render(
      <PipingTableGrid
        onApplyToSheet={mockOnApplyToSheet}
        onResetFromSheet={mockOnResetFromSheet}
        selectedNode={null}
        onSelectNode={mockOnSelectNode}
      />
    );

    expect(screen.getByTestId('tab-coords')).toHaveTextContent('Coords (3)');
    expect(screen.getByTestId('tab-branches')).toHaveTextContent('Branches (1)');
    expect(screen.getByTestId('tab-supports')).toHaveTextContent('Supports (1)');
    expect(screen.getByTestId('tab-valves')).toHaveTextContent('Valves (1)');
    expect(screen.getByTestId('tab-nozzles')).toHaveTextContent('Nozzles (1)');
  });

  it('switches between tabs and displays the corresponding table headers', () => {
    render(
      <PipingTableGrid
        onApplyToSheet={mockOnApplyToSheet}
        onResetFromSheet={mockOnResetFromSheet}
        selectedNode={null}
        onSelectNode={mockOnSelectNode}
      />
    );

    // Default tab is coordinates
    expect(screen.getByText('X (East)')).toBeInTheDocument();
    expect(screen.getByText('Y (North)')).toBeInTheDocument();
    expect(screen.getByText('Z (Elev)')).toBeInTheDocument();

    // Switch to branches
    fireEvent.click(screen.getByTestId('tab-branches'));
    expect(screen.getByText('Bore')).toBeInTheDocument();
    expect(screen.getByText('Wall')).toBeInTheDocument();
    expect(screen.getByText('P1 / T1')).toBeInTheDocument();

    // Switch to supports
    fireEvent.click(screen.getByTestId('tab-supports'));
    expect(screen.getByText('Support Tag')).toBeInTheDocument();
    expect(screen.getByText('Friction')).toBeInTheDocument();

    // Switch to valves
    fireEvent.click(screen.getByTestId('tab-valves'));
    expect(screen.getByText('Component')).toBeInTheDocument();
    expect(screen.getByText('Weight')).toBeInTheDocument();

    // Switch to nozzles
    fireEvent.click(screen.getByTestId('tab-nozzles'));
    expect(screen.getByText('Displacement / Vector')).toBeInTheDocument();
  });

  it('selects a node when clicking on a coordinate row', () => {
    render(
      <PipingTableGrid
        onApplyToSheet={mockOnApplyToSheet}
        onResetFromSheet={mockOnResetFromSheet}
        selectedNode={null}
        onSelectNode={mockOnSelectNode}
      />
    );

    const node110Cell = screen.getByText('110');
    fireEvent.click(node110Cell);

    expect(mockOnSelectNode).toHaveBeenCalledWith(110);
  });

  it('allows inline double-click editing of coordinates and applies change to sheet', () => {
    render(
      <PipingTableGrid
        onApplyToSheet={mockOnApplyToSheet}
        onResetFromSheet={mockOnResetFromSheet}
        selectedNode={null}
        onSelectNode={mockOnSelectNode}
      />
    );

    // Double-click on X coordinate of node 100 (in row 0)
    const node100Row = screen.getByText('100').closest('tr')!;
    const cells = node100Row.querySelectorAll('td');
    const xCellSpan = cells[1].querySelector('span')!;
    fireEvent.doubleClick(xCellSpan);

    // Input should appear
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('0');

    // Change value to 500 and hit Enter
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Cell value updated in store and onApplyToSheet triggered
    expect(usePipingTableStore.getState().coordinateRows[0].x).toBe(500);
    expect(mockOnApplyToSheet).toHaveBeenCalled();

    // Dirty indicator should be visible
    expect(screen.getByTestId('apply-to-sheet-btn')).toHaveTextContent('Apply (1)');
  });

  it('cancels inline cell editing on Escape key', () => {
    render(
      <PipingTableGrid
        onApplyToSheet={mockOnApplyToSheet}
        onResetFromSheet={mockOnResetFromSheet}
        selectedNode={null}
        onSelectNode={mockOnSelectNode}
      />
    );

    const node100Row = screen.getByText('100').closest('tr')!;
    const cells = node100Row.querySelectorAll('td');
    const xCellSpan = cells[1].querySelector('span')!;
    fireEvent.doubleClick(xCellSpan);

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '9999' } });
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    // Store value should remain unchanged
    expect(usePipingTableStore.getState().coordinateRows[0].x).toBe(0);
  });

  it('calls onResetFromSheet when clicking Reset button', () => {
    render(
      <PipingTableGrid
        onApplyToSheet={mockOnApplyToSheet}
        onResetFromSheet={mockOnResetFromSheet}
        selectedNode={null}
        onSelectNode={mockOnSelectNode}
      />
    );

    // Make cell dirty
    act(() => {
      usePipingTableStore.getState().updateCoordinateRow(100, { z: 105000 });
    });

    const resetBtn = screen.getByTestId('reset-from-sheet-btn');
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    expect(mockOnResetFromSheet).toHaveBeenCalled();
  });

  it('pastes TSV from clipboard when clicking Paste button', async () => {
    const tsvData = 'Node\tX\tY\tZ\n100\t1200\t3400\t100000\n';
    Object.assign(navigator, {
      clipboard: {
        readText: vi.fn().mockResolvedValue(tsvData),
      },
    });

    render(
      <PipingTableGrid
        onApplyToSheet={mockOnApplyToSheet}
        onResetFromSheet={mockOnResetFromSheet}
        selectedNode={null}
        onSelectNode={mockOnSelectNode}
      />
    );

    const pasteBtn = screen.getByTestId('paste-tsv-btn');
    await act(async () => {
      fireEvent.click(pasteBtn);
    });

    expect(usePipingTableStore.getState().coordinateRows[0].x).toBe(1200);
    expect(usePipingTableStore.getState().coordinateRows[0].y).toBe(3400);
    expect(mockOnApplyToSheet).toHaveBeenCalled();
  });
});
