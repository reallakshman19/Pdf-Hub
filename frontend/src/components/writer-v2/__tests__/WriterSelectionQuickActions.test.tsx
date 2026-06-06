import React from 'react';
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { WriterSelectionQuickActions } from '../WriterSelectionQuickActions';

describe('WriterSelectionQuickActions', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().clearDocument();
  });

  it('renders nothing without a selected Writer element', () => {
    render(<WriterSelectionQuickActions />);

    expect(screen.queryByTestId('writer-selection-quick-actions')).toBeNull();
  });

  it('duplicates selected Writer elements', () => {
    hydrateSelection([
      makeElement('box-1', { x: 10, y: 20, width: 100, height: 40 }),
    ], ['box-1']);

    render(<WriterSelectionQuickActions />);

    fireEvent.click(screen.getByRole('button', { name: /duplicate selected writer elements/i }));

    const state = useWriterV2Store.getState();

    expect(state.elements).toHaveLength(2);
    expect(state.selectedIds).toHaveLength(1);
    expect(state.elements[1].rect.x).toBe(26);
    expect(state.elements[1].rect.y).toBe(4);
  });

  it('removes selected Writer elements', () => {
    hydrateSelection([
      makeElement('box-1', { x: 10, y: 20, width: 100, height: 40 }),
      makeElement('box-2', { x: 160, y: 20, width: 100, height: 40 }),
    ], ['box-1']);

    render(<WriterSelectionQuickActions />);

    fireEvent.click(screen.getByRole('button', { name: /remove selected writer elements/i }));

    expect(useWriterV2Store.getState().elements.map((element) => element.id)).toEqual(['box-2']);
    expect(useWriterV2Store.getState().selectedIds).toEqual([]);
  });

  it('aligns selected Writer elements to the left edge', () => {
    hydrateSelection([
      makeElement('box-1', { x: 40, y: 20, width: 100, height: 40 }),
      makeElement('box-2', { x: 160, y: 40, width: 80, height: 40 }),
    ], ['box-1', 'box-2']);

    render(<WriterSelectionQuickActions />);

    fireEvent.click(screen.getByRole('button', { name: /^align left$/i }));

    expect(useWriterV2Store.getState().elements.map((element) => element.rect.x)).toEqual([40, 40]);
  });

  it('distributes three selected Writer elements horizontally', () => {
    hydrateSelection([
      makeElement('box-1', { x: 0, y: 20, width: 50, height: 40 }),
      makeElement('box-2', { x: 70, y: 20, width: 50, height: 40 }),
      makeElement('box-3', { x: 200, y: 20, width: 50, height: 40 }),
    ], ['box-1', 'box-2', 'box-3']);

    render(<WriterSelectionQuickActions />);

    fireEvent.click(screen.getByRole('button', { name: /distribute horizontally/i }));

    expect(useWriterV2Store.getState().elements.map((element) => element.rect.x)).toEqual([0, 100, 200]);
  });

  it('hides align and distribution actions when editable selection is too small', () => {
    hydrateSelection([
      makeElement('box-1', { x: 10, y: 20, width: 100, height: 40 }),
    ], ['box-1']);

    render(<WriterSelectionQuickActions />);

    expect(screen.getByTestId('writer-selection-count')).toHaveTextContent('1 selected');
    expect(screen.queryByRole('button', { name: /^align left$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /distribute horizontally/i })).toBeNull();
  });
});

function hydrateSelection(elements: WriterElementV2[], selectedIds: string[]): void {
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: 'selection-actions-doc',
    elements,
    documentMeta: {
      documentFingerprint: 'selection-actions-doc',
      mode: 'blankDocument',
      title: 'Selection Actions',
      pageSetup: {
        preset: 'A4',
        width: 595.28,
        height: 841.89,
        marginTop: 72,
        marginRight: 72,
        marginBottom: 72,
        marginLeft: 72,
        backgroundColor: '#ffffff',
      },
      pageCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  });
  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SELECT_WRITER_ELEMENTS',
    ids: selectedIds,
    activeId: selectedIds.at(-1) ?? null,
  });
}

function makeElement(
  id: string,
  rect: WriterElementV2['rect'],
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'selection-actions-doc',
    pageIndex: 0,
    type: 'richTextBox',
    rect,
    plainText: id,
    style: {
      zIndex: Number(id.replace(/\D+/g, '')) || 1,
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
