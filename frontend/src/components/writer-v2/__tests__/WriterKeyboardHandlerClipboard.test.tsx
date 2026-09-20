import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  render,
  waitFor,
} from '@testing-library/react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { clearWriterElementClipboard } from '@/core/writer-v2/writerClipboardActions';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { WriterKeyboardHandler } from '../WriterKeyboardHandler';

describe('WriterKeyboardHandler clipboard shortcuts', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    clearWriterElementClipboard();
  });

  it('copies and pastes selected Writer elements with Ctrl+C and Ctrl+V', async () => {
    hydrateSelection([
      makeElement('box-1'),
    ], ['box-1']);

    render(<WriterKeyboardHandler />);

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'v',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));

    await waitFor(() => {
      const state =
        useWriterV2Store.getState();

      expect(state.elements).toHaveLength(2);
      expect(state.elements[1].id).not.toBe('box-1');
      expect(state.elements[1].rect.x).toBe(26);
      expect(state.elements[1].rect.y).toBe(34);
      expect(state.selectedIds).toEqual([
        state.elements[1].id,
      ]);
    });
  });

  it('does not intercept copy inside editable targets', () => {
    hydrateSelection([
      makeElement('box-1'),
    ], ['box-1']);

    render(
      <>
        <input aria-label="editing field" />
        <WriterKeyboardHandler />
      </>,
    );

    const input = document.querySelector('input');

    input?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'v',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(useWriterV2Store.getState().elements).toHaveLength(1);
  });
});

function hydrateSelection(elements: WriterElementV2[], selectedIds: string[]): void {
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: 'keyboard-clipboard-doc',
    elements,
  });
  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SET_WRITER_SELECTION',
    ids: selectedIds,
  });
  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SET_ACTIVE_WRITER_ELEMENT',
    id: selectedIds.at(-1) ?? null,
  });
}

function makeElement(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'keyboard-clipboard-doc',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 50,
      width: 100,
      height: 40,
    },
    plainText: id,
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
      fontSize: 12,
      fontFamily: 'Aptos',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
