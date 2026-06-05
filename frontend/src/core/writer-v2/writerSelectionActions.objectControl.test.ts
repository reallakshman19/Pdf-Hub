import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import {
  alignSelectedWriterElements,
  distributeSelectedWriterElements,
  hideSelectedWriterElements,
  nudgeSelectedWriterElements,
  showAllWriterElements,
  toggleLockSelectedWriterElements,
} from './writerSelectionActions';

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
      y: 500,
      width: 180,
      height: 80,
    },
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

describe('writer selection object controls', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('nudges selected tableBox and imageBox objects as one undoable batch', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('table-1', {
          type: 'tableBox',
          rect: { x: 10, y: 20, width: 100, height: 80 },
        }),
        element('image-1', {
          type: 'imageBox',
          rect: { x: 200, y: 300, width: 120, height: 90 },
        }),
      ],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: ['table-1', 'image-1'],
    });

    nudgeSelectedWriterElements(5, -3);

    const state = useWriterV2Store.getState();

    expect(state.elements.find((item) => item.id === 'table-1')?.rect).toMatchObject({
      x: 15,
      y: 17,
    });
    expect(state.elements.find((item) => item.id === 'image-1')?.rect).toMatchObject({
      x: 205,
      y: 297,
    });
    expect(state.undoStack).toHaveLength(1);

    state.undoWriter();

    expect(useWriterV2Store.getState().elements.find((item) => item.id === 'table-1')?.rect).toMatchObject({
      x: 10,
      y: 20,
    });
  });

  it('aligns selected objects left', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('a', { rect: { x: 90, y: 0, width: 10, height: 10 } }),
        element('b', { rect: { x: 40, y: 0, width: 20, height: 10 } }),
        element('c', { rect: { x: 120, y: 0, width: 30, height: 10 } }),
      ],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: ['a', 'b', 'c'],
    });

    alignSelectedWriterElements('left');

    expect(useWriterV2Store.getState().elements.map((item) => item.rect.x)).toEqual([
      40,
      40,
      40,
    ]);
  });

  it('distributes selected objects horizontally', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('a', { rect: { x: 0, y: 0, width: 10, height: 10 } }),
        element('b', { rect: { x: 20, y: 0, width: 10, height: 10 } }),
        element('c', { rect: { x: 100, y: 0, width: 10, height: 10 } }),
      ],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: ['a', 'b', 'c'],
    });

    distributeSelectedWriterElements('horizontal');

    expect(useWriterV2Store.getState().elements.map((item) => item.rect.x)).toEqual([
      0,
      50,
      100,
    ]);
  });

  it('does not move locked selected elements', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('a', { rect: { x: 10, y: 0, width: 10, height: 10 } }),
        element('b', {
          rect: { x: 90, y: 0, width: 10, height: 10 },
          locked: true,
        }),
      ],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: ['a', 'b'],
    });

    nudgeSelectedWriterElements(10, 0);

    expect(useWriterV2Store.getState().elements.find((item) => item.id === 'a')?.rect.x).toBe(20);
    expect(useWriterV2Store.getState().elements.find((item) => item.id === 'b')?.rect.x).toBe(90);
  });

  it('locks, hides, and restores selected objects through batch update', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('a'),
        element('b'),
      ],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: ['a', 'b'],
    });

    toggleLockSelectedWriterElements();

    expect(useWriterV2Store.getState().elements.every((item) => item.locked)).toBe(true);

    toggleLockSelectedWriterElements();

    expect(useWriterV2Store.getState().elements.every((item) => !item.locked)).toBe(true);

    hideSelectedWriterElements();

    expect(useWriterV2Store.getState().elements.every((item) => item.hidden)).toBe(true);

    showAllWriterElements();

    expect(useWriterV2Store.getState().elements.every((item) => !item.hidden)).toBe(true);
  });
});
