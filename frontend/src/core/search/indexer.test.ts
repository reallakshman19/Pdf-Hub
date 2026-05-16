import { describe, it, expect } from 'vitest';
import { SearchIndexer } from './indexer';

describe('SearchIndexer', () => {
  const dummyData = {
    1: [
      { str: 'Hello world', rect: { x: 10, y: 10, width: 100, height: 12 } },
      { str: 'This is a test document.', rect: { x: 10, y: 30, width: 200, height: 12 } }
    ],
    2: [
      { str: 'More Text Here', rect: { x: 10, y: 10, width: 150, height: 12 } },
      { str: 'HELLO again', rect: { x: 10, y: 30, width: 100, height: 12 } }
    ]
  };

  it('finds case-insensitive matches by default', () => {
    const hits = SearchIndexer.search(dummyData, 'hello', { caseSensitive: false, wholeWord: false, useRegex: false });
    expect(hits).toHaveLength(2);
    expect(hits[0].pageNumber).toBe(1);
    expect(hits[1].pageNumber).toBe(2);
  });

  it('respects case-sensitive flag', () => {
    const hits = SearchIndexer.search(dummyData, 'HELLO', { caseSensitive: true, wholeWord: false, useRegex: false });
    expect(hits).toHaveLength(1);
    expect(hits[0].pageNumber).toBe(2);
  });

  it('respects whole word flag', () => {
    const hits = SearchIndexer.search(dummyData, 'test', { wholeWord: true, caseSensitive: false, useRegex: false });
    expect(hits).toHaveLength(1);
    
    const hits2 = SearchIndexer.search(dummyData, 'tes', { wholeWord: true, caseSensitive: false, useRegex: false });
    expect(hits2).toHaveLength(0);
  });

  it('respects regex flag', () => {
    // "Hello" matches on page 1.
    // "HELLO" does not match since it's uppercase, but the regex flag is case-insensitive by default in the indexer
    // Wait, the indexer defaults to 'gi' if not caseSensitive.
    // So 'H[a-z]+o' in 'gi' matches 'Hello' and 'HELLO'.
    // Let's pass caseSensitive: true to strictly match 'H[a-z]+o' against 'Hello'
    const hits = SearchIndexer.search(dummyData, 'H[a-z]+o', { useRegex: true, caseSensitive: true, wholeWord: false });
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe('Hello');
  });
});
