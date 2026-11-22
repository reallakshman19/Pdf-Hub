import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineTextEditor } from './InlineTextEditor';

describe('InlineTextEditor', () => {
  it('renders with initial value and applies typography', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    render(
      <InlineTextEditor
        defaultValue="Test Note"
        style={{
          fontSize: 14,
          fontFamily: 'Helvetica',
          color: '#2563eb',
          textAlign: 'center',
          backgroundColor: 'transparent',
        }}
        bounds={{ width: 100, height: 30 }}
        scale={1}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Test Note');
    expect(textarea.style.fontSize).toBe('14px');
    expect(textarea.style.color).toBe('rgb(37, 99, 235)');
    expect(textarea.style.textAlign).toBe('center');
    expect(textarea.style.overflow).toBe('hidden');
    expect(textarea.style.resize).toBe('none');
  });

  it('commits on Enter (without Shift) and cancels on Escape', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    render(
      <InlineTextEditor
        defaultValue="Initial"
        style={{ fontSize: 12 }}
        bounds={{ width: 100, height: 30 }}
        scale={1}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Committed Text' } });

    // Enter commits
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onCommit).toHaveBeenCalledWith('Committed Text');

    // Escape cancels
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not commit on Enter while IME composition is active', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    render(
      <InlineTextEditor
        defaultValue=""
        style={{ fontSize: 12 }}
        bounds={{ width: 100, height: 30 }}
        scale={1}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );

    const textarea = screen.getByRole('textbox');

    // Start composition
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onCommit).not.toHaveBeenCalled();

    // End composition
    fireEvent.compositionEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('inserts CAD symbols and passes style updates when formatting is adjusted', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    render(
      <InlineTextEditor
        defaultValue="Pipe "
        style={{ fontSize: 12, textColor: '#111827' }}
        bounds={{ width: 120, height: 30 }}
        scale={1}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );

    // Open CAD symbols popover
    const symbolBtn = screen.getByTitle(/insert engineering symbol/i);
    fireEvent.click(symbolBtn);

    // Click Diameter symbol
    const diameterBtn = screen.getByTitle('Diameter');
    fireEvent.click(diameterBtn);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Pipe Ø');

    // Click Bold toggle in floating toolbar
    const boldBtn = screen.getByTitle('Bold');
    fireEvent.click(boldBtn);

    // Commit
    const commitBtn = screen.getByTitle(/commit/i);
    fireEvent.click(commitBtn);

    expect(onCommit).toHaveBeenCalledWith('Pipe Ø', expect.objectContaining({ fontWeight: 'bold' }));
  });
});
