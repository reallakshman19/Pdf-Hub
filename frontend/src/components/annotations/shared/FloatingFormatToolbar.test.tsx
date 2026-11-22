import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FloatingFormatToolbar } from './FloatingFormatToolbar';

describe('FloatingFormatToolbar', () => {
  it('triggers style changes for font size, bold, italic, alignment, and transparent fill', () => {
    const onUpdateStyle = vi.fn();
    const onInsertSymbol = vi.fn();
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    render(
      <FloatingFormatToolbar
        fontSize={12}
        fontWeight="normal"
        fontStyle="normal"
        textColor="#111827"
        backgroundColor="#ffffff"
        textAlign="left"
        onUpdateStyle={onUpdateStyle}
        onInsertSymbol={onInsertSymbol}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );

    // Font size selector
    const select = screen.getByTitle('Font Size');
    fireEvent.change(select, { target: { value: '16' } });
    expect(onUpdateStyle).toHaveBeenCalledWith({ fontSize: 16 });

    // Bold toggle
    const boldBtn = screen.getByTitle('Bold');
    fireEvent.click(boldBtn);
    expect(onUpdateStyle).toHaveBeenCalledWith({ fontWeight: 'bold' });

    // Italic toggle
    const italicBtn = screen.getByTitle('Italic');
    fireEvent.click(italicBtn);
    expect(onUpdateStyle).toHaveBeenCalledWith({ fontStyle: 'italic' });

    // Align center
    const alignCenterBtn = screen.getByTitle('Align Center');
    fireEvent.click(alignCenterBtn);
    expect(onUpdateStyle).toHaveBeenCalledWith({ textAlign: 'center' });

    // Open color popover and click make transparent
    const paletteBtn = screen.getByTitle('Text & Background Color');
    fireEvent.click(paletteBtn);

    const transparentBtn = screen.getByRole('button', { name: /make transparent/i });
    fireEvent.click(transparentBtn);
    expect(onUpdateStyle).toHaveBeenCalledWith({ backgroundColor: 'transparent' });
  });

  it('renders unrotate button when annotation has rotation and toggles rotation', () => {
    const onToggleUnrotate = vi.fn();
    render(
      <FloatingFormatToolbar
        fontSize={12}
        rotation={90}
        isUnrotated={false}
        onToggleUnrotate={onToggleUnrotate}
        onUpdateStyle={vi.fn()}
        onInsertSymbol={vi.fn()}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const levelBtn = screen.getByTitle('Unrotate for Horizontal Typing');
    expect(levelBtn).toBeInTheDocument();
    fireEvent.click(levelBtn);
    expect(onToggleUnrotate).toHaveBeenCalledOnce();
  });
});
