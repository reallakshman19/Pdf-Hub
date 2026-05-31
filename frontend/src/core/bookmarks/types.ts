export interface AppBookmark {
  id: string;
  title: string;
  pageNumber: number;
  createdAt: number;
}

export interface BookmarkNode {
  id: string;
  title: string;
  pageNumber: number;
  x?: number;
  y?: number;
  source?: 'generated' | 'manual' | 'pdf';
  children: BookmarkNode[];
}