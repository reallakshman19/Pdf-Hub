import { describe, expect, it, vi } from 'vitest';
import { PdfPageCache } from './pageCache';
import { TextLayerCache } from './textLayerCache';
import { ThumbnailQueue } from './thumbnailQueue';

describe('pdf-renderer cache and queue utilities', () => {
  it('PdfPageCache enforces LRU eviction and clear', () => {
    const cache = new PdfPageCache(2);
    expect(cache.set(1, 'p1')).toBeNull();
    expect(cache.set(2, 'p2')).toBeNull();
    expect(cache.get(1)).toBe('p1');
    expect(cache.set(3, 'p3')).toBe(2);
    expect(cache.get(2)).toBeUndefined();
    cache.clear();
    expect(cache.get(1)).toBeUndefined();
  });

  it('TextLayerCache stores and retrieves items by 0.1 scale bucket and clears per doc', () => {
    const cache = new TextLayerCache(0.1);
    const items = [{ id: 't1', str: 'Hello', x: 0, y: 0, width: 10, height: 10 }];
    cache.set('doc1', 1, 1.02, items);
    expect(cache.get('doc1', 1, 1.08)).toBe(items);
    expect(cache.get('doc1', 1, 1.2)).toBeUndefined();
    cache.clearDocument('doc1');
    expect(cache.get('doc1', 1, 1.02)).toBeUndefined();
    cache.set('doc2', 1, 1.0, items);
    cache.clear();
    expect(cache.get('doc2', 1, 1.0)).toBeUndefined();
  });

  it('ThumbnailQueue runs queued tasks within concurrency bound and swallows task failures', async () => {
    const queue = new ThumbnailQueue(1);
    const order: string[] = [];
    queue.enqueue(async () => {
      order.push('first');
    });
    queue.enqueue(async () => {
      order.push('failing');
      throw new Error('boom');
    });
    queue.enqueue(async () => {
      order.push('third');
    });
    await vi.waitFor(() => {
      expect(order).toEqual(['first', 'failing', 'third']);
    });
  });
});
