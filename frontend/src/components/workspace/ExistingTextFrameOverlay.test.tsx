import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExistingTextFrameOverlay } from './ExistingTextFrameOverlay';
import { commandBus } from '@/core/commands/bus';

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: vi.fn().mockResolvedValue({ success: true, message: 'Command executed' }),
  },
}));

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    acquireDocument: vi.fn().mockRejectedValue(new Error('Mock: use fallback frame')),
  },
}));

describe('ExistingTextFrameOverlay', () => {
  const defaultProps = {
    pageNumber: 1,
    pageId: 'page-1',
    scale: 1,
    viewportWidth: 800,
    viewportHeight: 1000,
    workingBytes: new Uint8Array([1, 2, 3]),
    documentKey: 'doc-key-1',
    selectedSourceIndex: 5,
    textItem: {
      id: 'item-5',
      sourceIndex: 5,
      text: 'Specification Paragraph Header',
      x: 100,
      y: 200,
      width: 250,
      height: 30,
      fontSize: 16,
    },
    onDeselect: vi.fn(),
    onOpenEditor: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders frame overlay with dashed boundary and 8 control handles', () => {
    render(<ExistingTextFrameOverlay {...defaultProps} />);

    const overlay = screen.getByTestId('existing-text-frame-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveStyle({
      left: '100px',
      top: '200px',
      width: '250px',
      height: '30px',
    });

    expect(screen.getByTestId('frame-handle-nw')).toBeInTheDocument();
    expect(screen.getByTestId('frame-handle-n')).toBeInTheDocument();
    expect(screen.getByTestId('frame-handle-ne')).toBeInTheDocument();
    expect(screen.getByTestId('frame-handle-e')).toBeInTheDocument();
    expect(screen.getByTestId('frame-handle-se')).toBeInTheDocument();
    expect(screen.getByTestId('frame-handle-s')).toBeInTheDocument();
    expect(screen.getByTestId('frame-handle-sw')).toBeInTheDocument();
    expect(screen.getByTestId('frame-handle-w')).toBeInTheDocument();
  });

  it('triggers onOpenEditor when double clicking the frame body', () => {
    const onOpenEditor = vi.fn();
    render(<ExistingTextFrameOverlay {...defaultProps} onOpenEditor={onOpenEditor} />);

    const body = screen.getByTestId('frame-drag-body');
    fireEvent.doubleClick(body);

    expect(onOpenEditor).toHaveBeenCalledTimes(1);
  });

  it('triggers onDeselect when clicking the close button or pressing Escape', () => {
    const onDeselect = vi.fn();
    render(<ExistingTextFrameOverlay {...defaultProps} onDeselect={onDeselect} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('initiates move drag gesture and dispatches MOVE_EXISTING_TEXT_BLOCK command on release', async () => {
    render(<ExistingTextFrameOverlay {...defaultProps} />);

    const body = screen.getByTestId('frame-drag-body');
    fireEvent.pointerDown(body, { clientX: 100, clientY: 200 });

    fireEvent.pointerMove(window, { clientX: 150, clientY: 240 });

    // Verify guideline overlay is visible while dragging
    expect(screen.getByTestId('frame-guidelines')).toBeInTheDocument();
    expect(screen.getByTestId('frame-ghost-preview')).toBeInTheDocument();

    fireEvent.pointerUp(window, { clientX: 150, clientY: 240 });

    expect(commandBus.execute).toHaveBeenCalled();
    const { command } = vi.mocked(commandBus.execute).mock.calls[0][0];
    expect(command.type).toBe('MOVE_EXISTING_TEXT_BLOCK');
    if (command.type !== 'MOVE_EXISTING_TEXT_BLOCK') return;
    expect(command.payload.sourcePageIndex).toBe(0);
    expect(command.payload.sourcePageId).toBe('page-1');
    expect(command.payload.intent.targetPosition).toBeDefined();
  });

  it('initiates East resize drag and dispatches RESIZE_EXISTING_TEXT_BLOCK command on release', async () => {
    render(<ExistingTextFrameOverlay {...defaultProps} />);

    const handleE = screen.getByTestId('frame-handle-e');
    fireEvent.pointerDown(handleE, { clientX: 350, clientY: 215 });

    fireEvent.pointerMove(window, { clientX: 420, clientY: 215 });

    // Live reflow preview visible during resize
    expect(screen.getByTestId('frame-reflow-preview')).toBeInTheDocument();

    fireEvent.pointerUp(window, { clientX: 420, clientY: 215 });

    expect(commandBus.execute).toHaveBeenCalled();
    const { command } = vi.mocked(commandBus.execute).mock.calls[0][0];
    expect(command.type).toBe('RESIZE_EXISTING_TEXT_BLOCK');
    if (command.type !== 'RESIZE_EXISTING_TEXT_BLOCK') return;
    expect(command.payload.sourcePageIndex).toBe(0);
    expect(command.payload.sourcePageId).toBe('page-1');
    expect(command.payload.intent.newWidthPt).toBeGreaterThan(250);
    expect(command.payload.intent.handle).toBe('e');
  });
});
