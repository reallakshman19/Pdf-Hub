import {
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
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';
import { OcrWriterInsertPanel } from '../OcrWriterInsertPanel';

describe('OcrWriterInsertPanel', () => {
  it('renders empty state', () => {
    render(
      <OcrWriterInsertPanel
        queue={createOcrWriterInsertionQueue()}
        onQueueChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-writer-insert-empty')).toBeTruthy();
  });

  it('renders queued candidates', () => {
    const queue = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeTextElement(),
      }),
    ]);

    render(
      <OcrWriterInsertPanel
        queue={queue}
        onQueueChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-writer-insert-panel')).toBeTruthy();
    expect(screen.getByTestId('ocr-writer-insert-count').textContent).toBe('1/1');
    expect(screen.getAllByTestId('ocr-writer-candidate-row')).toHaveLength(1);
    expect(screen.getByText('richTextBox')).toBeTruthy();
  });

  it('deletes queued candidate', () => {
    let queueState = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeTextElement(),
      }),
    ]);

    const { rerender } = render(
      <OcrWriterInsertPanel
        queue={queueState}
        onQueueChange={(next) => {
          queueState = next;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-writer-candidate-delete'));

    rerender(
      <OcrWriterInsertPanel
        queue={queueState}
        onQueueChange={(next) => {
          queueState = next;
        }}
      />,
    );

    expect(queueState.candidates).toHaveLength(0);
    expect(screen.getByTestId('ocr-writer-insert-empty')).toBeTruthy();
  });

  it('inserts accepted Writer elements and clears queue', async () => {
    let queueState: OcrWriterInsertionQueueState = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeTextElement(),
      }),
    ]);

    let inserted: WriterElementV2[] = [];

    render(
      <OcrWriterInsertPanel
        queue={queueState}
        onQueueChange={(next) => {
          queueState = next;
        }}
        onInsertElements={(elements) => {
          inserted = elements;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-writer-insert-button'));

    await waitFor(() => {
      expect(inserted).toHaveLength(1);
      expect(inserted[0].id).toBe(
        'ocr-text-1',
      );
      expect(
        queueState.candidates,
      ).toHaveLength(0);
    });
  });

  it('preserves the queue when asynchronous insertion fails', async () => {
    let queueState =
      createOcrWriterInsertionQueue([
        createOcrWriterInsertionCandidate({
          source: 'ocrRegion',
          element: makeTextElement(),
        }),
      ]);

    let attempts = 0;

    render(
      <OcrWriterInsertPanel
        queue={queueState}
        onQueueChange={(next) => {
          queueState = next;
        }}
        onInsertElements={async () => {
          attempts += 1;
          throw new Error(
            'journal write failed',
          );
        }}
      />,
    );

    fireEvent.click(
      screen.getByTestId(
        'ocr-writer-insert-button',
      ),
    );

    await waitFor(() => {
      expect(attempts).toBe(1);
    });
    expect(
      queueState.candidates,
    ).toHaveLength(1);
  });

  it('warns when invalid candidate exists', () => {
    const queue = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeTextElement(),
      }),
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: {
          ...makeTextElement(),
          id: 'bad',
          documentFingerprint: '',
        },
      }),
    ]);

    render(
      <OcrWriterInsertPanel
        queue={queue}
        onQueueChange={() => undefined}
      />,
    );

    expect(screen.getByTestId('ocr-writer-insert-warning')).toBeTruthy();
    expect(screen.getByTestId('ocr-writer-insert-count').textContent).toBe('1/2');
  });

  it('clears queue', () => {
    let queueState = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeTextElement(),
      }),
    ]);

    render(
      <OcrWriterInsertPanel
        queue={queueState}
        onQueueChange={(next) => {
          queueState = next;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-writer-clear-button'));

    expect(queueState.candidates).toHaveLength(0);
  });
});

function makeTextElement(): WriterElementV2 {
  return {
    id: 'ocr-text-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 640,
      width: 220,
      height: 80,
    },
    plainText: 'OCR text',
    style: {
      zIndex: 10,
      fontFamily: 'Aptos',
      fontSize: 11,
      textColor: '#111827',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 4,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
