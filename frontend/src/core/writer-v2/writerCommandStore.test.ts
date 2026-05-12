import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import {
  createInitialWriterV2State,
  executeWriterCommand,
  getVisibleWriterElements,
  redoWriterCommand,
  undoWriterCommand,
  WRITER_V2_MAX_UNDO_DEPTH,
} from './writerCommandStore';

const PAGE_BOUNDS = {
  x: 0,
  y: 0,
  width: 612,
  height: 792,
};

function element(
  id: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 100,
      y: 200,
      width: 160,
      height: 80,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Example',
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

describe('writer-v2 command store', () => {
  it('adds a writer element and selects it', () => {
    const initial = createInitialWriterV2State();
    const result = executeWriterCommand(initial, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    });

    expect(result.changed).toBe(true);
    expect(result.state.elements).toHaveLength(1);
    expect(result.state.activeId).toBe('writer-1');
    expect(result.state.selectedIds).toEqual(['writer-1']);
    expect(result.state.undoStack).toHaveLength(1);
    expect(result.state.redoStack).toHaveLength(0);
    expect(result.state.dirty).toBe(true);
  });

  it('does not add duplicate IDs', () => {
    let state = createInitialWriterV2State();

    state = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    }).state;

    const result = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    });

    expect(result.changed).toBe(false);
    expect(result.state.elements).toHaveLength(1);
    expect(result.state.undoStack).toHaveLength(1);
  });

  it('updates editable writer element content without changing protected identity fields', () => {
    let state = createInitialWriterV2State();

    state = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    }).state;

    state = executeWriterCommand(state, {
      type: 'UPDATE_WRITER_ELEMENT',
      id: 'writer-1',
      now: '2026-01-02T00:00:00.000Z',
      patch: {
        id: 'should-not-win',
        documentFingerprint: 'other-doc',
        plainText: 'Changed',
        style: {
          zIndex: 5,
          backgroundColor: '#fef3c7',
        },
      } as never,
    }).state;

    expect(state.elements[0].id).toBe('writer-1');
    expect(state.elements[0].documentFingerprint).toBe('doc-1');
    expect(state.elements[0].plainText).toBe('Changed');
    expect(state.elements[0].style.zIndex).toBe(5);
    expect(state.elements[0].style.backgroundColor).toBe('#fef3c7');
    expect(state.elements[0].updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('moves writer elements in PDF coordinates and clamps to page bounds', () => {
    let state = createInitialWriterV2State();

    state = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    }).state;

    state = executeWriterCommand(state, {
      type: 'MOVE_WRITER_ELEMENT',
      id: 'writer-1',
      dx: -500,
      dy: 900,
      pageBounds: PAGE_BOUNDS,
    }).state;

    expect(state.elements[0].rect).toEqual({
      x: 0,
      y: 712,
      width: 160,
      height: 80,
    });
  });

  it('resizes writer elements and clamps rect to page bounds', () => {
    let state = createInitialWriterV2State();

    state = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    }).state;

    state = executeWriterCommand(state, {
      type: 'RESIZE_WRITER_ELEMENT',
      id: 'writer-1',
      rect: {
        x: 500,
        y: 700,
        width: 200,
        height: 200,
      },
      pageBounds: PAGE_BOUNDS,
    }).state;

    expect(state.elements[0].rect).toEqual({
      x: 412,
      y: 592,
      width: 200,
      height: 200,
    });
  });

  it('prevents locked writer elements from being moved, resized, or content-updated', () => {
    const state = createInitialWriterV2State({
      elements: [
        element('writer-1', {
          locked: true,
        }),
      ],
    });

    const moved = executeWriterCommand(state, {
      type: 'MOVE_WRITER_ELEMENT',
      id: 'writer-1',
      dx: 50,
      dy: 50,
      pageBounds: PAGE_BOUNDS,
    });

    expect(moved.changed).toBe(false);
    expect(moved.state.elements[0].rect.x).toBe(100);

    const resized = executeWriterCommand(state, {
      type: 'RESIZE_WRITER_ELEMENT',
      id: 'writer-1',
      rect: {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      },
      pageBounds: PAGE_BOUNDS,
    });

    expect(resized.changed).toBe(false);

    const updated = executeWriterCommand(state, {
      type: 'UPDATE_WRITER_ELEMENT',
      id: 'writer-1',
      patch: {
        plainText: 'Should not change',
      },
    });

    expect(updated.changed).toBe(false);
    expect(state.elements[0].plainText).toBe('Example');
  });

  it('allows lock/unlock command even when the target is currently locked', () => {
    let state = createInitialWriterV2State({
      elements: [
        element('writer-1', {
          locked: true,
        }),
      ],
    });

    state = executeWriterCommand(state, {
      type: 'LOCK_WRITER_ELEMENT',
      id: 'writer-1',
      locked: false,
    }).state;

    expect(state.elements[0].locked).toBe(false);
  });

  it('hides writer elements and removes them from visible selector and active selection', () => {
    let state = createInitialWriterV2State({
      elements: [
        element('writer-1'),
        element('writer-2', {
          pageIndex: 0,
          style: {
            zIndex: 2,
          },
        } as Partial<WriterElementV2>),
      ],
      selectedIds: ['writer-1'],
      activeId: 'writer-1',
    });

    state = executeWriterCommand(state, {
      type: 'HIDE_WRITER_ELEMENT',
      id: 'writer-1',
      hidden: true,
    }).state;

    expect(state.elements.find((item) => item.id === 'writer-1')?.hidden).toBe(true);
    expect(state.selectedIds).toEqual([]);
    expect(state.activeId).toBeNull();
    expect(getVisibleWriterElements(state, 0).map((item) => item.id)).toEqual(['writer-2']);
  });

  it('sorts visible writer elements by z-index', () => {
    const state = createInitialWriterV2State({
      elements: [
        element('writer-3', {
          style: {
            zIndex: 3,
          },
        } as Partial<WriterElementV2>),
        element('writer-1', {
          style: {
            zIndex: 1,
          },
        } as Partial<WriterElementV2>),
        element('writer-2', {
          style: {
            zIndex: 2,
          },
        } as Partial<WriterElementV2>),
      ],
    });

    expect(getVisibleWriterElements(state).map((item) => item.id)).toEqual([
      'writer-1',
      'writer-2',
      'writer-3',
    ]);
  });

  it('supports z-index commands', () => {
    let state = createInitialWriterV2State({
      elements: [
        element('writer-1', {
          style: {
            zIndex: 1,
          },
        } as Partial<WriterElementV2>),
        element('writer-2', {
          style: {
            zIndex: 4,
          },
        } as Partial<WriterElementV2>),
      ],
    });

    state = executeWriterCommand(state, {
      type: 'BRING_WRITER_TO_FRONT',
      id: 'writer-1',
    }).state;

    expect(state.elements.find((item) => item.id === 'writer-1')?.style.zIndex).toBe(5);

    state = executeWriterCommand(state, {
      type: 'SEND_WRITER_TO_BACK',
      id: 'writer-1',
    }).state;

    expect(state.elements.find((item) => item.id === 'writer-1')?.style.zIndex).toBe(0);
    expect(state.elements.find((item) => item.id === 'writer-2')?.style.zIndex).toBe(5);
  });

  it('sets active element and selection without creating undo entries', () => {
    let state = createInitialWriterV2State({
      elements: [element('writer-1'), element('writer-2')],
    });

    state = executeWriterCommand(state, {
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-2',
    }).state;

    expect(state.activeId).toBe('writer-2');
    expect(state.selectedIds).toEqual(['writer-2']);
    expect(state.undoStack).toHaveLength(0);

    state = executeWriterCommand(state, {
      type: 'CLEAR_WRITER_SELECTION',
    }).state;

    expect(state.activeId).toBeNull();
    expect(state.selectedIds).toEqual([]);
    expect(state.undoStack).toHaveLength(0);
  });

  it('supports undo and redo for mutations', () => {
    let state = createInitialWriterV2State();

    state = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    }).state;

    state = executeWriterCommand(state, {
      type: 'MOVE_WRITER_ELEMENT',
      id: 'writer-1',
      dx: 50,
      dy: 25,
    }).state;

    expect(state.elements[0].rect.x).toBe(150);

    const undone = undoWriterCommand(state);
    expect(undone.changed).toBe(true);
    expect(undone.state.elements[0].rect.x).toBe(100);
    expect(undone.state.redoStack).toHaveLength(1);

    const redone = redoWriterCommand(undone.state);
    expect(redone.changed).toBe(true);
    expect(redone.state.elements[0].rect.x).toBe(150);
  });

  it('caps undo history at 50 operations', () => {
    let state = createInitialWriterV2State();

    state = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    }).state;

    for (let i = 0; i < 60; i += 1) {
      state = executeWriterCommand(state, {
        type: 'MOVE_WRITER_ELEMENT',
        id: 'writer-1',
        dx: 1,
        dy: 0,
      }).state;
    }

    expect(state.undoStack).toHaveLength(WRITER_V2_MAX_UNDO_DEPTH);
  });

  it('passes a 50-operation undo/redo stress test', () => {
    let state = createInitialWriterV2State();

    state = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: element('writer-1'),
    }).state;

    for (let i = 0; i < 49; i += 1) {
      state = executeWriterCommand(state, {
        type: 'MOVE_WRITER_ELEMENT',
        id: 'writer-1',
        dx: 2,
        dy: 1,
      }).state;
    }

    expect(state.elements[0].rect).toEqual({
      x: 198,
      y: 249,
      width: 160,
      height: 80,
    });

    for (let i = 0; i < 50; i += 1) {
      state = undoWriterCommand(state).state;
    }

    expect(state.elements).toHaveLength(0);

    for (let i = 0; i < 50; i += 1) {
      state = redoWriterCommand(state).state;
    }

    expect(state.elements[0].rect).toEqual({
      x: 198,
      y: 249,
      width: 160,
      height: 80,
    });
  });

  it('clones state snapshots so callers cannot mutate history by reference', () => {
    let state = createInitialWriterV2State();

    const source = element('writer-1');

    state = executeWriterCommand(state, {
      type: 'ADD_WRITER_ELEMENT',
      element: source,
    }).state;

    source.rect.x = 9999;
    state.elements[0].rect.x = 8888;

    const undone = undoWriterCommand(state);

    expect(undone.state.elements).toEqual([]);
  });
});
