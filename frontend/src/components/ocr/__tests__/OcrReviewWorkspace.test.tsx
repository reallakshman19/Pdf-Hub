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

  it('renders restored Writer insertion queue and emits inserted elements', () => {
    const onInsertWriterElements = vi.fn();
    const element = createWriterTextElement();

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
});

function createWriterTextElement(): WriterElementV2 {
  return {
    id: 'writer-ocr-1',
    documentFingerprint: 'review-doc',
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
