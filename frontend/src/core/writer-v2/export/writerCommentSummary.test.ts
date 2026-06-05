import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import {
  collectWriterCommentSummaryRows,
  serializeWriterCommentSummary,
} from './writerCommentSummary';

function element(
  id: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'reviewLabel',
    rect: { x: 10, y: 20, width: 120, height: 40 },
    plainText: 'Check support load',
    editorStateJson: '{"root":{"children":[]}}',
    style: {
      zIndex: 1,
      backgroundColor: '#fef3c7',
      borderColor: '#d97706',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    review: {
      status: 'open',
      priority: 'high',
      category: 'engineering',
      assignee: 'Team A',
      commentId: 'comment-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    locked: false,
    hidden: false,
    ...patch,
  };
}

describe('writerCommentSummary', () => {
  it('collects visible Writer comments', () => {
    const rows = collectWriterCommentSummaryRows([
      element('comment-1'),
      element('hidden-1', {
        hidden: true,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'comment-1',
      page: 1,
      text: 'Check support load',
      status: 'open',
      priority: 'high',
      category: 'engineering',
      assignee: 'Team A',
    });
  });

  it('serializes CSV', () => {
    const rows = collectWriterCommentSummaryRows([element('comment-1')]);
    const csv = serializeWriterCommentSummary(rows, 'csv');

    expect(csv).toContain('"comment-1"');
    expect(csv).toContain('"Check support load"');
    expect(csv).toContain('"engineering"');
  });

  it('serializes Markdown', () => {
    const rows = collectWriterCommentSummaryRows([element('comment-1')]);
    const markdown = serializeWriterCommentSummary(rows, 'markdown');

    expect(markdown).toContain('# Writer Comment Summary');
    expect(markdown).toContain('| 1 | reviewLabel | open | high | engineering | Team A | Check support load |');
  });

  it('serializes JSON', () => {
    const rows = collectWriterCommentSummaryRows([element('comment-1')]);
    const json = serializeWriterCommentSummary(rows, 'json');

    expect(JSON.parse(json)[0].id).toBe('comment-1');
  });
});
