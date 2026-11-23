import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TextSelectionActionBubble } from '../TextSelectionActionBubble';

describe('TextSelectionActionBubble', () => {
  const defaultProps = {
    pageWidth: 800,
    pageHeight: 1000,
    scale: 1,
    unionRect: { x: 100, y: 150, width: 200, height: 20 },
    selectedText: 'Sample selected PDF text',
    onHighlight: vi.fn(),
    onUnderline: vi.fn(),
    onStrikeout: vi.fn(),
    onSquiggly: vi.fn(),
    onStickyNote: vi.fn(),
    onCallout: vi.fn(),
    onDismiss: vi.fn(),
    onCopy: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with role="toolbar" and accessible labels', () => {
    render(<TextSelectionActionBubble {...defaultProps} />);
    const toolbar = screen.getByRole('toolbar', { name: /text selection actions/i });
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByTestId('bubble-action-highlight')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-action-underline')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-action-strikeout')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-action-squiggly')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-action-note')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-action-callout')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-action-copy')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-action-dismiss')).toBeInTheDocument();
  });

  it('triggers action callbacks when buttons are clicked', () => {
    render(<TextSelectionActionBubble {...defaultProps} />);

    fireEvent.click(screen.getByTestId('bubble-action-highlight'));
    expect(defaultProps.onHighlight).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('bubble-action-underline'));
    expect(defaultProps.onUnderline).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('bubble-action-strikeout'));
    expect(defaultProps.onStrikeout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('bubble-action-squiggly'));
    expect(defaultProps.onSquiggly).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('bubble-action-note'));
    expect(defaultProps.onStickyNote).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('bubble-action-callout'));
    expect(defaultProps.onCallout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('bubble-action-dismiss'));
    expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('copies text to clipboard and displays copied badge', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<TextSelectionActionBubble {...defaultProps} />);
    const copyBtn = screen.getByTestId('bubble-action-copy');

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith('Sample selected PDF text');
    expect(defaultProps.onCopy).toHaveBeenCalledWith('Sample selected PDF text');
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('positions above selection when y >= 45', () => {
    render(<TextSelectionActionBubble {...defaultProps} unionRect={{ x: 100, y: 150, width: 200, height: 20 }} />);
    const toolbar = screen.getByTestId('text-selection-action-bubble');
    // Top is y * scale - 42 = 150 - 42 = 108
    expect(toolbar.style.top).toBe('108px');
  });

  it('flips below selection when near top edge (y < 45)', () => {
    render(<TextSelectionActionBubble {...defaultProps} unionRect={{ x: 100, y: 20, width: 200, height: 15 }} />);
    const toolbar = screen.getByTestId('text-selection-action-bubble');
    // Flips below: bottom (20 + 15 = 35) + 8 = 43px
    expect(toolbar.style.top).toBe('43px');
  });

  it('clamps left position within page boundaries', () => {
    // Extreme left
    const { rerender } = render(
      <TextSelectionActionBubble {...defaultProps} unionRect={{ x: 0, y: 100, width: 20, height: 20 }} />,
    );
    let toolbar = screen.getByTestId('text-selection-action-bubble');
    expect(parseInt(toolbar.style.left, 10)).toBeGreaterThanOrEqual(8);

    // Extreme right
    rerender(
      <TextSelectionActionBubble
        {...defaultProps}
        pageWidth={500}
        unionRect={{ x: 480, y: 100, width: 20, height: 20 }}
      />,
    );
    toolbar = screen.getByTestId('text-selection-action-bubble');
    expect(parseInt(toolbar.style.left, 10)).toBeLessThanOrEqual(500 - 370);
  });

  it('dismisses when Escape key is pressed', () => {
    render(<TextSelectionActionBubble {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
  });
});
