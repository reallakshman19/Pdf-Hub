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
import { useEditorStore } from '@/core/editor/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WRITER_PAGE_PRESETS } from '@/core/writer-v2/types';
import { WriterBlankDocumentCanvas } from '../WriterBlankDocumentCanvas';
import { WriterBlankPageCanvas } from '../WriterBlankPageCanvas';

describe('WriterBlankPageCanvas', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useEditorStore.setState({ activeMode: 'annotate' });
  });

  it('renders nothing without active blank document metadata', () => {
    const { container } = render(
      <WriterBlankPageCanvas pageIndex={0} />,
    );

    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('writer-blank-page-canvas')).toBeNull();
  });

  it('renders blank page and margin guide', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-canvas-doc',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });

    render(
      <WriterBlankPageCanvas pageIndex={0} />,
    );

    const canvas = screen.getByTestId('writer-blank-page-canvas');
    const guide = screen.getByTestId('writer-blank-page-margin-guide');

    expect(canvas).toBeTruthy();
    expect(canvas.getAttribute('data-page-index')).toBe('0');
    expect(guide).toBeTruthy();
  });

  it('can hide margin guide', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-canvas-doc',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });

    render(
      <WriterBlankPageCanvas
        pageIndex={0}
        showMarginGuides={false}
      />,
    );

    expect(screen.getByTestId('writer-blank-page-canvas')).toBeTruthy();
    expect(screen.queryByTestId('writer-blank-page-margin-guide')).toBeNull();
  });

  it('places a richTextBox on pointer down when Writer placement tool is active', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-place-doc',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });
    useWriterV2Store.getState().setActiveWriterTool('richTextBox');
    useEditorStore.setState({ activeMode: 'write' });

    render(
      <WriterBlankPageCanvas pageIndex={0} />,
    );

    fireEvent.pointerDown(screen.getByTestId('writer-blank-page-canvas'), {
      clientX: 120,
      clientY: 160,
      pointerId: 1,
    });

    const state = useWriterV2Store.getState();

    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].type).toBe('richTextBox');
    expect(state.elements[0].documentFingerprint).toBe('blank-place-doc');
    expect(state.elements[0].pageIndex).toBe(0);
    expect(state.selectedIds).toEqual([state.elements[0].id]);
    expect(state.activeWriterTool).toBe('select');
  });

  it('clears selection on blank page pointer down when not placing', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-clear-doc',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 1,
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: makeElement('existing', 0),
    });

    render(
      <WriterBlankPageCanvas pageIndex={0} />,
    );

    expect(useWriterV2Store.getState().selectedIds).toEqual(['existing']);

    fireEvent.pointerDown(screen.getByTestId('writer-blank-page-canvas'), {
      clientX: 120,
      clientY: 160,
      pointerId: 1,
    });

    expect(useWriterV2Store.getState().selectedIds).toEqual([]);
  });
});

describe('WriterBlankDocumentCanvas', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('renders empty state when no blank document is active', () => {
    render(
      <WriterBlankDocumentCanvas />,
    );

    expect(screen.getByTestId('writer-blank-document-empty')).toBeTruthy();
    expect(screen.getByText('No blank Writer document is active.')).toBeTruthy();
  });

  it('renders page stack for active blank document', () => {
    useWriterV2Store.getState().createBlankWriterDocument({
      documentFingerprint: 'blank-stack-doc',
      pageSetup: WRITER_PAGE_PRESETS.A4,
      pageCount: 3,
    });

    render(
      <WriterBlankDocumentCanvas />,
    );

    expect(screen.getByTestId('writer-blank-document-canvas')).toBeTruthy();
    expect(screen.getAllByTestId('writer-blank-document-page-frame')).toHaveLength(3);
    expect(screen.getAllByTestId('writer-blank-page-canvas')).toHaveLength(3);
    expect(screen.getByText('Page 1')).toBeTruthy();
    expect(screen.getByText('Page 2')).toBeTruthy();
    expect(screen.getByText('Page 3')).toBeTruthy();
  });
});

function makeElement(id: string, pageIndex: number) {
  return {
    id,
    documentFingerprint: 'doc-test',
    pageIndex,
    type: 'richTextBox' as const,
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    },
    plainText: id,
    style: {
      zIndex: 1,
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
