import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PsIsonoteRecipeBuilder } from './PsIsonoteRecipeBuilder';
import { useSessionStore } from '@/core/session/store';

const scanPsIsonoteReferences = vi.hoisted(() => vi.fn());

vi.mock('@/core/session/store', () => {
  const store = Object.assign(vi.fn(), { getState: vi.fn() });
  return { useSessionStore: store };
});

vi.mock('@/core/macro/psIsonote/psIsonoteRecipe', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/core/macro/psIsonote/psIsonoteRecipe')>();
  return {
    ...original,
    scanPsIsonoteReferences,
  };
});

describe('PsIsonoteRecipeBuilder structured-text admission', () => {
  const workingBytes = new Uint8Array([1, 2, 3]);

  beforeEach(() => {
    vi.clearAllMocks();
    const mockedStore = useSessionStore as unknown as {
      mockReturnValue: (value: unknown) => void;
      getState: ReturnType<typeof vi.fn>;
    };
    mockedStore.mockReturnValue({
      workingBytes,
      documentKey: 'document-key',
      fileName: 'drawing.pdf',
      pageCount: 1,
      selectedPages: [],
      viewState: { currentPage: 1 },
    });
    mockedStore.getState.mockReturnValue({
      workingBytes,
      documentKey: 'document-key',
    });
  });

  it('admits typed text and exposes compact accessible metrics', () => {
    render(<PsIsonoteRecipeBuilder />);
    const textarea = screen.getByLabelText('PS No. versus ISONOTE table');
    fireEvent.change(textarea, {
      target: { value: 'PS No.,ISONOTE\nPS-1000.1,GUIDE' },
    });

    expect(textarea).toHaveValue('PS No.,ISONOTE\nPS-1000.1,GUIDE');
    expect(screen.getByText(/1 unique mapping\(s\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText('PS ISONOTE admission metrics')).toHaveTextContent(
      '2 rows · 2 columns · 1 mappings · 35 bytes',
    );
  });

  it('routes embedded samples through the same admission boundary', () => {
    render(<PsIsonoteRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Load CSV PS ISONOTE sample' }));

    expect(screen.getByLabelText('PS No. versus ISONOTE table')).toHaveValue(
      expect.stringContaining('PS-11167.4'),
    );
    expect(screen.getByText(/3 unique mapping\(s\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText('PS ISONOTE admission metrics')).toHaveTextContent('3 mappings');
  });

  it('preserves the last admitted source and PDF when a typed candidate is rejected', () => {
    render(<PsIsonoteRecipeBuilder />);
    const textarea = screen.getByLabelText('PS No. versus ISONOTE table');
    const valid = 'PS No.,ISONOTE\nPS-1000.1,GUIDE';
    fireEvent.change(textarea, { target: { value: valid } });

    fireEvent.change(textarea, {
      target: { value: Array.from({ length: 17 }, (_, index) => `c${index}`).join(',') },
    });

    expect(textarea).toHaveValue(valid);
    expect(screen.getByText(/16-column limit/i)).toBeInTheDocument();
    expect(useSessionStore().workingBytes).toBe(workingBytes);
    expect(scanPsIsonoteReferences).not.toHaveBeenCalled();
  });

  it('admits a file once and resets the input so it can be selected again', async () => {
    const { container } = render(<PsIsonoteRecipeBuilder />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const source = 'PS No.\tISONOTE\nPS-1000.1\tGUIDE';
    const bytes = new TextEncoder().encode(source);
    const file = new File([bytes], 'mapping.tsv', { type: 'text/tab-separated-values' });
    const arrayBuffer = vi.fn(async () => bytes.buffer.slice(0));
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/1 unique mapping\(s\)/i)).toBeInTheDocument());
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Source: mapping.tsv')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('rejects oversized file metadata without reading bytes or clearing admitted state', async () => {
    const { container } = render(<PsIsonoteRecipeBuilder />);
    const textarea = screen.getByLabelText('PS No. versus ISONOTE table');
    const valid = 'PS No.,ISONOTE\nPS-1000.1,GUIDE';
    fireEvent.change(textarea, { target: { value: valid } });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'.repeat(1_048_577)], 'oversized.csv', { type: 'text/csv' });
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    Object.defineProperty(file, 'arrayBuffer', { value: arrayBuffer });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/1048576-byte UTF-8 limit/i)).toBeInTheDocument());
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(textarea).toHaveValue(valid);
    expect(screen.getByText(/1 unique mapping\(s\)/i)).toBeInTheDocument();
    expect(input.value).toBe('');
    expect(scanPsIsonoteReferences).not.toHaveBeenCalled();
  });
});
