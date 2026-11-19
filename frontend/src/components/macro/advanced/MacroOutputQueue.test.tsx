import React from 'react';
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

function StatefulQueue({ onError }: { onError?: (message: string) => void }) {
  const [items, setItems] = React.useState(outputs);
  return <MacroOutputQueue outputs={items} onChange={setItems} onError={onError} />;
}

describe('MacroOutputQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMock.mockResolvedValue(null);
  });

  it('shows an empty state when no outputs exist', () => {
    render(<MacroOutputQueue outputs={[]} onChange={vi.fn()} />);

    expect(screen.getByText('No generated output files.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save All' })).toBeDisabled();
  });

  it('saves one output and removes only that item', async () => {
    render(<StatefulQueue />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => {
      expect(screen.queryByText('one.pdf')).not.toBeInTheDocument();
    });
    expect(screen.getByText('two.pdf')).toBeInTheDocument();
    expect(saveMock).toHaveBeenCalledWith(outputs[0].bytes, 'one.pdf', null);
  });

  it('saves every queued output and removes each acknowledged item', async () => {
    render(<StatefulQueue />);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText('No generated output files.')).toBeInTheDocument();
    });
  });

  it('keeps only unsaved items after a partial failure and does not save successes twice', async () => {
    const onError = vi.fn();
    saveMock
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(null);

    render(<StatefulQueue onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('disk full');
      expect(screen.queryByText('one.pdf')).not.toBeInTheDocument();
    });
    expect(screen.getByText('two.pdf')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('disk full');

    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    await waitFor(() => {
      expect(screen.getByText('No generated output files.')).toBeInTheDocument();
    });
    expect(saveMock.mock.calls.map((call) => call[1])).toEqual([
      'one.pdf', 'two.pdf', 'two.pdf',
    ]);
  });

  it('disables conflicting queue actions while a save is in flight', async () => {
    let completeFirstSave: (() => void) | undefined;
    saveMock.mockImplementationOnce(() => new Promise<null>((resolve) => {
      completeFirstSave = () => resolve(null);
    }));
    render(<StatefulQueue />);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));

    expect(screen.getByRole('button', { name: 'Save All' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    for (const saveButton of screen.getAllByRole('button', { name: 'Save' })) {
      expect(saveButton).toBeDisabled();
    }
    expect(saveMock).toHaveBeenCalledTimes(1);

    completeFirstSave?.();
    await waitFor(() => {
      expect(screen.getByText('No generated output files.')).toBeInTheDocument();
      expect(saveMock).toHaveBeenCalledTimes(2);
    });
  });

  it('clears queued outputs without writing files', () => {
    const onChange = vi.fn();
    render(<MacroOutputQueue outputs={outputs} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenCalledWith([]);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
