import type { PageId } from '../pages/types';

export type ReviewStatus = 'open' | 'resolved' | 'rejected';

export interface ReviewMessage {
  id: string;
  author: string;
  content: string;
  createdAt: number;
  /** Logical parent reply when this message is nested below another reply. */
  parentReplyId?: string;
}

/**
 * Compatibility alias for the annotation-backed persistence schema.
 * New UI/domain code should use ReviewMessage.
 */
export type ReviewReply = ReviewMessage;

export interface ReviewThreadAnchor {
  annotationId: string;
  /** Canonical anchor during PageId migration; absent only for legacy inputs. */
  pageId?: PageId;
  /** Derived one-based position retained for navigation/UI compatibility. */
  pageNumber: number;
  annotationType: string;
}

export interface ReviewThread {
  id: string;
  anchor: ReviewThreadAnchor;
  status: ReviewStatus;
  author: string;
  title: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
  messages: ReviewMessage[];
}

export interface ReviewMetadata {
  author: string;
  createdAt: number;
  updatedAt: number;
  status: ReviewStatus;
  /** Author of the latest projected review-state transition, when known. */
  statusAuthor?: string;
  title?: string;
  category?: string;
  replies: ReviewReply[];
}

export interface ReviewSummaryExport {
  totalAnnotations: number;
  resolvedCount: number;
  openCount: number;
  rejectedCount: number;
  annotations: Array<{
    id: string;
    pageNumber: number;
    type: string;
    status: ReviewStatus;
    author: string;
    title?: string;
    category?: string;
    textPreview: string;
    createdAt: number;
    replyCount: number;
  }>;
  generatedAt: number;
}
