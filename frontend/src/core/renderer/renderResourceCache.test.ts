import { describe, expect, it, vi } from 'vitest';
import { ByteBoundedLruCache } from './renderResourceCache';

describe('ByteBoundedLruCache', () => {
  it('evicts least-recently-used resources until the byte budget is satisfied', () => {
    const cache = new ByteBoundedLruCache<string, string>(10);
    const disposed: string[] = [];
    const dispose = (value: string) => disposed.push(value);

    cache.set('a', 'alpha', 4, dispose);
    cache.set('b', 'beta', 4, dispose);
    expect(cache.get('a')).toBe('alpha');

    cache.set('c', 'gamma', 4, dispose);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('alpha');
    expect(cache.get('c')).toBe('gamma');
    expect(disposed).toEqual(['beta']);
    expect(cache.getDiagnostics()).toEqual({
      entries: 2,
      totalBytes: 8,
      maxBytes: 10,
    });
  });

  it('disposes resources that individually exceed the budget', () => {
    const cache = new ByteBoundedLruCache<string, string>(5);
    const dispose = vi.fn();

    expect(cache.set('oversized', 'value', 6, dispose)).toBe(false);
    expect(dispose).toHaveBeenCalledWith('value');
    expect(cache.getDiagnostics()).toEqual({
      entries: 0,
      totalBytes: 0,
      maxBytes: 5,
    });
  });

  it('disposes replaced, deleted, and cleared resources exactly once', () => {
    const cache = new ByteBoundedLruCache<string, string>(20);
    const dispose = vi.fn();

    cache.set('one', 'first', 5, dispose);
    cache.set('one', 'replacement', 4, dispose);
    cache.set('two', 'second', 4, dispose);
    cache.delete('one');
    cache.clear();

    expect(dispose.mock.calls).toEqual([
      ['first'],
      ['replacement'],
      ['second'],
    ]);
    expect(cache.getDiagnostics().totalBytes).toBe(0);
  });

  it('can remove a document-specific subset without disturbing other resources', () => {
    const cache = new ByteBoundedLruCache<string, string>(20);
    const dispose = vi.fn();

    cache.set('doc-a:1', 'a1', 4, dispose);
    cache.set('doc-a:2', 'a2', 4, dispose);
    cache.set('doc-b:1', 'b1', 4, dispose);

    expect(cache.deleteWhere((key) => key.startsWith('doc-a:'))).toBe(2);
    expect(cache.get('doc-a:1')).toBeUndefined();
    expect(cache.get('doc-b:1')).toBe('b1');
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});
