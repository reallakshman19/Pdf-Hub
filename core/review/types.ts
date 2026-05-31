export interface ThreadMetadata {
  id: string;
  authorId: string;
  createdAt: number;
  updatedAt: number;
  status: 'open' | 'resolved' | 'closed';
  targetGeometry?: any; // Define further
}

export interface ReviewSummaryExportModel {
  documentId: string;
  totalThreads: number;
  resolvedThreads: number;
  threads: ThreadMetadata[];
}
