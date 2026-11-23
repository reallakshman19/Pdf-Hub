import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InlineExistingTextEditor } from '../InlineExistingTextEditor';
import {
  evaluateExistingTextUiCapability,
  type ExistingTextUiCapability,
} from '@/adapters/pdf-text/PdfLibExistingTextUiEvaluation';
import { commandBus } from '@/core/commands/bus';
import type { CommandResult } from '@/core/commands/types';

vi.mock('@/adapters/pdf-text/PdfLibExistingTextUiEvaluation', () => ({
  evaluateExistingTextUiCapability: vi.fn(),
}));

vi.mock('@/adapters/pdf-renderer/PdfRendererAdapter', () => ({
  PdfRendererAdapter: {
    acquireDocument: vi.fn().mockResolvedValue({
      doc: {
        getPage: vi.fn().mockResolvedValue({
          cleanup: vi.fn(),
        }),
      },
      release: vi.fn(),
    }),
    getPageExistingTextSourceItems: vi.fn().mockResolvedValue([
      {
        sourceIndex: 0,
        text: 'Original Text',
        direction: 'ltr',
        width: 80,
        height: 14,
        transform: [12, 0, 0, 12, 100, 200],
        fontName: 'Helvetica',
        hasEol: false,
      },
    ]),
  },
}));

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: vi.fn(),
  },
}));

const mockAddToast = vi.fn();
vi.mock('@/core/toast/store', () => ({
  useToastStore: (selector: (state: unknown) => unknown) =>
    selector({
      addToast: mockAddToast,
    }),
}));

