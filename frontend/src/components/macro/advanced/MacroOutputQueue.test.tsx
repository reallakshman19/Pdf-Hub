import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { FileAdapter } from '@/adapters/file/FileAdapter';
import { MacroOutputQueue, type MacroOutputQueueItem } from './MacroOutputQueue';

vi.mock('@/adapters/file/FileAdapter', () => ({
  FileAdapter: { savePdfBytes: vi.fn() },
}));
vi.mock('@/core/logger/service', () => ({
  error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(),
}));

const saveMock = vi.mocked(FileAdapter.savePdfBytes);
const savedHandle = {} as FileSystemFileHandle;
const originals: MacroOutputQueueItem[] = [
  { id: 'one', name: 'one.pdf', bytes: new Uint8Array([1]) },
  { id: 'two', name: 'two.pdf', bytes: new Uint8Array([2]) },
];

function StatefulQueue({
  onError,
  canAdd = false,
}: {
  onError?: (message: string) => void;
  canAdd?: boolean;
}) {
  const [items, setItems] = React.useState(() => [...originals]);
  return (
    <>
      {canAdd ? (
        <button type="button" onClick={() => setItems((current) => [
          ...current,
          { id: 'three', name: 'three.pdf', bytes: new Uint8Array([3]) },
        ])}>Add generated output</button>
      ) : null}
      <MacroOutputQueue outputs={items} onChange={setItems} onError={onError} />
    </>
  );
}

describe('MacroOutputQueue delivery and retry contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMock.mockResolvedValue(savedHandle);
  });

  it('shows an empty queue with Save All disabled', () => {
    render(<MacroOutputQueue outputs={[]} onChange={vi.fn()} />);
    expect(screen.getByText('No generated output files.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save All' })).toBeDisabled();
  });

  it('removes only the acknowledged single saved item', async () => {
    render(<StatefulQueue />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Save', exact: true })[0]);
    await waitFor(() => expect(screen.queryByText('one.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('two.pdf')).toBeInTheDocument();
    expect(saveMock).toHaveBeenCalledWith(originals[0].bytes, 'one.pdf', null);
  });

  it('saves every queued output when native writes are acknowledged', async () => {
    render(<StatefulQueue />);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    await waitFor(() => expect(screen.getByText('No generated output files.')).toBeInTheDocument());
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it('on A success / B failure retries B without downloading A again', async () => {
    const onError = vi.fn();
    saveMock.mockResolvedValueOnce(savedHandle)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(savedHandle);
    render(<StatefulQueue onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('disk full'));
    expect(screen.queryByText('one.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('two.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    await waitFor(() => expect(screen.getByText('No generated output files.')).toBeInTheDocument());
    expect(saveMock).toHaveBeenCalledTimes(3);
    expect(saveMock.mock.calls.map((args) => args[1])).toEqual(['one.pdf', 'two.pdf', 'two.pdf']);
  });

  it('does not claim receipt from browser download fallback; user must confirm', async () => {
    saveMock.mockResolvedValueOnce(null).mockResolvedValueOnce(savedHandle);
    render(<StatefulQueue />);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    await waitFor(() => expect(screen.getByText('Download initiated — receipt unverified')).toBeInTheDocument());
    expect(screen.getByText('one.pdf')).toBeInTheDocument();
    expect(saveMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    expect(saveMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm received' }));
    await waitFor(() => expect(screen.queryByText('one.pdf')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    await waitFor(() => expect(screen.getByText('No generated output files.')).toBeInTheDocument());
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it('ignores duplicate Save All clicks while a write is in flight', async () => {
    let finish!: (value: FileSystemFileHandle) => void;
    saveMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    render(<StatefulQueue />);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    expect(saveMock).toHaveBeenCalledTimes(1);
    finish(savedHandle);
    await waitFor(() => expect(screen.getByText('No generated output files.')).toBeInTheDocument());
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it('preserves a new output C added while A and B are saving', async () => {
    let finish!: (value: FileSystemFileHandle) => void;
    saveMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    render(<StatefulQueue canAdd />);
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add generated output' }));
    expect(screen.getByText('three.pdf')).toBeInTheDocument();
    finish(savedHandle);
    await waitFor(() => expect(screen.queryByText('two.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('three.pdf')).toBeInTheDocument();
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it('clears output queue without triggering a write', async () => {
    render(<StatefulQueue />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.getByText('No generated output files.')).toBeInTheDocument());
    expect(saveMock).not.toHaveBeenCalled();
  });
});
