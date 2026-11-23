import { describe, it, expect } from 'vitest';
import { diffOcrText, tokenizeTextIntoWords } from '../ocrDiffEngine';

describe('ocrDiffEngine', () => {
  it('tokenizes text while preserving punctuation and filtering blanks', () => {
    const tokens = tokenizeTextIntoWords('Hello, world!  This is a   test.');
    expect(tokens).toEqual(['Hello,', 'world!', 'This', 'is', 'a', 'test.']);
  });

  it('detects identical texts with 100% similarity and 0 WER', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const result = diffOcrText(text, text);

    expect(result.metrics.similarity).toBe(100);
    expect(result.metrics.wordErrorRate).toBe(0);
    expect(result.metrics.equalWords).toBe(9);
    expect(result.metrics.insertedWords).toBe(0);
    expect(result.metrics.deletedWords).toBe(0);
    expect(result.metrics.replacedWords).toBe(0);

    expect(result.segments.every((s) => s.op === 'equal')).toBe(true);
  });

  it('identifies word substitutions and updates WER', () => {
    const original = 'Invoice Total: $450.00 due immediately';
    const ocrScan = 'Invoice Total: $450.00 due tomorrow'; // 'immediately' -> 'tomorrow'
    const result = diffOcrText(original, ocrScan);

    expect(result.metrics.replacedWords).toBe(1);
    expect(result.metrics.deletedWords).toBe(0);
    expect(result.metrics.insertedWords).toBe(0);
    expect(result.metrics.equalWords).toBe(4);
    expect(result.metrics.similarity).toBeGreaterThan(75);
    expect(result.metrics.wordErrorRate).toBeGreaterThan(0);

    const replaceSeg = result.segments.find((s) => s.op === 'replace');
    expect(replaceSeg).toBeDefined();
    expect(replaceSeg?.originalText).toBe('immediately');
    expect(replaceSeg?.ocrText).toBe('tomorrow');
  });

  it('identifies insertions and deletions properly', () => {
    const original = 'Agreement terms and conditions apply';
    const ocrScan = 'Agreement and conditions'; // deleted 'terms', deleted 'apply'
    const result = diffOcrText(original, ocrScan);

    expect(result.metrics.deletedWords).toBe(2);
    expect(result.metrics.insertedWords).toBe(0);
    expect(result.metrics.equalWords).toBe(3);
    expect(result.metrics.wordErrorRate).toBeCloseTo(2 / 5, 2);
  });

  it('handles completely disjoint text strings', () => {
    const original = 'Alpha Beta Gamma';
    const ocrScan = 'One Two Three';
    const result = diffOcrText(original, ocrScan);

    expect(result.metrics.equalWords).toBe(0);
    expect(result.metrics.similarity).toBe(0);
    expect(result.metrics.wordErrorRate).toBe(1.0);
  });
});
