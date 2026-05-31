import type { TextItem } from './types';

/**
 * Cache text items per document, page and scale bucket.  This cache is
 * beneficial when toggling between viewing modes and when searching
 * repeatedly.  The scale is bucketed to avoid storing duplicate entries
 * for trivial zoom differences.  A bucket of 0.1 means that zoom levels
 * between 1.0 and 1.09 will share the same cached results.
 */
export class TextLayerCache {
  private cache = new Map<string, Map<number, Map<number, TextItem[]>>>();
  private readonly scaleBucketSize: number;

  constructor(scaleBucketSize: number = 0.1) {
    this.scaleBucketSize = scaleBucketSize;
  }

  /** Generate a bucket index from a zoom level. */
  private bucketIndex(scale: number): number {
    return Math.floor(scale / this.scaleBucketSize);
  }

  /** Get cached items for a given document key, page and scale. */
  get(docKey: string, pageNumber: number, scale: number): TextItem[] | undefined {
    const docEntry = this.cache.get(docKey);
    if (!docEntry) return undefined;
    const pageEntry = docEntry.get(pageNumber);
    if (!pageEntry) return undefined;
    return pageEntry.get(this.bucketIndex(scale));
  }

  /** Store items in the cache. */
  set(docKey: string, pageNumber: number, scale: number, items: TextItem[]): void {
    let docEntry = this.cache.get(docKey);
    if (!docEntry) {
      docEntry = new Map();
      this.cache.set(docKey, docEntry);
    }
    let pageEntry = docEntry.get(pageNumber);
    if (!pageEntry) {
      pageEntry = new Map();
      docEntry.set(pageNumber, pageEntry);
    }
    pageEntry.set(this.bucketIndex(scale), items);
  }

  /** Clear all cached entries for a document. */
  clearDocument(docKey: string): void {
    this.cache.delete(docKey);
  }

  /** Clear the entire cache. */
  clear(): void {
    this.cache.clear();
  }
}