export interface RenderResourceCacheDiagnostics {
  entries: number;
  totalBytes: number;
  maxBytes: number;
}

interface RenderResourceCacheEntry<T> {
  value: T;
  bytes: number;
  dispose?: (value: T) => void;
}

export class ByteBoundedLruCache<K, T> {
  private readonly entries = new Map<K, RenderResourceCacheEntry<T>>();
  private totalBytes = 0;

  constructor(private readonly maxBytes: number) {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
      throw new Error('ByteBoundedLruCache maxBytes must be non-negative.');
    }
  }

  get(key: K): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(
    key: K,
    value: T,
    bytes: number,
    dispose?: (value: T) => void,
  ): boolean {
    const normalizedBytes = Math.max(0, Math.floor(bytes));
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.totalBytes = Math.max(0, this.totalBytes - existing.bytes);
      this.disposeEntry(existing);
    }

    if (normalizedBytes > this.maxBytes) {
      dispose?.(value);
      return false;
    }

    this.entries.set(key, { value, bytes: normalizedBytes, dispose });
    this.totalBytes += normalizedBytes;
    this.evictToBudget();
    return true;
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    this.entries.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
    this.disposeEntry(entry);
    return true;
  }

  deleteWhere(predicate: (key: K, value: T) => boolean): number {
    const keys = Array.from(this.entries.entries())
      .filter(([key, entry]) => predicate(key, entry.value))
      .map(([key]) => key);

    for (const key of keys) this.delete(key);
    return keys.length;
  }

  clear(): void {
    const entries = Array.from(this.entries.values());
    this.entries.clear();
    this.totalBytes = 0;
    for (const entry of entries) this.disposeEntry(entry);
  }

  getDiagnostics(): RenderResourceCacheDiagnostics {
    return {
      entries: this.entries.size,
      totalBytes: this.totalBytes,
      maxBytes: this.maxBytes,
    };
  }

  private evictToBudget(): void {
    while (this.totalBytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value as
        | [K, RenderResourceCacheEntry<T>]
        | undefined;
      if (!oldest) return;
      this.delete(oldest[0]);
    }
  }

  private disposeEntry(entry: RenderResourceCacheEntry<T>): void {
    try {
      entry.dispose?.(entry.value);
    } catch {
      // Resource cleanup is best-effort and must not corrupt cache accounting.
    }
  }
}

export interface ThumbnailRenderCacheValue {
  imageUrl: string;
  pageWidth: number;
  pageHeight: number;
  estimatedDecodedBytes: number;
  dispose: () => void;
}

export const MAX_THUMBNAIL_BITMAP_BYTES = 32 * 1024 * 1024;

export const thumbnailRenderCache = new ByteBoundedLruCache<
  string,
  ThumbnailRenderCacheValue
>(MAX_THUMBNAIL_BITMAP_BYTES);

export function getThumbnailRenderCacheKey(
  documentKey: string,
  pageNumber: number,
  targetWidth = 150,
): string {
  return `${documentKey}:${pageNumber}:${targetWidth}`;
}

export function cacheThumbnailRender(
  key: string,
  value: ThumbnailRenderCacheValue,
): boolean {
  return thumbnailRenderCache.set(
    key,
    value,
    value.estimatedDecodedBytes,
    (cached) => cached.dispose(),
  );
}
