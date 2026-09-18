import { describe, expect, it } from 'vitest';
import {
  materializePdfCommand,
  type PdfCommand,
} from '../../commands/types';
import type { Transaction } from '../types';
import {
  retainedBytesForTransactions,
  retainHistorySuffix,
  type HistoryRetentionPolicy,
} from '../historyBudget';

const command: PdfCommand = materializePdfCommand(
  {
    type: 'ROTATE_PAGES',
    payload: {
      pageIndices: [0],
      angle: 90,
    },
  },
  'toolbar',
  'doc',
  {
    id: 'budget-rotate',
    createdAt: '2026-09-18T00:00:00.000Z',
  },
);

function state(bytes: Uint8Array) {
  return {
    bytes,
    pageCount: 1,
    documentKey: 'doc',
    selectedPages: [1],
    currentPage: 1,
    annotations: [],
  };
}

function transaction(
  id: string,
  beforeBytes: Uint8Array,
  afterBytes: Uint8Array,
): Transaction {
  return {
    id,
    command,
    label: id,
    timestamp: 0,
    before: state(beforeBytes),
    after: state(afterBytes),
  };
}

function policy(overrides: Partial<HistoryRetentionPolicy> = {}): HistoryRetentionPolicy {
  return {
    maxUndoDepth: 15,
    maxRetainedBytes: 1024,
    minimumRetainedTransactions: 1,
    ...overrides,
  };
}

describe('history byte budget', () => {
  it('counts a shared adjacent boundary snapshot only once', () => {
    const shared = new Uint8Array(4);
    const transactions = [
      transaction('one', new Uint8Array(4), shared),
      transaction('two', shared, new Uint8Array(4)),
    ];

    expect(retainedBytesForTransactions(transactions)).toBe(12);
    const retained = retainHistorySuffix(transactions, policy({ maxRetainedBytes: 12 }));
    expect(retained.transactions.map((item) => item.id)).toEqual(['one', 'two']);
    expect(retained.retainedBytes).toBe(12);
    expect(retained.droppedTransactions).toBe(0);
  });

  it('retains a contiguous newest suffix when an older transaction exceeds the remaining budget', () => {
    const newest = transaction('newest', new Uint8Array(3), new Uint8Array(3));
    const middle = transaction('middle', new Uint8Array(20), newest.before.bytes);
    const oldest = transaction('oldest', new Uint8Array(1), new Uint8Array(1));

    const retained = retainHistorySuffix(
      [oldest, middle, newest],
      policy({ maxRetainedBytes: 8 }),
    );

    expect(retained.transactions.map((item) => item.id)).toEqual(['newest']);
    expect(retained.droppedTransactions).toBe(2);
    expect(retained.reason).toBe('bytes');
  });

  it('caps history depth even when the byte budget has room', () => {
    const transactions = [1, 2, 3].map((value) =>
      transaction(String(value), new Uint8Array([value]), new Uint8Array([value + 1])),
    );

    const retained = retainHistorySuffix(transactions, policy({ maxUndoDepth: 2 }));
    expect(retained.transactions.map((item) => item.id)).toEqual(['2', '3']);
    expect(retained.droppedTransactions).toBe(1);
    expect(retained.reason).toBe('depth');
  });

  it('keeps the newest oversized transaction and reports the budget exception', () => {
    const retained = retainHistorySuffix(
      [transaction('oversized', new Uint8Array(6), new Uint8Array(6))],
      policy({ maxRetainedBytes: 8 }),
    );

    expect(retained.transactions.map((item) => item.id)).toEqual(['oversized']);
    expect(retained.retainedBytes).toBe(12);
    expect(retained.overBudget).toBe(true);
    expect(retained.droppedTransactions).toBe(0);
  });
});
