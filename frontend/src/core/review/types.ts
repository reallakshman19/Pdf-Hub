export type ReviewStatus = 'open' | 'resolved' | 'rejected';

export interface ReviewReply {
  id: string;
  author: string;
  content: string;
  createdAt: number;
}

export interface ReviewMetadata {
  author: string;
  createdAt: number;
  updatedAt: number;
  status: ReviewStatus;
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
