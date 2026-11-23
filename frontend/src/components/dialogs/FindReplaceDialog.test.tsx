import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FindReplaceDialog } from './FindReplaceDialog';
import { scanDocumentForFindReplaceMatches } from '@/core/existing-text/batchFindReplace';
import { commandBus } from '@/core/commands/bus';
import type { CommandResult } from '@/core/commands/types';

vi.mock('@/core/existing-text/batchFindReplace', () => ({
  scanDocumentForFindReplaceMatches: vi.fn(),
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

vi.mock('@/core/session/store', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      workingBytes: new Uint8Array([1, 2, 3]),
      documentKey: 'doc-rev-1',
      pageGraph: {
        pages: [{ pageId: 'page-1', currentIndex: 0 }],
      },
    }),
}));

describe('FindReplaceDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search query and replacement inputs with options', () => {
    render(<FindReplaceDialog isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByTestId('find-query-input')).toBeInTheDocument();
    expect(screen.getByTestId('replace-text-input')).toBeInTheDocument();
    expect(screen.getByTestId('find-case-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('find-whole-word-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('find-regex-toggle')).toBeInTheDocument();
  });

  it('scans document and renders matches list on Find All', async () => {
    vi.mocked(scanDocumentForFindReplaceMatches).mockResolvedValue({
      query: 'Alpha',
      replacement: 'Beta',
      totalMatches: 1,
      matchesByPage: {
        0: [
          {
            matchId: 'span-1-m0',
            pageIndex: 0,
            pageId: 'page-1',
            span: { id: 'span-1', pageIndex: 0, sourceIndex: 0 } as any,
            matchStartIndex: 0,
            matchEndIndex: 5,
            originalSpanText: 'Alpha Project',
            replacementSpanText: 'Beta Project',
            matchedSubstring: 'Alpha',
            capability: { status: 'native' } as any,
            selected: true,
          },
        ],
      },
      allMatches: [
        {
          matchId: 'span-1-m0',
          pageIndex: 0,
          pageId: 'page-1',
          span: { id: 'span-1', pageIndex: 0, sourceIndex: 0 } as any,
          matchStartIndex: 0,
          matchEndIndex: 5,
          originalSpanText: 'Alpha Project',
          replacementSpanText: 'Beta Project',
          matchedSubstring: 'Alpha',
          capability: { status: 'native' } as any,
          selected: true,
        },
      ],
    });

    render(<FindReplaceDialog isOpen={true} onClose={mockOnClose} />);

    const queryInput = screen.getByTestId('find-query-input');
    const replaceInput = screen.getByTestId('replace-text-input');
    const findAllBtn = screen.getByTestId('find-all-button');

    fireEvent.change(queryInput, { target: { value: 'Alpha' } });
    fireEvent.change(replaceInput, { target: { value: 'Beta' } });

    await act(async () => {
      fireEvent.click(findAllBtn);
    });

    await waitFor(() => {
      expect(scanDocumentForFindReplaceMatches).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('find-matches-list')).toBeInTheDocument();
      expect(screen.getByText('Page 1')).toBeInTheDocument();
      expect(screen.getByText('Native in-place')).toBeInTheDocument();
      expect(screen.getByText('→ Beta Project')).toBeInTheDocument();
    });
  });

  it('executes BATCH_REPLACE_EXISTING_TEXT command when Replace Selected is clicked', async () => {
    vi.mocked(scanDocumentForFindReplaceMatches).mockResolvedValue({
      query: 'Alpha',
      replacement: 'Beta',
      totalMatches: 1,
      matchesByPage: {
        0: [
          {
            matchId: 'span-1-m0',
            pageIndex: 0,
            pageId: 'page-1',
            span: { id: 'span-1', pageIndex: 0, sourceIndex: 0 } as any,
            matchStartIndex: 0,
            matchEndIndex: 5,
            originalSpanText: 'Alpha Project',
            replacementSpanText: 'Beta Project',
            matchedSubstring: 'Alpha',
            capability: { status: 'native' } as any,
            selected: true,
          },
        ],
      },
      allMatches: [
        {
          matchId: 'span-1-m0',
          pageIndex: 0,
          pageId: 'page-1',
          span: { id: 'span-1', pageIndex: 0, sourceIndex: 0 } as any,
          matchStartIndex: 0,
          matchEndIndex: 5,
          originalSpanText: 'Alpha Project',
          replacementSpanText: 'Beta Project',
          matchedSubstring: 'Alpha',
          capability: { status: 'native' } as any,
          selected: true,
        },
      ],
    });

    vi.mocked(commandBus.execute).mockResolvedValue({
      success: true,
      mutated: true,
      message: 'Batch replaced 1 occurrences across 1 pages.',
    } as unknown as CommandResult);

    render(<FindReplaceDialog isOpen={true} onClose={mockOnClose} />);

    fireEvent.change(screen.getByTestId('find-query-input'), { target: { value: 'Alpha' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('find-all-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('replace-all-button')).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('replace-all-button'));
    });

    await waitFor(() => {
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      const call = vi.mocked(commandBus.execute).mock.calls[0][0];
      expect(call.command.type).toBe('BATCH_REPLACE_EXISTING_TEXT');
      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Batch replacement complete',
        }),
      );
    });
  });
});
