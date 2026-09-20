import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from './types';
import { useWriterV2Store } from './writerV2Store';
import {
  clearActiveWriterReviewMetadata,
  ensureActiveWriterReviewMetadata,
  markActiveWriterReviewResolved,
  updateActiveWriterReviewMetadata,
} from './writerReviewActions';

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
    plainText: 'Check this',
    editorStateJson: '{"root":{"children":[]}}',
    style: {
      zIndex: 1,
      backgroundColor: '#fef3c7',
      borderColor: '#d97706',
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

describe('writerReviewActions', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('review-1')],
    });
    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'review-1',
    });
  });

  it('adds review metadata to active object', async () => {
    const result = await ensureActiveWriterReviewMetadata();

    expect(result.changed).toBe(true);

    const review = useWriterV2Store.getState().elements[0].review;
    expect(review?.status).toBe('open');
    expect(review?.priority).toBe('medium');
    expect(review?.category).toBe('qa');
  });

  it('updates review metadata', async () => {
    await ensureActiveWriterReviewMetadata();

    await updateActiveWriterReviewMetadata({
      status: 'inProgress',
      priority: 'high',
      category: 'engineering',
      assignee: 'Lakshman',
      dueDate: '2026-06-30',
    });

    const review = useWriterV2Store.getState().elements[0].review;

    expect(review?.status).toBe('inProgress');
    expect(review?.priority).toBe('high');
    expect(review?.category).toBe('engineering');
    expect(review?.assignee).toBe('Lakshman');
    expect(review?.dueDate).toBe('2026-06-30');
  });

  it('marks review resolved', async () => {
    await ensureActiveWriterReviewMetadata();

    await markActiveWriterReviewResolved();

    expect(useWriterV2Store.getState().elements[0].review?.status).toBe('resolved');
  });

  it('clears review metadata', async () => {
    await ensureActiveWriterReviewMetadata();

    await clearActiveWriterReviewMetadata();

    expect(useWriterV2Store.getState().elements[0].review).toBeUndefined();
  });
});
