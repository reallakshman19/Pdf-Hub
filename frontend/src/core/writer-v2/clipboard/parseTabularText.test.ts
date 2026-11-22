import { describe, expect, it } from 'vitest';
import { parseTabularText } from './parseTabularText';

describe('rectangular TSV paste', () => {
  it('preserves Unicode, boundary spaces and empty cells', () => {
    expect(parseTabularText('  α\t\nβ\t  ')).toEqual([['  α', ''], ['β', '  ']]);
  });
  it('does not reinterpret comma-separated prose or ragged rows', () => {
    expect(parseTabularText('Hello, world')).toBeNull();
    expect(parseTabularText('a\tb\nc')).toBeNull();
  });
  it('bounds table dimensions', () => {
    expect(parseTabularText(Array.from({ length: 51 }, () => 'a\tb').join('\n'))).toBeNull();
  });
});