describe('InlineExistingTextEditor', () => {
  const mockOnCommitSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  const defaultProps = {
    pageNumber: 1,
    pageId: 'page-1',
    sourceIndex: 0,
    initialText: 'Original Text',
    bounds: {
      left: 100,
      top: 200,
      width: 80,
      height: 14,
      fontSize: 12,
    },
    workingBytes: new Uint8Array([1, 2, 3]),
    documentKey: 'doc-rev-1',
    onCommitSuccess: mockOnCommitSuccess,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input with initial text and focused', async () => {
    await act(async () => {
      await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });
    });
    const input = screen.getByTestId('inline-existing-text-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Original Text');
  });

  it('evaluates capability on edit and displays "Fits" badge when native fit succeeds', async () => {
    vi.mocked(evaluateExistingTextUiCapability).mockResolvedValue({
      status: 'native',
      intent: {
        schemaVersion: 1,
        kind: 'direct-replace',
        pageNumber: 1,
        pageId: 'page-1',
        spanId: 'p1-span-0',
        originalText: 'Original Text',
        replacementText: 'New Text',
        replacementFont: 'Helvetica',
        replacementFontSize: 12,
        targetBounds: { x: 100, y: 200, width: 80, height: 14 },
        visualDiffMode: 'strict-advance',
      },
      provenance: {
        pageNumber: 1,
        streamIndex: 0,
        operatorIndex: 2,
        operator: 'Tj',
        fontResourceName: '/F1',
        fontSize: 12,
        originalText: 'Original Text',
        targetBounds: { x: 100, y: 200, width: 80, height: 14 },
      },
      nativeFit: {
        schemaVersion: 1,
        status: 'fits',
        observedAdvancePt: 80,
        projectedReplacementAdvancePt: 65,
        deltaAdvancePt: -15,
        fontSizePt: 12,
        tolerancePt: 0.25,
      },
    } as unknown as ExistingTextUiCapability);

    await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });
    const input = screen.getByTestId('inline-existing-text-input');

    fireEvent.change(input, { target: { value: 'New Text' } });

    await waitFor(() => {
      expect(screen.getByTestId('inline-existing-text-badge')).toBeInTheDocument();
      expect(screen.getByText(/Fits \(65.0pt\)/)).toBeInTheDocument();
    });
  });

  it('commits REPLACE_EXISTING_TEXT command when Enter is pressed on valid native edit', async () => {
    vi.mocked(evaluateExistingTextUiCapability).mockResolvedValue({
      status: 'native',
      intent: {
        schemaVersion: 1,
        kind: 'direct-replace',
        pageNumber: 1,
        pageId: 'page-1',
        spanId: 'p1-span-0',
        originalText: 'Original Text',
        replacementText: 'New Text',
        replacementFont: 'Helvetica',
        replacementFontSize: 12,
        targetBounds: { x: 100, y: 200, width: 80, height: 14 },
        visualDiffMode: 'strict-advance',
      },
      provenance: {
        pageNumber: 1,
        streamIndex: 0,
        operatorIndex: 2,
        operator: 'Tj',
        fontResourceName: '/F1',
        fontSize: 12,
        originalText: 'Original Text',
        targetBounds: { x: 100, y: 200, width: 80, height: 14 },
      },
      nativeFit: {
        schemaVersion: 1,
        status: 'fits',
        observedAdvancePt: 80,
        projectedReplacementAdvancePt: 65,
        deltaAdvancePt: -15,
        fontSizePt: 12,
        tolerancePt: 0.25,
      },
    } as unknown as ExistingTextUiCapability);

    vi.mocked(commandBus.execute).mockResolvedValue({
      success: true,
      mutated: true,
      message: 'Replaced text in content stream 0',
      documentKey: 'doc-rev-2',
    } as unknown as CommandResult);

    await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });
    const input = screen.getByTestId('inline-existing-text-input');

    fireEvent.change(input, { target: { value: 'New Text' } });

    await waitFor(() => {
      expect(screen.getByText(/Fits/)).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      expect(mockOnCommitSuccess).toHaveBeenCalledTimes(1);
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Text replaced natively',
        }),
      );
    });
  });

  it('shows missing glyph badge and blocks commit on Enter when characters are missing from subset', async () => {
    vi.mocked(evaluateExistingTextUiCapability).mockResolvedValue({
      status: 'unavailable',
      reasons: ['The font subset does not contain characters: é.'],
      nativeFit: {
        schemaVersion: 1,
        status: 'unmeasurable',
        reason: 'MISSING_SUBSET_GLYPHS',
        missingCharacters: ['é'],
        baseFont: 'SubsetFont',
        sourceText: 'Original Text',
        replacementText: 'Original Text é',
        observedAdvancePt: 80,
        fontSizePt: 12,
        tolerancePt: 0.25,
      },
    });

    await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });
    const input = screen.getByTestId('inline-existing-text-input');

    fireEvent.change(input, { target: { value: 'Original Text é' } });

    await waitFor(() => {
      expect(screen.getByText('Missing glyph: é')).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(mockOnCommitSuccess).not.toHaveBeenCalled();
  });

  it('toggles bold and italic and modifies font size using format strip', async () => {
    await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });

    const boldBtn = screen.getByTestId('inline-bold-toggle');
    const italicBtn = screen.getByTestId('inline-italic-toggle');
    const plusBtn = screen.getByTestId('inline-size-plus');
    const minusBtn = screen.getByTestId('inline-size-minus');

    expect(screen.getByText('12pt')).toBeInTheDocument();

    fireEvent.click(boldBtn);
    fireEvent.click(italicBtn);
    fireEvent.click(plusBtn);

    expect(screen.getByText('13pt')).toBeInTheDocument();

    fireEvent.click(minusBtn);
    expect(screen.getByText('12pt')).toBeInTheDocument();
  });

  it('toggles alignment buttons (Left, Center, Right) on the format strip', async () => {
    await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });

    const alignLeft = screen.getByTestId('inline-align-left');
    const alignCenter = screen.getByTestId('inline-align-center');
    const alignRight = screen.getByTestId('inline-align-right');

    expect(alignLeft).toBeInTheDocument();
    expect(alignCenter).toBeInTheDocument();
    expect(alignRight).toBeInTheDocument();

    fireEvent.click(alignCenter);
    const input = screen.getByTestId('inline-existing-text-input');
    expect(input).toHaveStyle({ textAlign: 'center' });

    fireEvent.click(alignRight);
    expect(input).toHaveStyle({ textAlign: 'right' });
  });

  it('cancels inline editing when Escape key is pressed', async () => {
    await act(async () => {
      await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });
    });
    const input = screen.getByTestId('inline-existing-text-input');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels without dispatch when Enter is pressed without changing text', async () => {
    await act(async () => {
      await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });
    });
    const input = screen.getByTestId('inline-existing-text-input');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('toggles paragraph mode and commits REPLACE_EXISTING_PARAGRAPH on Ctrl+Enter', async () => {
    vi.mocked(commandBus.execute).mockResolvedValue({
      success: true,
      mutated: true,
      message: 'Replaced paragraph in content stream',
      documentKey: 'doc-rev-3',
    } as unknown as CommandResult);

    await act(async () => {
      render(<InlineExistingTextEditor {...defaultProps} />);
    });

    const toggleBtn = screen.getByTestId('inline-paragraph-mode-toggle');
    expect(toggleBtn).toBeInTheDocument();

    // Toggle paragraph mode
    fireEvent.click(toggleBtn);

    // Textarea should now be present
    const textarea = screen.getByTestId('inline-existing-text-textarea') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();

    // Change text in paragraph mode
    fireEvent.change(textarea, { target: { value: 'Multi line\nreflowed text' } });

    // Live reflow badge should be visible
    await waitFor(() => {
      expect(screen.getByText(/Paragraph reflow/)).toBeInTheDocument();
    });

    // Press Ctrl+Enter to commit
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(commandBus.execute).mock.calls[0][0];
      expect(callArg.command.type).toBe('REPLACE_EXISTING_PARAGRAPH');
      expect(mockOnCommitSuccess).toHaveBeenCalledTimes(1);
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Paragraph reflowed and replaced',
        }),
      );
    });
  });

  it('detects table cell, displays cell indicator, and dispatches EDIT_TABLE_CELL_TEXT', async () => {
    const { PdfRendererAdapter } = await import('@/adapters/pdf-renderer/PdfRendererAdapter');
    vi.mocked(PdfRendererAdapter.getPageExistingTextSourceItems).mockResolvedValueOnce([
      {
        sourceIndex: 0,
        text: 'Item',
        direction: 'ltr',
        width: 40,
        height: 12,
        transform: [12, 0, 0, 12, 50, 200],
        fontName: 'Helvetica',
        hasEol: false,
      },
      {
        sourceIndex: 1,
        text: '$100.00',
        direction: 'ltr',
        width: 45,
        height: 12,
        transform: [12, 0, 0, 12, 150, 200],
        fontName: 'Helvetica',
        hasEol: false,
      },
      {
        sourceIndex: 2,
        text: 'Widget',
        direction: 'ltr',
        width: 40,
        height: 12,
        transform: [12, 0, 0, 12, 50, 185],
        fontName: 'Helvetica',
        hasEol: false,
      },
      {
        sourceIndex: 3,
        text: '$250.00',
        direction: 'ltr',
        width: 45,
        height: 12,
        transform: [12, 0, 0, 12, 150, 185],
        fontName: 'Helvetica',
        hasEol: false,
      },
    ]);

    vi.mocked(commandBus.execute).mockResolvedValueOnce({
      success: true,
      message: 'Table cell updated',
      nextWorkingBytes: new Uint8Array([1, 2, 3]),
      commandId: 'cmd-cell-1',
      commandType: 'EDIT_TABLE_CELL_TEXT',
    } as any);

    await act(async () => {
      render(
        <InlineExistingTextEditor
          {...defaultProps}
          sourceIndex={1}
          initialText="$100.00"
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('inline-table-cell-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('inline-table-cell-indicator')).toHaveTextContent('R1:C2');
    });

    const input = screen.getByTestId('inline-existing-text-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '$120.00' } });

    // Press Enter to commit
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(commandBus.execute).mock.calls[0][0];
      expect(callArg.command.type).toBe('EDIT_TABLE_CELL_TEXT');
      if (callArg.command.type === 'EDIT_TABLE_CELL_TEXT') {
        expect(callArg.command.payload.replacementText).toBe('$120.00');
      }
      expect(mockOnCommitSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('renders rotated text editor with CSS rotate transform and rotation indicator badge', async () => {
    const { PdfRendererAdapter } = await import('@/adapters/pdf-renderer/PdfRendererAdapter');
    vi.mocked(PdfRendererAdapter.getPageExistingTextSourceItems).mockResolvedValueOnce([
      {
        sourceIndex: 0,
        text: 'Vertical Pipe Tag',
        direction: 'ltr',
        width: 80,
        height: 12,
        transform: [0, 12, -12, 0, 100, 300], // 90 degrees
        fontName: 'Helvetica',
        hasEol: false,
      },
    ]);

    await act(async () => {
      render(
        <InlineExistingTextEditor
          {...defaultProps}
          bounds={{
            ...defaultProps.bounds,
            rotationDegrees: 90,
          }}
          initialText="Vertical Pipe Tag"
        />,
      );
    });

    const editorContainer = screen.getByTestId('inline-existing-text-editor');
    expect(editorContainer).toHaveStyle({
      transform: 'rotate(-90deg)',
    });

    await waitFor(() => {
      expect(screen.getByTestId('inline-rotation-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('inline-rotation-indicator')).toHaveTextContent('⟳ 90°');
    });
  });
});
