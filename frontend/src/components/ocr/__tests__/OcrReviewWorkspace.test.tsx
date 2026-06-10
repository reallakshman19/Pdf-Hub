import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { createOcrDemoResult } from '@/core/ocr/fixtures/ocrDemoFixtures';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
} from '@/core/ocr/ocrWriterInsertion';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { OcrReviewWorkspace } from '../workflow/OcrReviewWorkspace';

const defaultProps = {
  documentFingerprint: 'review-doc',
  selectedPages: [0],
  writerInsertionQueue: createOcrWriterInsertionQueue(),
  onWriterInsertionQueueChange: vi.fn(),
};

describe('OcrReviewWorkspace', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
    defaultProps.onWriterInsertionQueueChange.mockClear();
  });

  it('renders an empty review workspace before OCR exists', () => {
    render(
      <OcrReviewWorkspace
        {...defaultProps}
      />,
    );

    expect(screen.getByTestId('ocr-review-workspace-empty')).toBeTruthy();
    expect(screen.getByText(/Run OCR to show confidence/i)).toBeTruthy();
  });

  it('renders result summary, search, and region tools when OCR result exists', () => {
    useOcrStore.getState().setOcrResult(
      createOcrDemoResult('clean-text', 'review-doc'),
    );

    render(
      <OcrReviewWorkspace
        {...defaultProps}
      />,
    );

    expect(screen.getByTestId('ocr-review-workspace')).toBeTruthy();
    expect(screen.getByTestId('ocr-result-summary')).toBeTruthy();
    expect(screen.getByTestId('ocr-review-workspace-summary')).toBeTruthy();
    expect(screen.getByTestId('ocr-review-workspace-regions')).toBeTruthy();
  });

  it('does not render stale OCR result from another document', () => {
    useOcrStore.getState().setOcrResult(
      createOcrDemoResult('clean-text', 'old-doc'),
    );

    render(
      <OcrReviewWorkspace
        {...defaultProps}
        documentFingerprint="new-doc"
      />,
    );

    expect(screen.getByTestId('ocr-review-workspace-empty')).toBeTruthy();
    expect(screen.queryByTestId('ocr-result-summary')).toBeNull();
    expect(screen.queryByTestId('ocr-review-workspace-summary')).toBeNull();
  });

  it('renders restored Writer insertion queue and emits inserted elements', () => {
    const onInsertWriterElements = vi.fn();
    const element = createWriterTextElement('review-doc');

    const queue = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element,
      }),
    ]);

    render(
      <OcrReviewWorkspace
        {...defaultProps}
        writerInsertionQueue={queue}
        onInsertWriterElements={onInsertWriterElements}
      />,
    );

    expect(screen.getByTestId('ocr-review-workspace-writer')).toBeTruthy();
    expect(screen.getByTestId('ocr-writer-insert-panel')).toBeTruthy();

    fireEvent.click(screen.getByTestId('ocr-writer-insert-button'));

    expect(onInsertWriterElements).toHaveBeenCalledWith([element]);
    expect(defaultProps.onWriterInsertionQueueChange).toHaveBeenCalled();
  });

  it('resets selected review state when document fingerprint changes', async () => {
    const onInsertWriterElements = vi.fn();
    const element = createWriterTextElement('doc-a');

    const queue = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element,
      }),
    ]);

    const { rerender } = render(
      <OcrReviewWorkspace
        documentFingerprint="doc-a"
        selectedPages={[0]}
        writerInsertionQueue={queue}
        onWriterInsertionQueueChange={defaultProps.onWriterInsertionQueueChange}
        onInsertWriterElements={onInsertWriterElements}
      />,
    );

    fireEvent.click(screen.getByTestId('ocr-writer-insert-button'));

    expect(screen.getByTestId('ocr-writer-inserted-summary').textContent).toContain('Inserted 1');

    rerender(
      <OcrReviewWorkspace
        documentFingerprint="doc-b"
        selectedPages={[0]}
        writerInsertionQueue={queue}
        onWriterInsertionQueueChange={defaultProps.onWriterInsertionQueueChange}
        onInsertWriterElements={onInsertWriterElements}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ocr-review-workspace-empty')).toBeTruthy();
      expect(screen.queryByTestId('ocr-writer-inserted-summary')).toBeNull();
      expect(screen.queryByTestId('ocr-writer-insert-panel')).toBeNull();
    });
  });
});

function createWriterTextElement(documentFingerprint = 'review-doc'): WriterElementV2 {
  return {
    id: `writer-ocr-${documentFingerprint}`,
    documentFingerprint,
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 720,
      width: 240,
      height: 48,
    },
    plainText: 'Inserted OCR text',
    style: {
      zIndex: 1,
      fontSize: 12,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
