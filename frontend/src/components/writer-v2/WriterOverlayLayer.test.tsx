import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WriterElementV2, WriterPageViewport } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterOverlayLayer } from './WriterOverlayLayer';

const viewport: WriterPageViewport = {
  pdfWidth: 612,
  pdfHeight: 792,
  scale: 1,
  rotation: 0,
};

function element(id: string, patch: Partial<WriterElementV2> = {}): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 100,
      y: 600,
      width: 150,
      height: 80,
    },
    plainText: 'Hello writer',
    editorStateJson: '{"root":{"children":[]}}',
    style: {
      zIndex: 4,
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

describe('WriterOverlayLayer', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('renders visible writer elements for a page', () => {
    useWriterV2Store.getState().hydrateWriterElements([
      element('writer-1'),
      element('writer-hidden', {
        hidden: true,
      }),
      element('writer-page-2', {
        pageIndex: 1,
      }),
    ]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    expect(screen.getByLabelText('Writer element writer-1')).toBeTruthy();
    expect(screen.queryByLabelText('Writer element writer-hidden')).toBeNull();
    expect(screen.queryByLabelText('Writer element writer-page-2')).toBeNull();
  });

  it('selects a writer element on pointer down', () => {
    useWriterV2Store.getState().hydrateWriterElements([
      element('writer-1'),
    ]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    fireEvent.pointerDown(screen.getByLabelText('Writer element writer-1'), {
      clientX: 120,
      clientY: 120,
      pointerId: 1,
    });

    expect(useWriterV2Store.getState().selectedIds).toEqual(['writer-1']);
    expect(useWriterV2Store.getState().activeId).toBe('writer-1');
  });

  it('clears selection when empty overlay surface is clicked', () => {
    useWriterV2Store.getState().hydrateWriterElements([
      element('writer-1'),
    ]);

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    fireEvent.pointerDown(screen.getByLabelText('Writer overlay v2 page 1'), {
      pointerId: 2,
    });

    expect(useWriterV2Store.getState().selectedIds).toEqual([]);
    expect(useWriterV2Store.getState().activeId).toBeNull();
  });

  it('moves writer element using pointer drag and records undo', () => {
    useWriterV2Store.getState().hydrateWriterElements([
      element('writer-1'),
    ]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    const box = screen.getByLabelText('Writer element writer-1');

    fireEvent.pointerDown(box, {
      clientX: 100,
      clientY: 100,
      pointerId: 3,
    });

    fireEvent.pointerMove(box, {
      clientX: 130,
      clientY: 120,
      pointerId: 3,
    });

    fireEvent.pointerUp(box, {
      clientX: 130,
      clientY: 120,
      pointerId: 3,
    });

    const moved = useWriterV2Store.getState().elements[0];

    expect(moved.rect.x).toBe(130);
    expect(moved.rect.y).toBe(580);
    expect(useWriterV2Store.getState().undoStack).toHaveLength(1);
  });

  it('does not render selection handles when element is not selected', () => {
    useWriterV2Store.getState().hydrateWriterElements([
      element('writer-1'),
    ]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    expect(document.querySelector('[data-writer-v2-selection-box="true"]')).toBeNull();
  });

  it('renders selection handle when element is selected', () => {
    useWriterV2Store.getState().hydrateWriterElements([
      element('writer-1'),
    ]);

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    expect(document.querySelector('[data-writer-v2-selection-box="true"]')).toBeTruthy();
    expect(document.querySelector('[data-writer-v2-resize-handle="se"]')).toBeTruthy();
  });
});
