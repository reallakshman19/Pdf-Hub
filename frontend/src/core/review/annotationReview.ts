import type { PdfAnnotation } from '@/core/annotations/types';
import type { ReviewMetadata, ReviewStatus } from './types';

function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === 'open' || value === 'resolved' || value === 'rejected';
}

function fallbackAuthor(annotation: PdfAnnotation): string {
  return typeof annotation.data.author === 'string' && annotation.data.author.trim()
    ? annotation.data.author
    : 'Unknown';
}

function buildReviewMetadata(
  annotation: PdfAnnotation,
  status: ReviewStatus,
  updatedAt: number,
): ReviewMetadata {
  const current = annotation.data.review;

  return {
    author: current?.author ?? fallbackAuthor(annotation),
    createdAt: current?.createdAt ?? annotation.createdAt,
    replies: current?.replies ?? [],
    ...current,
    status,
    updatedAt,
  };
}

/**
 * Read annotation review state from the canonical nested review object.
 * Legacy reviewStatus is accepted only as a migration fallback.
 */
export function getAnnotationReviewStatus(annotation: PdfAnnotation): ReviewStatus {
  const canonical = annotation.data.review?.status;
  if (isReviewStatus(canonical)) {
    return canonical;
  }

  const legacy = annotation.data.reviewStatus;
  return isReviewStatus(legacy) ? legacy : 'open';
}

/**
 * Remove the legacy annotation.data.reviewStatus field and, when necessary,
 * promote it into annotation.data.review.status.
 */
export function normalizeAnnotationReview(annotation: PdfAnnotation): PdfAnnotation {
  const hasLegacyField = Object.prototype.hasOwnProperty.call(annotation.data, 'reviewStatus');
  const legacy = annotation.data.reviewStatus;
  const canonical = annotation.data.review?.status;

  if (!hasLegacyField && isReviewStatus(canonical)) {
    return annotation;
  }

  const { reviewStatus: _legacyReviewStatus, ...dataWithoutLegacy } = annotation.data;

  if (!annotation.data.review && !isReviewStatus(legacy)) {
    return hasLegacyField
      ? {
          ...annotation,
          data: dataWithoutLegacy,
        }
      : annotation;
  }

  const status = isReviewStatus(canonical)
    ? canonical
    : isReviewStatus(legacy)
      ? legacy
      : 'open';

  return {
    ...annotation,
    data: {
      ...dataWithoutLegacy,
      review: buildReviewMetadata(annotation, status, annotation.data.review?.updatedAt ?? annotation.updatedAt),
    },
  };
}

export function normalizeAnnotationReviews(annotations: PdfAnnotation[]): PdfAnnotation[] {
  return annotations.map(normalizeAnnotationReview);
}

/**
 * Return a copy of an annotation with canonical review metadata updated.
 * No legacy reviewStatus field is emitted.
 */
export function withAnnotationReviewStatus(
  annotation: PdfAnnotation,
  status: ReviewStatus,
  updatedAt: number = Date.now(),
): PdfAnnotation {
  const { reviewStatus: _legacyReviewStatus, ...dataWithoutLegacy } = annotation.data;

  return {
    ...annotation,
    data: {
      ...dataWithoutLegacy,
      review: buildReviewMetadata(annotation, status, updatedAt),
    },
    updatedAt,
  };
}
