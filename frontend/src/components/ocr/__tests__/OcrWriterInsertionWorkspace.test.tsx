import {
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
import {
  createOcrWriterInsertionCandidate,
  type OcrWriterInsertionQueueState,
} from '@/core/ocr/ocrWriterInsertion';
import { OcrWriterInsertionWorkspace } from '../workflow/OcrWriterInsertionWorkspace';

describe('OcrWriterInsertionWorkspace', () => {
  const mockCandidate = createOcrWriterInsertionCandidate({
    source: 'ocrTableReview',
    element: {
      id: 'elem-1',
      documentFingerprint: 'doc-fp-1',
      pageIndex: 0,
      type: 'tableBox',
      rect: { x: 50, y: 50, width: 200, height: 100 },
      plainText: 'A\tB\n1\t2',
      tableData: {
        columns: [
          { id: 'c1', label: 'A', width: 100 },
          { id: 'c2', label: 'B', width: 100 },
        ],
        rows: [
          {
            id: 'r1',
            cells: [
              { id: 'r1c1', text: '1' },
              { id: 'r1c2', text: '2' },
            ],
          },
        ],
      },
      style: {
        zIndex: 1,
        fontFamily: 'Aptos',
        fontSize: 10,
        textColor: '#000',
        backgroundColor: '#FFF',
        borderColor: '#CCC',
        borderWidth: 1,
        padding: 0,
        opacity: 1,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locked: false,
      hidden: false,
    },
  });

  const mockQueue: OcrWriterInsertionQueueState = {
    candidates: [mockCandidate],
  };

  it('renders insertion queue and handles element insertion', async () => {
    let insertedCount = 0;
    const handleInsert = vi.fn().mockImplementation(async (elements) => {
      insertedCount = elements.length;
    });

    render(
      <OcrWriterInsertionWorkspace
        queue={mockQueue}
        onQueueChange={vi.fn()}
        onInsertElements={handleInsert}
      />,
    );

    expect(screen.getByTestId('ocr-review-workspace-writer')).toBeTruthy();
    expect(screen.getByTestId('ocr-writer-insert-count').textContent).toContain('1');

    const insertBtn = screen.getByTestId('ocr-writer-insert-button');
    fireEvent.click(insertBtn);

    expect(handleInsert).toHaveBeenCalled();
    expect(insertedCount).toBe(1);
    await waitFor(() => {
      expect(screen.getByTestId('ocr-writer-inserted-summary')).toBeTruthy();
    });
  });
});
