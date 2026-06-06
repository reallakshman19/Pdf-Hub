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
import type { WriterDocumentMetaV2, WriterElementV2 } from '@/core/writer-v2/types';
import { WriterGeometryQuickPanel } from '../WriterGeometryQuickPanel';

describe('WriterGeometryQuickPanel', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().clearDocument();
  });

  it('renders nothing when selection is empty', () => {
    render(<WriterGeometryQuickPanel />);

    expect(screen.queryByTestId('writer-geometry-quick-panel')).toBeNull();
  });

  it('renders selected element geometry values', () => {
    hydrateSelection([makeElement()], ['box-1']);

    render(<WriterGeometryQuickPanel />);

    expect(screen.getByLabelText('Writer geometry X')).toHaveValue('10');
    expect(screen.getByLabelText('Writer geometry Y')).toHaveValue('50');
    expect(screen.getByLabelText('Writer geometry W')).toHaveValue('100');
    expect(screen.getByLabelText('Writer geometry H')).toHaveValue('40');
  });

  it('applies numeric geometry changes', () => {
    hydrateSelection([makeElement()], ['box-1']);

    render(<WriterGeometryQuickPanel />);

    fireEvent.change(screen.getByLabelText('Writer geometry X'), {
      target: { value: '72' },
    });
    fireEvent.change(screen.getByLabelText('Writer geometry Y'), {
      target: { value: '120' },
    });
    fireEvent.change(screen.getByLabelText('Writer geometry W'), {
      target: { value: '220' },
    });
    fireEvent.change(screen.getByLabelText('Writer geometry H'), {
      target: { value: '96' },
    });
    fireEvent.click(screen.getByRole('button', { name: /apply writer geometry/i }));

    expect(useWriterV2Store.getState().elements[0].rect).toEqual({
      x: 72,
      y: 120,
      width: 220,
      height: 96,
    });
  });

  it('does not render for multi-selection', () => {
    hydrateSelection([makeElement(), makeElement('box-2')], ['box-1', 'box-2']);

    render(<WriterGeometryQuickPanel />);

    expect(screen.queryByTestId('writer-geometry-quick-panel')).toBeNull();
  });
});

function hydrateSelection(elements: WriterElementV2[], selectedIds: string[]): void {
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: 'geometry-panel-doc',
    elements,
    documentMeta: makeBlankMeta(),
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

function makeBlankMeta(): WriterDocumentMetaV2 {
  return {
    documentFingerprint: 'geometry-panel-doc',
    mode: 'blankDocument',
    title: 'Geometry Panel Document',
    pageSetup: {
      preset: 'Custom',
      width: 600,
      height: 800,
      marginTop: 72,
      marginRight: 72,
      marginBottom: 72,
      marginLeft: 72,
      backgroundColor: '#ffffff',
    },
    pageCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeElement(id = 'box-1'): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'geometry-panel-doc',
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
