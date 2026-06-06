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
  waitFor,
} from '@testing-library/react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type {
  WriterDocumentMetaV2,
  WriterElementV2,
  WriterPageViewport,
} from '@/core/writer-v2/types';
import { WriterElementBox } from '../WriterElementBox';

const viewport: WriterPageViewport = {
  width: 600,
  height: 800,
  pdfWidth: 600,
  pdfHeight: 800,
  rotation: 0,
  scale: 1,
};

describe('WriterElementBox drag snapping', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('snaps moved blank-document element to left page margin', async () => {
    const element = makeElement({
      x: 40,
      y: 50,
      width: 100,
      height: 40,
    });

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'snap-doc',
      elements: [element],
      documentMeta: makeBlankMeta(),
    });

    render(
      <WriterElementBox
        element={element}
        viewport={viewport}
        selected
      />,
    );

    const box = screen.getByLabelText('Writer element snap-box-1');

    fireEvent.pointerDown(box, {
      pointerId: 1,
      clientX: 40,
      clientY: 710,
    });
    fireEvent.pointerMove(box, {
      pointerId: 1,
      clientX: 70,
      clientY: 710,
    });

    await waitFor(() => {
      expect(box).toHaveStyle({
        left: '72px',
      });
    });

    fireEvent.pointerUp(box, {
      pointerId: 1,
      clientX: 70,
      clientY: 710,
    });

    await waitFor(() => {
      expect(useWriterV2Store.getState().elements[0].rect.x).toBe(72);
    });
  });
});

function makeBlankMeta(): WriterDocumentMetaV2 {
  return {
    documentFingerprint: 'snap-doc',
    mode: 'blankDocument',
    title: 'Snap Document',
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

function makeElement(rect: WriterElementV2['rect']): WriterElementV2 {
  return {
    id: 'snap-box-1',
    documentFingerprint: 'snap-doc',
    pageIndex: 0,
    type: 'richTextBox',
    rect,
    plainText: 'Snap me',
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
