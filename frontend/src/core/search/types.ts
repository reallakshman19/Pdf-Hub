export interface SearchHitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SearchHit {
  id: string;
  pageNumber: number;
  snippet: string;
  rects: SearchHitRect[];
}

export type SearchPageIndexStatus =
  | 'unindexed'
  | 'queued'
  | 'indexing'
  | 'indexed'
  | 'failed';

export interface SearchIndexProgress {
  revisionId: string | null;
  indexedPages: number;
  failedPages: number;
  pendingPages: number;
  totalPages: number;
  complete: boolean;
}

export const EMPTY_SEARCH_INDEX_PROGRESS: SearchIndexProgress = {
  revisionId: null,
  indexedPages: 0,
  failedPages: 0,
  pendingPages: 0,
  totalPages: 0,
  complete: false,
};

export interface SearchState {
  query: string;
  isSearching: boolean;
  hits: SearchHit[];
  activeHitId: string | null;
  error: string | null;
  indexProgress: SearchIndexProgress;
}

// --- New types for the SearchIndexer ---

export interface BBoxHit {
  pageNumber: number;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface PageTextItem {
  str: string;
  rect: { x: number; y: number; width: number; height: number };
}

export type SearchScope =
  | 'nativeText'
  | 'ocrText'
  | 'annotations'
  | 'bookmarks'
  | 'pageLabels';

export interface SearchQuery {
  text: string;
  scopes: SearchScope[];
  exactPhrase?: boolean;
  regex?: boolean;
  caseSensitive?: boolean;
  selectedPagesOnly?: boolean;
  pageNumbers?: number[];
}

export interface SearchResult {
  id: string;
  scope: SearchScope;
  pageNumber: number;
  snippet: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  deepLink: string;
}
