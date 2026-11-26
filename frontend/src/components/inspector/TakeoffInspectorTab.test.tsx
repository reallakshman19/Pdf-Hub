import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPS, type PDFDocumentProxy } from 'pdfjs-dist';
import { TakeoffInspectorTab } from './TakeoffInspectorTab';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { usePdfStore } from '@/core/session/pdfStore';
import { useCadModelingStore } from '@/core/cad-modeling/store';
import { useCalloutStore } from '@/core/callout/store';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';

describe('TakeoffInspectorTab', () => {
  beforeEach(() => {
    usePdfStore.setState({ pdfDoc: null });
    useCadModelingStore.getState().reset();
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

  it('ports PDF page vectors to canvas annotations and arms ROI region capture', async () => {
    const packedPipe = new Float32Array([
      0, 100, 100, // moveTo
      1, 200, 100, // lineTo
      1, 200, 180, // lineTo
    ]);
    const mockPage = {
      pageNumber: 1,
      getViewport: () => ({ width: 400, height: 300, transform: [1, 0, 0, -1, 0, 300] }),
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [OPS.constructPath],
        argsArray: [[OPS.stroke, [packedPipe], [100, 100, 200, 180]]],
      }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: '6"-P-300', width: 50, height: 10, transform: [10, 0, 0, 10, 120, 110] },
        ],
      }),
    };
    usePdfStore.setState({
      pdfDoc: {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
      } as unknown as PDFDocumentProxy,
    });
    useCadModelingStore.getState().reset();

    render(<TakeoffInspectorTab />);

    const portBtn = screen.getByTestId('port-page-vectors-btn');
    await act(async () => {
      fireEvent.click(portBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    const portedAnn = useAnnotationStore
      .getState()
      .annotations.find((a) => a.type === 'perimeter-takeoff');
    expect(portedAnn).toBeDefined();
    expect(portedAnn?.data.coordinateSpace).toBe('page');
    expect(portedAnn?.data.importedFromPdfVector).toBe(true);
    expect(screen.getByTestId('vector-port-status')).toHaveTextContent(/Ported 1 polylines/i);

    const regionBtn = screen.getByTestId('port-region-vectors-btn');
    fireEvent.click(regionBtn);
    expect(useCadModelingStore.getState().vectorRoiCapture).toMatchObject({
      mode: 'pipe',
      includeTextLabels: true,
      attachBranchLabels: true,
    });
  });

  it('offers Trace Polyline and OCR Region fallback controls when a scanned/raster PDF is detected', async () => {
    const mockRasterPage = {
      pageNumber: 1,
      getViewport: () => ({ width: 400, height: 300, transform: [1, 0, 0, -1, 0, 300] }),
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [OPS.paintImageXObject],
        argsArray: [['img1', 400, 300]],
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    };
    usePdfStore.setState({
      pdfDoc: {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockRasterPage),
      } as unknown as PDFDocumentProxy,
    });
    useCadModelingStore.getState().reset();
    useEditorStore.setState({ activeTool: 'select' });
    useCalloutStore.setState({ activeTool: 'select' });

    render(<TakeoffInspectorTab />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('port-page-vectors-btn'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('vector-port-status')).toHaveTextContent(/Scanned\/raster PDF/i);
    const traceBtn = screen.getByTestId('raster-fallback-trace-btn');
    fireEvent.click(traceBtn);
    expect(useEditorStore.getState().activeTool).toBe('perimeter-takeoff');

    const ocrBtn = screen.getByTestId('raster-fallback-ocr-btn');
    fireEvent.click(ocrBtn);
    expect(useCalloutStore.getState().activeTool).toBe('ocr-region');
  });

  it('auto-traces raster pipe runs onto canvas when Auto-Trace Pipe Runs is clicked', async () => {
    const W = 80;
    const H = 80;
    const pixels = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H * 4; i += 4) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }
    for (let x = 10; x <= 65; x++) {
      for (let dy = -1; dy <= 1; dy++) {
        const idx = ((35 + dy) * W + x) * 4;
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
      }
    }
    const rasterSpy = vi
      .spyOn(PdfRendererAdapter, 'rasterizePageRegion')
      .mockResolvedValue({ data: pixels, width: W, height: H, colorSpace: 'srgb' } as ImageData);

    const mockRasterPage = {
      pageNumber: 1,
      getViewport: () => ({ width: 80, height: 80, transform: [1, 0, 0, -1, 0, 80] }),
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [OPS.paintImageXObject],
        argsArray: [['img1', 80, 80]],
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    };
    usePdfStore.setState({
      pdfDoc: {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockRasterPage),
      } as unknown as PDFDocumentProxy,
    });
    useCadModelingStore.getState().reset();
    useAnnotationStore.setState({ annotations: [] });

    render(<TakeoffInspectorTab />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('port-page-vectors-btn'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const autoTraceBtn = screen.getByTestId('raster-autotrace-btn');
    fireEvent.click(autoTraceBtn);

    await waitFor(() => {
      expect(screen.getByTestId('vector-port-status')).toHaveTextContent(/Auto-traced/i);
    });

    expect(rasterSpy).toHaveBeenCalledTimes(1);
    const tracedAnns = useAnnotationStore
      .getState()
      .annotations.filter((a) => a.data.importedFromRasterTrace === true);
    expect(tracedAnns.length).toBeGreaterThan(0);
    expect(tracedAnns[0].type).toBe('perimeter-takeoff');
    rasterSpy.mockRestore();
  });

  it('forwards ROI region and Bradley tuning options from raster panel controls', async () => {
    const W = 50;
    const H = 50;
    const pixels = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H * 4; i += 4) {
      pixels[i] = 240;
      pixels[i + 1] = 240;
      pixels[i + 2] = 240;
      pixels[i + 3] = 255;
    }
    for (let x = 5; x <= 42; x++) {
      for (let dy = -1; dy <= 1; dy++) {
        const idx = ((25 + dy) * W + x) * 4;
        pixels[idx] = 10;
        pixels[idx + 1] = 10;
        pixels[idx + 2] = 10;
      }
    }
    const rasterSpy = vi
      .spyOn(PdfRendererAdapter, 'rasterizePageRegion')
      .mockResolvedValue({ data: pixels, width: W, height: H, colorSpace: 'srgb' } as ImageData);

    const mockRasterPage = {
      pageNumber: 1,
      getViewport: () => ({ width: 200, height: 200, transform: [1, 0, 0, -1, 0, 200] }),
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [OPS.paintImageXObject],
        argsArray: [['img1', 200, 200]],
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    };
    usePdfStore.setState({
      pdfDoc: {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockRasterPage),
      } as unknown as PDFDocumentProxy,
    });
    useCadModelingStore.getState().reset();
    useCadModelingStore.setState({
      lastRasterRegionRect: { x: 20, y: 30, width: 50, height: 50 },
      vectorRoiStatus: 'Scanned/raster region (1 image(s), 0 vectors). Auto-Trace ready for cropped region.',
    });
    useAnnotationStore.setState({ annotations: [] });

    render(<TakeoffInspectorTab />);

    fireEvent.change(screen.getByTestId('raster-method-select'), { target: { value: 'bradley' } });
    fireEvent.change(screen.getByTestId('raster-rdp-select'), { target: { value: '0.8' } });
    fireEvent.change(screen.getByTestId('raster-minlen-select'), { target: { value: '10' } });

    expect(useCadModelingStore.getState().rasterThresholdMethod).toBe('bradley');
    expect(useCadModelingStore.getState().rasterRdpEpsilonPx).toBe(0.8);
    expect(useCadModelingStore.getState().rasterMinLengthPx).toBe(10);

    const traceRegionBtn = screen.getByTestId('raster-autotrace-btn');
    expect(traceRegionBtn).toHaveTextContent('Auto-Trace Region');
    fireEvent.click(traceRegionBtn);

    await waitFor(() => {
      expect(screen.getByTestId('vector-port-status')).toHaveTextContent(/cropped region/i);
    });

    expect(rasterSpy).toHaveBeenCalledWith(
      mockRasterPage,
      expect.objectContaining({
        regionRect: { x: 20, y: 30, width: 50, height: 50 },
      }),
    );
    rasterSpy.mockRestore();
  });
});
