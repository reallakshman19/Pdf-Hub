import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
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
    rect: { x: 100, y: 600, width: 150, height: 80 },
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

/**
 * Reproduces a real browser double-click: pointerdown/up + click happen twice
 * (driving beginDrag/endDrag) before the dblclick fires. The pre-existing
 * "fireEvent.doubleClick" test only dispatches the bare dblclick and never
 * exercises the drag handlers, so it could not catch interference between them.
 */
function realDoubleClick(node: Element) {
  for (let i = 0; i < 2; i += 1) {
    fireEvent.pointerDown(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });
    fireEvent.pointerUp(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });
    fireEvent.click(node, { clientX: 150, clientY: 120, button: 0 });
  }
  fireEvent.doubleClick(node, { clientX: 150, clientY: 120, button: 0 });
}

/**
 * Two quick pointerdown/up cycles with NO native `dblclick`. This mirrors the
 * real-browser case where the browser suppresses `dblclick` on a drag-handling
 * element; the editor must still open via manual double-click detection.
 */
function pointerOnlyDoubleClick(node: Element) {
  for (let i = 0; i < 2; i += 1) {
    fireEvent.pointerDown(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });
    fireEvent.pointerUp(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });
  }
}

describe('Writer V2 double-click to edit (realistic sequence)', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('opens the inline editor after a full pointer/click/dblclick sequence', () => {
    useWriterV2Store.getState().hydrateWriterElements([element('writer-1')]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    realDoubleClick(screen.getByLabelText('Writer element writer-1'));

    expect(useWriterV2Store.getState().editingId).toBe('writer-1');
    expect(
      screen.getByRole('textbox', { name: /writer rich text inline editor/i }),
    ).toBeTruthy();
  });

  it('keeps the inline editor open under React StrictMode', () => {
    useWriterV2Store.getState().hydrateWriterElements([element('writer-1')]);

    render(
      <StrictMode>
        <WriterOverlayLayer pageNumber={1} viewport={viewport} />
      </StrictMode>,
    );

    realDoubleClick(screen.getByLabelText('Writer element writer-1'));

    expect(useWriterV2Store.getState().editingId).toBe('writer-1');
    expect(
      screen.getByRole('textbox', { name: /writer rich text inline editor/i }),
    ).toBeTruthy();
  });

  it('opens the inline editor from pointer events alone when native dblclick is suppressed', () => {
    useWriterV2Store.getState().hydrateWriterElements([element('writer-1')]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    pointerOnlyDoubleClick(screen.getByLabelText('Writer element writer-1'));

    expect(useWriterV2Store.getState().editingId).toBe('writer-1');
  });

  it('opens the inline editor on the second pointerdown before drag handling starts', () => {
    useWriterV2Store.getState().hydrateWriterElements([element('writer-1')]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    const node = screen.getByLabelText('Writer element writer-1');
    fireEvent.pointerDown(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });
    fireEvent.pointerUp(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });
    fireEvent.pointerDown(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });

    expect(useWriterV2Store.getState().editingId).toBe('writer-1');
  });

  it('opens the inline editor from the browser second mousedown click count', () => {
    useWriterV2Store.getState().hydrateWriterElements([element('writer-1')]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    fireEvent.mouseDown(screen.getByLabelText('Writer element writer-1'), {
      clientX: 150,
      clientY: 120,
      detail: 2,
      button: 0,
    });

    expect(useWriterV2Store.getState().editingId).toBe('writer-1');
  });

  it('does not open the editor on a single click', () => {
    useWriterV2Store.getState().hydrateWriterElements([element('writer-1')]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    const node = screen.getByLabelText('Writer element writer-1');
    fireEvent.pointerDown(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });
    fireEvent.pointerUp(node, { clientX: 150, clientY: 120, pointerId: 1, button: 0 });

    expect(useWriterV2Store.getState().editingId).toBeNull();
  });

  it('does not record a move/undo entry from the click portion of a double-click', () => {
    useWriterV2Store.getState().hydrateWriterElements([element('writer-1')]);

    render(<WriterOverlayLayer pageNumber={1} viewport={viewport} />);

    realDoubleClick(screen.getByLabelText('Writer element writer-1'));

    expect(useWriterV2Store.getState().undoStack).toHaveLength(0);
  });
});
