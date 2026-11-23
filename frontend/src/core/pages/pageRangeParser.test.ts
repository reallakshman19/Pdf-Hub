import { describe, expect, it } from 'vitest';
import { parsePageRangeString } from './pageRangeParser';

describe('pageRangeParser', () => {
  it('parses "all" as every 0-based page index up to maxPages', () => {
    const result = parsePageRangeString('all', 5);
    expect(result.valid).toBe(true);
    expect(result.pageIndices).toEqual([0, 1, 2, 3, 4]);
  });

  it('parses single pages and ranges correctly', () => {
    const result = parsePageRangeString('1, 3-5, 8', 10);
    expect(result.valid).toBe(true);
    expect(result.pageIndices).toEqual([0, 2, 3, 4, 7]);
  });

  it('preserves user-specified sequence across pages and ranges', () => {
    const result = parsePageRangeString('3, 1-2, 5', 10);
    expect(result.valid).toBe(true);
    expect(result.pageIndices).toEqual([2, 0, 1, 4]);

    const reverseResult = parsePageRangeString('5, 2', 10);
    expect(reverseResult.valid).toBe(true);
    expect(reverseResult.pageIndices).toEqual([4, 1]);
  });

  it('rejects duplicate page specifications with a clear error', () => {
    const duplicateDirect = parsePageRangeString('1, 1', 10);
    expect(duplicateDirect.valid).toBe(false);
    expect(duplicateDirect.error).toBe('Duplicate page number 1 detected in range.');

    const duplicateOverlap = parsePageRangeString('4, 2-5, 1', 10);
    expect(duplicateOverlap.valid).toBe(false);
    expect(duplicateOverlap.error).toBe('Duplicate page number 4 detected in range.');

    const duplicateWithinRanges = parsePageRangeString('1-3, 3-5', 10);
    expect(duplicateWithinRanges.valid).toBe(false);
    expect(duplicateWithinRanges.error).toBe('Duplicate page number 3 detected in range.');
  });

  it('handles surrounding whitespace gracefully', () => {
    const result = parsePageRangeString('  1 - 2 ,  4  ', 5);
    expect(result.valid).toBe(true);
    expect(result.pageIndices).toEqual([0, 1, 3]);
  });

  it('fails on empty string or whitespace only', () => {
    expect(parsePageRangeString('', 5).valid).toBe(false);
    expect(parsePageRangeString('   ', 5).valid).toBe(false);
  });

  it('fails on zero or negative maxPages', () => {
    expect(parsePageRangeString('1', 0).valid).toBe(false);
  });

  it('fails on zero or negative page numbers', () => {
    const zeroResult = parsePageRangeString('0-2', 5);
    expect(zeroResult.valid).toBe(false);
    expect(zeroResult.error).toContain('1 or greater');

    const singleZero = parsePageRangeString('0', 5);
    expect(singleZero.valid).toBe(false);
    expect(singleZero.error).toContain('1 or greater');
  });

  it('fails on out-of-bounds page numbers', () => {
    const result = parsePageRangeString('1-6', 5);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds source document length');

    const singleOob = parsePageRangeString('7', 5);
    expect(singleOob.valid).toBe(false);
    expect(singleOob.error).toContain('exceeds source document length');
  });

  it('fails on inverted ranges', () => {
    const result = parsePageRangeString('5-2', 10);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot exceed end page');
  });

  it('fails on non-numeric characters', () => {
    expect(parsePageRangeString('1, abc', 5).valid).toBe(false);
    expect(parsePageRangeString('1-a', 5).valid).toBe(false);
  });

  it('fails on malformed ranges with multiple hyphens or empty commas', () => {
    expect(parsePageRangeString('1-2-3', 5).valid).toBe(false);
    expect(parsePageRangeString('1,,2', 5).valid).toBe(false);
    expect(parsePageRangeString('1,', 5).valid).toBe(false);
  });
});
