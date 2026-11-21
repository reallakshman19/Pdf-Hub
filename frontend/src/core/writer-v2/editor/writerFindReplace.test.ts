import { describe, expect, it } from 'vitest';
import { findWriterLiteralMatches } from './writerFindReplace';

describe('Writer literal find/replace original offsets', () => {
  it('preserves original UTF-16 offsets after an expanding lowercase character', () => {
    expect(findWriterLiteralMatches('İx 😀X', 'x', false)).toEqual([
      { startOffset: 1, length: 1 }, { startOffset: 5, length: 1 },
    ]);
  });
  it('treats regex syntax literally and never returns overlapping matches', () => {
    expect(findWriterLiteralMatches('a.*b .*c', '.*', true)).toEqual([
      { startOffset: 1, length: 2 }, { startOffset: 5, length: 2 },
    ]);
    expect(findWriterLiteralMatches('aaaa', 'aa', true)).toHaveLength(2);
    expect(findWriterLiteralMatches('aaa', '', false)).toEqual([]);
  });
  it('produces a finite original-match replacement plan even if replacement contains the query', () => {
    let text = 'a a';
    const matches = findWriterLiteralMatches(text, 'a', true);
    for (const { startOffset, length } of matches.reverse()) {
      text = text.slice(0, startOffset) + 'aa' + text.slice(startOffset + length);
    }
    expect(text).toBe('aa aa');
    expect(matches).toHaveLength(2);
  });
});
