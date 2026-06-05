import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import {
  searchWriterObjects,
  writerObjectTypeLabel,
} from './writerObjectSearch';

function element(
  id: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 100, height: 40 },
    plainText: 'Writer object',
    editorStateJson: '{"root":{"children":[]}}',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
    ...patch,
  };
}

describe('writerObjectSearch', () => {
  it('filters objects by text', () => {
    const results = searchWriterObjects(
      [
        element('a', { plainText: 'Check support load' }),
        element('b', { plainText: 'Approved stamp' }),
      ],
      {
        text: 'support',
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });

  it('filters by object type', () => {
    const results = searchWriterObjects(
      [
        element('text-1', { type: 'richTextBox' }),
        element('table-1', { type: 'tableBox', plainText: 'Table' }),
      ],
      {
        type: 'tableBox',
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('tableBox');
  });

  it('filters by page', () => {
    const results = searchWriterObjects(
      [
        element('p1', { pageIndex: 0 }),
        element('p2', { pageIndex: 1 }),
      ],
      {
        page: 2,
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p2');
  });

  it('excludes hidden objects by default', () => {
    const results = searchWriterObjects(
      [
        element('visible'),
        element('hidden', { hidden: true }),
      ],
      {},
    );

    expect(results.map((result) => result.id)).toEqual(['visible']);
  });

  it('includes hidden objects when requested', () => {
    const results = searchWriterObjects(
      [
        element('visible'),
        element('hidden', { hidden: true }),
      ],
      {
        includeHidden: true,
      },
    );

    expect(results.map((result) => result.id)).toEqual(['hidden', 'visible']);
  });

  it('filters by review metadata', () => {
    const results = searchWriterObjects(
      [
        element('open-high', {
          review: {
            status: 'open',
            priority: 'high',
            category: 'engineering',
            commentId: 'comment-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
        element('resolved-low', {
          review: {
            status: 'resolved',
            priority: 'low',
            category: 'general',
            commentId: 'comment-2',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ],
      {
        reviewStatus: 'open',
        reviewPriority: 'high',
        reviewCategory: 'engineering',
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('open-high');
  });

  it('filters only review-tracked objects', () => {
    const results = searchWriterObjects(
      [
        element('plain'),
        element('reviewed', {
          review: {
            status: 'open',
            priority: 'medium',
            category: 'qa',
            commentId: 'comment-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ],
      {
        onlyWithReview: true,
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('reviewed');
  });

  it('maps object type labels', () => {
    expect(writerObjectTypeLabel('imageBox')).toBe('Image');
    expect(writerObjectTypeLabel('tableBox')).toBe('Table');
    expect(writerObjectTypeLabel('reviewLabel')).toBe('Review Label');
  });
});
