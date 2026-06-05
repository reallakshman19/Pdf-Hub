import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterObjectSearchPanel } from './WriterObjectSearchPanel';

function element(
  id: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 100, height: 40 },
    plainText: 'Writer object',
    editorStateJson: '{"root":{"children":[]}}',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
    ...patch,
  };
}

describe('WriterObjectSearchPanel', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: new Uint8Array([37, 80, 68, 70]),
      pageCount: 3,
    });
  });

  it('does not render when no Writer objects exist', () => {
    render(<WriterObjectSearchPanel />);

    expect(screen.queryByLabelText('Writer V2 object search')).toBeNull();
  });

  it('renders and filters by search text', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('a', { plainText: 'Check support load' }),
        element('b', { plainText: 'Approved stamp' }),
      ],
    });

    render(<WriterObjectSearchPanel />);

    expect(screen.getByText(/Check support load/i)).toBeTruthy();
    expect(screen.getByText(/Approved stamp/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search Writer objects'), {
      target: { value: 'support' },
    });

    expect(screen.getByText(/Check support load/i)).toBeTruthy();
    expect(screen.queryByText(/Approved stamp/i)).toBeNull();
  });

  it('jumps to object page and selects object', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('p2-object', {
          pageIndex: 1,
          plainText: 'Second page note',
        }),
      ],
    });

    render(<WriterObjectSearchPanel />);

    fireEvent.click(screen.getByLabelText(/jump to text box - second page note/i));

    expect(useSessionStore.getState().viewState.currentPage).toBe(2);
    expect(useWriterV2Store.getState().activeId).toBe('p2-object');
    expect(useWriterV2Store.getState().selectedIds).toEqual(['p2-object']);
  });

  it('filters by review status', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('open-review', {
          plainText: 'Open review item',
          review: {
            status: 'open',
            priority: 'high',
            category: 'engineering',
            commentId: 'comment-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
        element('resolved-review', {
          plainText: 'Resolved review item',
          review: {
            status: 'resolved',
            priority: 'low',
            category: 'general',
            commentId: 'comment-2',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ],
    });

    render(<WriterObjectSearchPanel />);

    fireEvent.change(screen.getByLabelText('Filter Writer review status'), {
      target: { value: 'open' },
    });

    expect(screen.getByText(/Open review item/i)).toBeTruthy();
    expect(screen.queryByText(/Resolved review item/i)).toBeNull();
  });
});
