import { describe, expect, it } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import {
  getAnnotationReviewStatus,
  normalizeAnnotationReview,
  withAnnotationReviewStatus,
} from './annotationReview';

function annotation(data: PdfAnnotation['data']): PdfAnnotation {
  return {
    id: 'a1',
    type: 'comment',
    pageNumber: 1,
    rect: { x: 10, y: 20, width: 100, height: 40 },
    data,
    createdAt: 100,
    updatedAt: 200,
  };
}

describe('annotation review canonicalization', () => {
  it('promotes legacy reviewStatus into review.status and removes the legacy field', () => {
    const input = annotation({
      author: 'Legacy Reviewer',
      reviewStatus: 'resolved',
    });

    const migrated = normalizeAnnotationReview(input);

    expect(migrated.data.review).toEqual({
      author: 'Legacy Reviewer',
      createdAt: 100,
      updatedAt: 200,
      status: 'resolved',
      replies: [],
    });
    expect(Object.prototype.hasOwnProperty.call(migrated.data, 'reviewStatus')).toBe(false);
  });

  it('prefers canonical review.status when both canonical and legacy values exist', () => {
    const input = annotation({
      reviewStatus: 'rejected',
      review: {
        author: 'Reviewer',
        createdAt: 100,
        updatedAt: 200,
        status: 'resolved',
        replies: [],
      },
    });

    const migrated = normalizeAnnotationReview(input);

    expect(getAnnotationReviewStatus(migrated)).toBe('resolved');
    expect(Object.prototype.hasOwnProperty.call(migrated.data, 'reviewStatus')).toBe(false);
  });

  it('writes status changes with transition actor provenance without changing thread author', () => {
    const input = annotation({
      review: {
        author: 'Original Reviewer',
        createdAt: 100,
        updatedAt: 200,
        status: 'open',
        replies: [],
      },
    });

    const updated = withAnnotationReviewStatus(input, 'rejected', 300);

    expect(updated.updatedAt).toBe(300);
    expect(updated.data.review?.author).toBe('Original Reviewer');
    expect(updated.data.review?.status).toBe('rejected');
    expect(updated.data.review?.statusAuthor).toBe('Current User');
    expect(updated.data.review?.updatedAt).toBe(300);
    expect(Object.prototype.hasOwnProperty.call(updated.data, 'reviewStatus')).toBe(false);

    const explicitlyAttributed = withAnnotationReviewStatus(
      updated,
      'resolved',
      400,
      'Reviewer Two',
    );
    expect(explicitlyAttributed.data.review?.author).toBe('Original Reviewer');
    expect(explicitlyAttributed.data.review?.statusAuthor).toBe('Reviewer Two');
  });
});
