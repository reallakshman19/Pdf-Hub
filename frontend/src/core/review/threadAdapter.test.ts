import { describe, expect, it } from 'vitest';

import type { PdfAnnotation } from '@/core/annotations/types';
import {
  reviewThreadFromAnnotation,
  reviewThreadsFromAnnotations,
} from './threadAdapter';

function annotation(
  id: string,
  type: PdfAnnotation['type'],
  data: PdfAnnotation['data'] = {},
): PdfAnnotation {
  return {
    id,
    type,
    pageNumber: 3,
    rect: { x: 10, y: 20, width: 100, height: 40 },
    data,
    createdAt: 100,
    updatedAt: 200,
  };
}

describe('ReviewThread adapter', () => {
  it('does not turn plain markup into a review thread', () => {
    expect(
      reviewThreadFromAnnotation(
        annotation('highlight-1', 'highlight', { backgroundColor: '#ffff00' }),
      ),
    ).toBeNull();
  });

  it('projects a comment plus replies into one thread message sequence', () => {
    const thread = reviewThreadFromAnnotation(
      annotation('comment-1', 'comment', {
        text: 'Check flange rating.',
        review: {
          author: 'Alice',
          createdAt: 100,
          updatedAt: 250,
          status: 'open',
          title: 'Flange review',
          category: 'Design',
          replies: [
            {
              id: 'reply-1',
              author: 'Bob',
              content: 'Use Class 300.',
              createdAt: 220,
            },
          ],
        },
      }),
    );

    expect(thread).toMatchObject({
      id: 'review:comment-1',
      anchor: {
        annotationId: 'comment-1',
        pageNumber: 3,
        annotationType: 'comment',
      },
      status: 'open',
      author: 'Alice',
      title: 'Flange review',
      category: 'Design',
    });

    expect(thread?.messages).toEqual([
      {
        id: 'comment-1:root',
        author: 'Alice',
        content: 'Check flange rating.',
        createdAt: 100,
      },
      {
        id: 'reply-1',
        author: 'Bob',
        content: 'Use Class 300.',
        createdAt: 220,
      },
    ]);
  });

  it('allows markup to own a review thread when review metadata exists', () => {
    const threads = reviewThreadsFromAnnotations([
      annotation('plain', 'highlight'),
      annotation('reviewed', 'highlight', {
        review: {
          author: 'Reviewer',
          createdAt: 100,
          updatedAt: 200,
          status: 'resolved',
          title: 'Confirm this value',
          replies: [],
        },
      }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      anchor: {
        annotationId: 'reviewed',
        annotationType: 'highlight',
      },
      status: 'resolved',
      title: 'Confirm this value',
    });
  });

  it('generates a readable title when explicit review title is absent', () => {
    const thread = reviewThreadFromAnnotation(
      annotation('note-1', 'sticky-note', {
        text: 'This note needs a concise title generated from its text content.',
      }),
    );

    expect(thread?.title).toBe(
      'This note needs a concise title generated from its text content.',
    );
  });

  it('preserves exact nested parent identity and native rich-text reply provenance', () => {
    const original = annotation('comment-nested', 'comment', {
      text: 'Duplicate reply content',
      review: {
        author: 'Root Author',
        createdAt: 100,
        updatedAt: 400,
        status: 'resolved',
        replies: [
          {
            id: 'reply-a',
            author: 'Reviewer A',
            content: 'Same reply text',
            createdAt: 200,
          },
          {
            id: 'reply-b',
            author: 'Reviewer B',
            content: 'Same reply text',
            createdAt: 300,
            parentReplyId: 'reply-a',
            nativeInterop: {
              fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
              reason: 'RICH_TEXT',
              richText: true,
              protectedContent: '<p>Same reply text</p>',
            },
          },
        ],
      },
    });
    const originalSnapshot = JSON.stringify(original);

    const projected = reviewThreadFromAnnotation(original);

    expect(projected?.id).toBe('review:comment-nested');
    expect(projected?.status).toBe('resolved');
    expect(projected?.messages.map((message) => message.id)).toEqual([
      'comment-nested:root',
      'reply-a',
      'reply-b',
    ]);
    expect(projected?.messages[0]).not.toHaveProperty('parentReplyId');
    expect(projected?.messages[1]).not.toHaveProperty('parentReplyId');
    expect(projected?.messages[2]).toMatchObject({
      id: 'reply-b',
      content: 'Same reply text',
      parentReplyId: 'reply-a',
      nativeInterop: {
        fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
        reason: 'RICH_TEXT',
        richText: true,
        protectedContent: '<p>Same reply text</p>',
      },
    });
    expect(projected?.messages[2].nativeInterop).not.toBe(
      original.data.review?.replies[1].nativeInterop,
    );
    expect(JSON.stringify(original)).toBe(originalSnapshot);
  });

  it('keeps identical thread titles and reply texts isolated by stable annotation IDs', () => {
    const makeThread = (id: string, replyId: string, pageId: string) => ({
      ...annotation(id, 'comment', {
        text: 'Identical title',
        review: {
          author: 'Root',
          createdAt: 100,
          updatedAt: 200,
          status: 'open' as const,
          replies: [{
            id: replyId,
            author: 'Reviewer',
            content: 'Identical reply',
            createdAt: 150,
          }],
        },
      }),
      pageId,
    });
    const first = makeThread('root-A', 'reply-A', 'page-A');
    const second = makeThread('root-B', 'reply-B', 'page-B');

    const byAnchor = new Map(
      reviewThreadsFromAnnotations([first, second]).map(
        (thread) => [thread.anchor.annotationId, thread],
      ),
    );

    expect(byAnchor.size).toBe(2);
    expect(byAnchor.get('root-A')).toMatchObject({
      id: 'review:root-A',
      anchor: { annotationId: 'root-A', pageId: 'page-A' },
      title: 'Identical title',
    });
    expect(byAnchor.get('root-B')).toMatchObject({
      id: 'review:root-B',
      anchor: { annotationId: 'root-B', pageId: 'page-B' },
      title: 'Identical title',
    });
    expect(byAnchor.get('root-A')?.messages.map((message) => message.id)).toEqual([
      'root-A:root', 'reply-A',
    ]);
    expect(byAnchor.get('root-B')?.messages.map((message) => message.id)).toEqual([
      'root-B:root', 'reply-B',
    ]);
  });

  it('does not silently reparent orphaned native reply IDs to the root', () => {
    const original = annotation('root-orphan', 'comment', {
      text: 'Root',
      review: {
        author: 'Root Author',
        createdAt: 100,
        updatedAt: 200,
        status: 'open',
        replies: [{
          id: 'reply-orphan',
          author: 'Reviewer',
          content: 'Requires native parent validation',
          createdAt: 150,
          parentReplyId: 'missing-parent',
        }],
      },
    });

    const projection = reviewThreadFromAnnotation(original);
    expect(projection?.messages[1].parentReplyId).toBe('missing-parent');
    expect(original.data.review?.replies[0].parentReplyId).toBe('missing-parent');
  });

  it('does not alter sticky-note collapse metadata when projecting review state', () => {
    const note = annotation('sticky-review', 'sticky-note', {
      text: 'Review note',
      isCollapsed: true,
      review: {
        author: 'Reviewer',
        createdAt: 100,
        updatedAt: 300,
        status: 'rejected',
        replies: [],
      },
    });
    const projection = reviewThreadFromAnnotation(note);
    expect(projection?.status).toBe('rejected');
    expect(projection?.anchor.annotationId).toBe('sticky-review');
    expect(note.data.isCollapsed).toBe(true);
  });

  it('projects PageId into the review thread anchor when available', () => {
    const anchored = {
      ...annotation('comment-page-id', 'comment', { text: 'Anchored review' }),
      pageId: 'stable-page-7',
    };

    const thread = reviewThreadFromAnnotation(anchored);

    expect(thread?.anchor).toMatchObject({
      annotationId: anchored.id,
      pageId: 'stable-page-7',
      pageNumber: 3,
    });
  });

});
