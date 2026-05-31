/**
 * A simple least‑recently used (LRU) cache for PDF page objects.  When the
 * cache reaches the configured maximum number of pages it evicts the
 * oldest page.  In a real implementation this would hold `PDFPageProxy`
 * instances from pdfjs and call `cleanup()` on evicted pages to release
 * underlying resources.  Since the preview build does not load real pages,
 * pages are represented as `unknown` and no cleanup is necessary.
 */
export class PdfPageCache {
  private cache = new Map<number, unknown>();
  private readonly maxPages: number;

  constructor(maxPages: number = 8) {
    this.maxPages = Math.max(1, maxPages);
  }

  /** Retrieve a page from the cache.  Moves the page to the most
   * recently used position.  Returns `undefined` if the page is not in
   * the cache.
   */
  get(pageNumber: number): unknown | undefined {
    const value = this.cache.get(pageNumber);
    if (value !== undefined) {
      // Move to back (most recently used)
      this.cache.delete(pageNumber);
      this.cache.set(pageNumber, value);
    }
    return value;
  }

  /** Insert a page into the cache.  If the cache exceeds its limit the
   * least recently used page is evicted.  Returns the evicted page
   * number (if any) so that the caller can perform cleanup.
   */
  set(pageNumber: number, page: unknown): number | null {
    if (this.cache.has(pageNumber)) {
      this.cache.delete(pageNumber);
    }
    this.cache.set(pageNumber, page);
    let evicted: number | null = null;
    if (this.cache.size > this.maxPages) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        evicted = oldestKey;
      }
    }
    return evicted;
  }

  /** Clear all cached pages. */
  clear(): void {
    this.cache.clear();
  }
}