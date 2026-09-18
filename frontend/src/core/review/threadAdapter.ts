import type { PdfAnnotation } from '@/core/annotations/types';
import {
  getAnnotationReviewStatus,
  isReviewConversationAnnotation,
} from './annotationReview';
import type { ReviewMessage, ReviewThread } from './types';

/**
 * Transitional domain adapter.
 *
 * ReviewThread is the UI/domain contract. Annotation.review remains the
 * persistence backing during Phase 1 so page-remapping and legacy project
 * compatibility are not destabilized in the same change.
 */
export function reviewThreadFromAnnotation(
  annotation: PdfAnnotation,
): ReviewThread | null {
  if (!isReviewConversationAnnotation(annotation)) {
    return null;
  }

  const review = annotation.data.review;
  const author =
    review?.author
    ?? (typeof annotation.data.author === 'string' && annotation.data.author.trim()
      ? annotation.data.author.trim()
      : 'Unknown');

  const rootContent = readRootContent(annotation);
  const rootMessage: ReviewMessage[] = rootContent
    ? [{
        id: `${annotation.id}:root`,
        author,
        content: rootContent,
        createdAt: review?.createdAt ?? annotation.createdAt,
      }]
    : [];

  const replies: ReviewMessage[] = (review?.replies ?? []).map((reply) => ({
    id: reply.id,
    author: reply.author,
    content: reply.content,
    createdAt: reply.createdAt,
  }));

  return {
    id: `review:${annotation.id}`,
    anchor: {
      annotationId: annotation.id,
      ...(annotation.pageId ? { pageId: annotation.pageId } : {}),
      pageNumber: annotation.pageNumber,
      annotationType: annotation.type,
    },
    status: getAnnotationReviewStatus(annotation),
    author,
    title:
      review?.title?.trim()
      || summarizeThreadTitle(rootContent)
      || humanizeAnnotationType(annotation.type),
    category: review?.category,
    createdAt: review?.createdAt ?? annotation.createdAt,
    updatedAt: review?.updatedAt ?? annotation.updatedAt,
    messages: [...rootMessage, ...replies],
  };
}

export function reviewThreadsFromAnnotations(
  annotations: PdfAnnotation[],
): ReviewThread[] {
  return annotations.flatMap((annotation) => {
    const thread = reviewThreadFromAnnotation(annotation);
    return thread ? [thread] : [];
  });
}

function readRootContent(annotation: PdfAnnotation): string {
  if (typeof annotation.data.text === 'string' && annotation.data.text.trim()) {
    return annotation.data.text.trim();
  }

  if (typeof annotation.data.content === 'string' && annotation.data.content.trim()) {
    return annotation.data.content.trim();
  }

  return '';
}

function summarizeThreadTitle(content: string): string {
  if (!content) return '';
  const singleLine = content.replace(/\s+/g, ' ').trim();
  return singleLine.length > 72
    ? `${singleLine.slice(0, 69)}…`
    : singleLine;
}

function humanizeAnnotationType(type: string): string {
  return type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
