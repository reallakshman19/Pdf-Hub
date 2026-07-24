export interface RenderResourceCacheDiagnostics {
  entries: number;
  totalBytes: number;
  maxBytes: number;
}

export interface RenderResourceLease<T> {
  readonly value: T;
  release: () => void;
}

interface RenderResourceCacheEntry<T> {
  value: T;
  bytes: number;
  refCount: number;
  dispose?: (value: T) => void;
}

export class ByteBoundedLruCache<K, T> {
  private readonly entries = new Map<K, RenderResourceCacheEntry<T>>();
  private totalBytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes: number) {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
      throw new Error('ByteBoundedLruCache maxBytes must be non-negative.');
    }
    this.maxBytes = maxBytes;
  }

  get(key: K): T | undefined {
    const entry = this.touch(key);
    return entry?.value;
  }

  acquire(key: K): RenderResourceLease<T> | null {
    const entry = this.touch(key);
    if (!entry) return null;

    entry.refCount += 1;
    let released = false;
    return {
      value: entry.value,
      release: () => {
        if (released) return;
        released = true;
        entry.refCount = Math.max(0, entry.refCount - 1);
        this.evictToBudget();
      },
    };
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
      if (existing.refCount > 0) {
        dispose?.(value);
        return false;
      }
      this.entries.delete(key);
      this.totalBytes = Math.max(0, this.totalBytes - existing.bytes);
      this.disposeEntry(existing);
    }

    if (normalizedBytes > this.maxBytes) {
      dispose?.(value);
      return false;
    }

    this.entries.set(key, {
      value,
      bytes: normalizedBytes,
      refCount: 0,
      dispose,
    });
    this.totalBytes += normalizedBytes;
    this.evictToBudget();
    return true;
  }

  delete(key: K, options: { force?: boolean } = {}): boolean {
    const entry = this.entries.get(key);
    if (!entry || (entry.refCount > 0 && options.force !== true)) return false;

    this.entries.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
    this.disposeEntry(entry);
    return true;
  }

  deleteWhere(predicate: (key: K, value: T) => boolean): number {
    const keys = Array.from(this.entries.entries())
      .filter(([key, entry]) => entry.refCount === 0 && predicate(key, entry.value))
      .map(([key]) => key);

    for (const key of keys) this.delete(key);
    return keys.length;
  }

  clear(options: { force?: boolean } = {}): void {
    const keys = Array.from(this.entries.entries())
      .filter(([, entry]) => options.force === true || entry.refCount === 0)
      .map(([key]) => key);
    for (const key of keys) this.delete(key, options);
  }

  getDiagnostics(): RenderResourceCacheDiagnostics {
    return {
      entries: this.entries.size,
      totalBytes: this.totalBytes,
      maxBytes: this.maxBytes,
    };
  }

  private touch(key: K): RenderResourceCacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  private evictToBudget(): void {
    while (this.totalBytes > this.maxBytes) {
      const oldest = Array.from(this.entries.entries())
        .find(([, entry]) => entry.refCount === 0);
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
