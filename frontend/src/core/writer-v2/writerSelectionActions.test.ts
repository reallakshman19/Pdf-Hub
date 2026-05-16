import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import {
  bringSelectedWriterElementToFront,
  deleteSelectedWriterElements,
  duplicateSelectedWriterElements,
  hideSelectedWriterElements,
  sendSelectedWriterElementToBack,
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

describe('writer-v2 selection actions', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('duplicates selected writer element and selects the clone', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    const result = duplicateSelectedWriterElements();
    const state = useWriterV2Store.getState();

    expect(result.changed).toBe(true);
    expect(state.elements).toHaveLength(2);
    expect(state.selectedIds).toHaveLength(1);
    expect(state.selectedIds[0]).not.toBe('writer-1');
    expect(state.elements[1].rect.x).toBe(116);
    expect(state.elements[1].rect.y).toBe(484);
    expect(state.elements[1].locked).toBe(false);
    expect(state.elements[1].hidden).toBe(false);
  });

  it('deletes selected writer elements', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1'), element('writer-2')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_WRITER_SELECTION',
      ids: ['writer-1', 'writer-2'],
    });

    const result = deleteSelectedWriterElements();

    expect(result.changed).toBe(true);
    expect(useWriterV2Store.getState().elements).toEqual([]);
  });

  it('locks and unlocks selected writer element', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    toggleLockSelectedWriterElements();
    expect(useWriterV2Store.getState().elements[0].locked).toBe(true);

    toggleLockSelectedWriterElements();
    expect(useWriterV2Store.getState().elements[0].locked).toBe(false);
  });

  it('hides selected writer element', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    hideSelectedWriterElements();

    expect(useWriterV2Store.getState().elements[0].hidden).toBe(true);
    expect(useWriterV2Store.getState().selectedIds).toEqual([]);
  });

  it('changes selected writer z-order', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [
        element('writer-1', {
          style: {
            zIndex: 1,
          },
        } as Partial<WriterElementV2>),
        element('writer-2', {
          style: {
            zIndex: 5,
          },
        } as Partial<WriterElementV2>),
      ],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    bringSelectedWriterElementToFront();

    expect(
      useWriterV2Store.getState().elements.find((item) => item.id === 'writer-1')
        ?.style.zIndex,
    ).toBe(6);

    sendSelectedWriterElementToBack();

    expect(
      useWriterV2Store.getState().elements.find((item) => item.id === 'writer-1')
        ?.style.zIndex,
    ).toBe(0);
  });
});