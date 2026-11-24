import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TakeoffInspectorTab } from './TakeoffInspectorTab';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';

describe('TakeoffInspectorTab', () => {
  beforeEach(() => {
    useSessionStore.setState({
      viewState: {
        currentPageId: 'page-1',
        currentPage: 1,
        zoom: 1,
        fitMode: 'width',
        viewMode: 'single',
      },
      pageCount: 3,
    });

    useAnnotationStore.setState({
      annotations: [
        {
          id: 'callout-1',
          type: 'callout',
          pageNumber: 1,
          rect: { x: 50, y: 50, width: 80, height: 30 },
          createdAt: 1,
          updatedAt: 1,
          data: { text: 'Rest Axial Stop' },
        },
        {
          id: 'callout-2',
          type: 'callout',
          pageNumber: 1,
          rect: { x: 150, y: 50, width: 80, height: 30 },
          createdAt: 2,
          updatedAt: 2,
          data: { text: 'Rest Axial Stop' },
        },
        {
          id: 'callout-3',
          type: 'callout',
          pageNumber: 2,
          rect: { x: 50, y: 50, width: 80, height: 30 },
          createdAt: 3,
          updatedAt: 3,
          data: { text: 'Guide Support' },
        },
      ],
      pageCalibrations: {
        1: { scaleRatio: 100, unit: 'mm', precision: 0 },
        2: { scaleRatio: 50, unit: 'mm', precision: 0 },
      },
    });
  });

  it('renders quantity takeoff metrics and grouped items for current page by default', () => {
    render(<TakeoffInspectorTab />);

    expect(screen.getByText(/Quantity Takeoff/i)).toBeInTheDocument();
    expect(screen.getByText('Total Items')).toBeInTheDocument();

    // On Page 1, there are 2 annotations ('Rest Axial Stop')
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Rest Axial Stop')).toBeInTheDocument();
    expect(screen.getByText('Qty: 2')).toBeInTheDocument();
  });

  it('switches to All Pages scope and aggregates items across document', () => {
    render(<TakeoffInspectorTab />);

    const allPagesBtn = screen.getByRole('button', { name: 'All Pages' });
    fireEvent.click(allPagesBtn);

    // Across all pages, there are 3 items (2 Rest Axial Stop + 1 Guide Support)
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Guide Support')).toBeInTheDocument();
  });

  it('triggers CSV download when Export button is clicked', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    render(<TakeoffInspectorTab />);

    const exportBtn = screen.getByRole('button', { name: /export csv/i });
    expect(exportBtn).toBeEnabled();
    fireEvent.click(exportBtn);

    expect(createObjectURL).toHaveBeenCalled();
  });

  it('opens ScaleCalibrationDialog when clicking Change scale', () => {
    render(<TakeoffInspectorTab />);

    const changeBtn = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeBtn);

    expect(screen.getByText('Drawing Scale Calibration')).toBeInTheDocument();
  });

  it('extracts 5-table piping model and copies TSV for XML Builder when lines exist', async () => {
    // Add a line annotation on page 1
    useAnnotationStore.setState({
      annotations: [
        {
          id: 'line-1',
          type: 'line',
          pageNumber: 1,
          rect: { x: 72, y: 72, width: 72, height: 0 },
          createdAt: 10,
          updatedAt: 10,
          data: {
            branchName: '/PIPE-4"-MAIN/B1',
            elevationZ: 105000,
          },
        },
      ],
    });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<TakeoffInspectorTab />);

    expect(screen.getByText(/XML Builder & CAESAR II/i)).toBeInTheDocument();
    expect(screen.getByText('5-Table Model')).toBeInTheDocument();

    // Node 100 and Node 110 should be in the coordinate table / 3D wireframe
    expect(screen.getAllByText('100').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('110').length).toBeGreaterThanOrEqual(1);

    const copyBtn = screen.getByRole('button', { name: /copy coord tsv/i });
    expect(copyBtn).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain('BranchName\tNodeNumber\tX\tY\tZ');
    expect(copiedText).toContain('/PIPE-4"-MAIN/B1\t100\t');
    expect(copiedText).toContain('\t105000');
  });

  it('switches between 5 XML Builder sub-tabs', () => {
    useAnnotationStore.setState({
      annotations: [
        {
          id: 'line-1',
          type: 'line',
          pageNumber: 1,
          rect: { x: 72, y: 72, width: 72, height: 0 },
          data: { branchName: '/SYS-008A/B1' },
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: 'supp-1',
          type: 'piping-support',
          pageNumber: 1,
          rect: { x: 72, y: 72, width: 20, height: 20 },
          data: { restraintType: 'ANC', nodeName: 'ANC-100' },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });

    render(<TakeoffInspectorTab />);

    // Switch to Branches tab
    fireEvent.click(screen.getByRole('button', { name: /branches/i }));
    expect(screen.getByText('Bore')).toBeInTheDocument();
    expect(screen.getByText('/SYS-008A/B1')).toBeInTheDocument();

    // Switch to Supports tab
    fireEvent.click(screen.getByRole('button', { name: /supports/i }));
    expect(screen.getByText('Support Tag')).toBeInTheDocument();
    expect(screen.getByText('ANC-100')).toBeInTheDocument();
  });

  it('compiles and downloads CAESAR II XML when Download CII XML is clicked', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-xml-url');
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    render(<TakeoffInspectorTab />);

    const downloadBtn = screen.getByRole('button', { name: /download cii xml/i });
    expect(downloadBtn).toBeInTheDocument();
    fireEvent.click(downloadBtn);

    expect(createObjectURL).toHaveBeenCalled();
  });

  it('opens XML Builder web app when Open in XML Builder is clicked', () => {
    const openMock = vi.fn();
    window.open = openMock;

    render(<TakeoffInspectorTab />);

    const launchBtn = screen.getByRole('button', { name: /open in xml builder/i });
    expect(launchBtn).toBeInTheDocument();
    fireEvent.click(launchBtn);

    expect(openMock).toHaveBeenCalled();
    const url = openMock.mock.calls[0][0];
    expect(url).toContain('https://reallakshman19.github.io/XML_Compare_Utilities');
    expect(url).toContain('tool=xml-builder#customInput=');
  });

  it('stamps takeoff schedule directly onto the drawing sheet as a table textbox', async () => {
    render(<TakeoffInspectorTab />);

    const stampBtn = screen.getByRole('button', { name: /stamp to sheet/i });
    expect(stampBtn).toBeEnabled();

    await act(async () => {
      fireEvent.click(stampBtn);
    });

    const annotations = useAnnotationStore.getState().annotations;
    const tableAnnot = annotations.find((a) => String(a.data?.text).includes('QUANTITY TAKEOFF / BILL OF MATERIALS'));
    expect(tableAnnot).toBeDefined();
    expect(tableAnnot?.type).toBe('textbox');
    expect(tableAnnot?.pageNumber).toBe(1);
    expect(tableAnnot?.data?.fontFamily).toBe('monospace');
  });

  it('toggles workspace 3D Canvas tab and displays active status banner', () => {
    useEditorStore.setState({ workspaceViewMode: '2d' });
    render(<TakeoffInspectorTab />);

    // 3D viewer is rendered by default in 2D mode
    expect(screen.getByTestId('piping-3d-viewer')).toBeInTheDocument();

    // Click "Open in Tab" button
    const open3dTabBtn = screen.getByTestId('takeoff-open-3d-tab-btn');
    fireEvent.click(open3dTabBtn);

    // workspaceViewMode in editor store is now '3d'
    expect(useEditorStore.getState().workspaceViewMode).toBe('3d');
    expect(screen.getByTestId('takeoff-3d-active-banner')).toBeInTheDocument();
    expect(screen.getByText('Viewing in Main 3D Canvas Tab')).toBeInTheDocument();

    // Toggle back to 2D
    fireEvent.click(screen.getByRole('button', { name: /return to 2d/i }));
    expect(useEditorStore.getState().workspaceViewMode).toBe('2d');
    expect(screen.queryByTestId('takeoff-3d-active-banner')).toBeNull();
  });

  it('allows switching 3D routing mode between Plan and ISO', () => {
    render(<TakeoffInspectorTab />);

    const modeSelect = screen.getByLabelText('3D Routing Mode') as HTMLSelectElement;
    expect(modeSelect.value).toBe('plan');

    fireEvent.change(modeSelect, { target: { value: 'isometric' } });
    expect(modeSelect.value).toBe('isometric');
  });
});
