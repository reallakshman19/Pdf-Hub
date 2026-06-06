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
  WriterElementV2,
  WriterPageViewport,
} from '@/core/writer-v2/types';
import { WriterElementBox } from '../WriterElementBox';

const viewport: WriterPageViewport = {
  pdfWidth: 200,
  pdfHeight: 200,
  rotation: 0,
  scale: 1,
};

describe('WriterElementBox resize behavior', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('renders resize handles only when selected and not editing', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'resize-doc',
      elements: [makeElement()],
    });

    const { rerender } = render(
      <WriterElementBox
        element={makeElement()}
        viewport={viewport}
        selected={false}
      />,
    );

    expect(screen.queryByTestId('writer-v2-resize-handle-se')).toBeNull();

    rerender(
      <WriterElementBox
        element={makeElement()}
        viewport={viewport}
        selected
      />,
    );

    expect(screen.getByTestId('writer-v2-resize-handle-se')).toBeTruthy();
  });

  it('resizes selected Writer element from the south-east handle', async () => {
    const element = makeElement();

    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'resize-doc',
      elements: [element],
    });

    render(
      <WriterElementBox
        element={element}
        viewport={viewport}
        selected
      />,
    );

    const box = screen.getByLabelText('Writer element resize-box-1');

    fireEvent.pointerDown(screen.getByTestId('writer-v2-resize-handle-se'), {
      pointerId: 1,
      clientX: 110,
      clientY: 180,
    });
    fireEvent.pointerMove(box, {
      pointerId: 1,
      clientX: 160,
      clientY: 200,
    });

    await waitFor(() => {
      expect(box).toHaveStyle({
        width: '150px',
        height: '60px',
      });
    });

    fireEvent.pointerUp(box, {
      pointerId: 1,
      clientX: 160,
      clientY: 200,
    });

    await waitFor(() => {
      const resized = useWriterV2Store.getState().elements[0];

      expect(resized.rect.width).toBe(150);
      expect(resized.rect.height).toBe(60);
      expect(resized.rect.x).toBe(10);
      expect(resized.rect.y).toBe(0);
    });
  });
});

function makeElement(): WriterElementV2 {
  return {
    id: 'resize-box-1',
    documentFingerprint: 'resize-doc',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    },
    plainText: 'Resize me',
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
