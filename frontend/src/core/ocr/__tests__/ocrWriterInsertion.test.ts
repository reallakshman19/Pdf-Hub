import { describe, expect, it } from 'vitest';
import type { WriterElementV2, WriterTableData } from '../../writer-v2/types';
import { createOcrRegion } from '../ocrRegionModel';
import {
  buildOcrWriterInsertionResult,
  clearOcrWriterInsertionQueue,
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
  createReviewedOcrTableWriterElement,
  deleteOcrWriterInsertionCandidate,
  getInsertableOcrWriterCandidates,
  sortWriterElementsForInsertion,
  upsertOcrWriterInsertionCandidate,
  validateOcrWriterElementForInsertion,
} from '../ocrWriterInsertion';

describe('ocrWriterInsertion', () => {
  it('validates OCR Writer element for insertion', () => {
    const element = makeTextElement();

    const diagnostics = validateOcrWriterElementForInsertion(element);

    expect(diagnostics.some((diagnostic) => diagnostic.code === 'VALID_WRITER_ELEMENT')).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.level === 'error')).toBe(false);
  });

  it('rejects invalid rect', () => {
    const element = {
      ...makeTextElement(),
      rect: {
        x: 0,
        y: 0,
        width: 0,
        height: 10,
      },
    };

    const diagnostics = validateOcrWriterElementForInsertion(element);

    expect(diagnostics.some((diagnostic) => diagnostic.code === 'INVALID_RECT')).toBe(true);
  });

  it('rejects tableBox without tableData', () => {
    const element: WriterElementV2 = {
      ...makeTextElement(),
      id: 'bad-table',
      type: 'tableBox',
      plainText: '',
      tableData: undefined,
    };

    const diagnostics = validateOcrWriterElementForInsertion(element);

    expect(diagnostics.some((diagnostic) => diagnostic.code === 'MISSING_TABLE_DATA')).toBe(true);
  });

  it('creates insertion candidate', () => {
    const candidate = createOcrWriterInsertionCandidate({
      source: 'ocrRegion',
      element: makeTextElement(),
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(candidate.id).toBe('ocr-insert-ocr-text-1');
    expect(candidate.source).toBe('ocrRegion');
    expect(candidate.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(candidate.diagnostics.some((diagnostic) => diagnostic.level === 'error')).toBe(false);
  });

  it('upserts and deletes insertion candidates', () => {
    const candidate = createOcrWriterInsertionCandidate({
      source: 'ocrRegion',
      element: makeTextElement(),
    });

    const queue = upsertOcrWriterInsertionCandidate(
      createOcrWriterInsertionQueue(),
      candidate,
    );

    expect(queue.candidates).toHaveLength(1);

    const updatedCandidate = {
      ...candidate,
      element: {
        ...candidate.element,
        plainText: 'Updated',
      },
    };

    const updatedQueue = upsertOcrWriterInsertionCandidate(queue, updatedCandidate);

    expect(updatedQueue.candidates).toHaveLength(1);
    expect(updatedQueue.candidates[0].element.plainText).toBe('Updated');

    const deletedQueue = deleteOcrWriterInsertionCandidate(
      updatedQueue,
      candidate.id,
    );

    expect(deletedQueue.candidates).toHaveLength(0);
  });

  it('filters insertable candidates', () => {
    const valid = createOcrWriterInsertionCandidate({
      source: 'ocrRegion',
      element: makeTextElement(),
    });

    const invalid = createOcrWriterInsertionCandidate({
      source: 'ocrRegion',
      element: {
        ...makeTextElement(),
        id: 'invalid',
        documentFingerprint: '',
      },
    });

    const queue = createOcrWriterInsertionQueue([valid, invalid]);

    expect(getInsertableOcrWriterCandidates(queue)).toHaveLength(1);
  });

  it('builds insertion result and skips duplicates', () => {
    const element = makeTextElement();

    const queue = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element,
      }),
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element,
      }),
    ]);

    const result = buildOcrWriterInsertionResult(queue);

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_INSERTION_SKIPPED')).toBe(true);
  });

  it('creates reviewed OCR table Writer element', () => {
    const region = createOcrRegion({
      id: 'region-table',
      documentFingerprint: 'doc-table',
      pageIndex: 0,
      mode: 'table',
      bbox: {
        x: 72,
        y: 500,
        width: 360,
        height: 160,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    const tableData = makeTableData();

    const element = createReviewedOcrTableWriterElement({
      documentFingerprint: 'doc-table',
      region,
      tableData,
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(element.type).toBe('tableBox');
    expect(element.id).toBe('ocr-tableBox-region-table');
    expect(element.tableData).toBe(tableData);
    expect(element.plainText).toContain('Item\tQuantity');
    expect(element.plainText).toContain('Pipe\t2');
  });

  it('sorts Writer elements by page, y descending, x ascending, zIndex ascending', () => {
    const a = makeTextElement({
      id: 'a',
      pageIndex: 1,
      x: 100,
      y: 100,
      zIndex: 0,
    });

    const b = makeTextElement({
      id: 'b',
      pageIndex: 0,
      x: 200,
      y: 100,
      zIndex: 0,
    });

    const c = makeTextElement({
      id: 'c',
      pageIndex: 0,
      x: 50,
      y: 700,
      zIndex: 0,
    });

    const sorted = sortWriterElementsForInsertion([a, b, c]);

    expect(sorted.map((element) => element.id)).toEqual(['c', 'b', 'a']);
  });

  it('clears insertion queue', () => {
    const queue = createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeTextElement(),
      }),
    ]);

    expect(queue.candidates).toHaveLength(1);
    expect(clearOcrWriterInsertionQueue().candidates).toHaveLength(0);
  });
});

function makeTextElement(
  patch: {
    id?: string;
    pageIndex?: number;
    x?: number;
    y?: number;
    zIndex?: number;
  } = {},
): WriterElementV2 {
  return {
    id: patch.id ?? 'ocr-text-1',
    documentFingerprint: 'doc-1',
    pageIndex: patch.pageIndex ?? 0,
    type: 'richTextBox',
    rect: {
      x: patch.x ?? 72,
      y: patch.y ?? 640,
      width: 220,
      height: 80,
    },
    plainText: 'OCR text',
    style: {
      zIndex: patch.zIndex ?? 10,
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

function makeTableData(): WriterTableData {
  return {
    hasHeaderRow: true,
    columns: [
      {
        id: 'col-1',
        label: 'Item',
        width: 120,
      },
      {
        id: 'col-2',
        label: 'Quantity',
        width: 120,
      },
    ],
    rows: [
      {
        id: 'row-1',
        cells: [
          {
            id: 'cell-1',
            text: 'Pipe',
          },
          {
            id: 'cell-2',
            text: '2',
          },
        ],
      },
    ],
  };
}
