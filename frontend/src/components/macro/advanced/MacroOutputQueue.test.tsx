import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { FileAdapter } from '@/adapters/file/FileAdapter';
import { MacroOutputQueue, type MacroOutputQueueItem } from './MacroOutputQueue';

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: {
    savePdfBytes: vi.fn(),
  },
}));

vi.mock('@/core/logger/service', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

const saveMock = vi.mocked(FileAdapter.savePdfBytes);

const outputs: MacroOutputQueueItem[] = [
  {
    id: 'one',
    name: 'one.pdf',
    bytes: new Uint8Array([1]),
  },
  {
    id: 'two',
    name: 'two.pdf',
    bytes: new Uint8Array([2]),
  },
];

describe('MacroOutputQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMock.mockResolvedValue(undefined);
  });

  it('shows an empty state when no outputs exist', () => {
    render(<MacroOutputQueue outputs={[]} onChange={vi.fn()} />);

    expect(screen.getByText('No generated output files.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save All' })).toBeDisabled();
  });

  it('saves one output and removes only that item', async () => {
    const onChange = vi.fn();
    render(<MacroOutputQueue outputs={outputs} onChange={onChange} />);

    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(
        outputs[0].bytes,
        'one.pdf',
        null,
      );
    });

    expect(onChange).toHaveBeenCalledWith([outputs[1]]);
  });

  it('saves every queued output and then clears the queue', async () => {
    const onChange = vi.fn();
    render(<MacroOutputQueue outputs={outputs} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(2);
    });

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('stops Save All on failure, preserves queue, and reports the error', async () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    saveMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk full'));

    render(
      <MacroOutputQueue
        outputs={outputs}
        onChange={onChange}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('disk full');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('disk full');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears queued outputs without writing files', () => {
    const onChange = vi.fn();
    render(<MacroOutputQueue outputs={outputs} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenCalledWith([]);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
