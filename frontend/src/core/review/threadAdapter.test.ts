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

  it('projects PageId into the review thread anchor when available', () => {
    const annotation = {
      ...baseAnnotation,
      pageId: 'stable-page-7',
      pageNumber: 3,
    };

    const thread = reviewThreadFromAnnotation(annotation);

    expect(thread?.anchor).toMatchObject({
      annotationId: annotation.id,
      pageId: 'stable-page-7',
      pageNumber: 3,
    });
  });

});
