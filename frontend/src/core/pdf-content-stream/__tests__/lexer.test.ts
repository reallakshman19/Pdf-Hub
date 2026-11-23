import { describe, expect, it } from 'vitest';
import {
  decodePdfName,
  isDelimiter,
  isWhitespace,
  lexContentStream,
  parsePdfNumber,
} from '../lexer';

describe('PDF Content Stream Lexer', () => {
  it('tokenizes simple operators and numeric operands', () => {
    const source = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET';
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    expect(result.diagnostics).toEqual([]);

    const wordsAndNames = result.tokens.map((t) => t.raw);
    expect(wordsAndNames).toEqual([
      'BT',
      '/F1',
      '12',
      'Tf',
      '1',
      '0',
      '0',
      '1',
      '72',
      '700',
      'Tm',
      '(Hello)',
      'Tj',
      'ET',
    ]);

    const numToken = result.tokens[2];
    expect(numToken.kind).toBe('number');
    expect(numToken.numberValue).toBe(12);

    const nameToken = result.tokens[1];
    expect(nameToken.kind).toBe('name');
    expect(nameToken.nameValue).toBe('F1');

    const strToken = result.tokens[11];
    expect(strToken.kind).toBe('literal-string');
    expect(strToken.decodedText).toBe('Hello');
  });

  it('handles literal strings with escaped characters and parens', () => {
    const source = '(Hello \\(World\\) \\n \\r \\t \\\\)';
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    expect(result.tokens).toHaveLength(1);
    const token = result.tokens[0];
    expect(token.kind).toBe('literal-string');
    expect(token.decodedText).toBe('Hello (World) \n \r \t \\');
  });

  it('handles octal character escapes in literal strings', () => {
    // \101 is 'A' (65 decimal = 101 octal)
    const source = '(\\101\\102\\103)';
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    expect(result.tokens[0].decodedText).toBe('ABC');
  });

  it('handles multiline line continuations in literal strings', () => {
    const source = '(Hello \\\nWorld)';
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    expect(result.tokens[0].decodedText).toBe('Hello World');
  });

  it('handles hex strings with whitespace and casing', () => {
    const source = '<48 65 6C 6c 6F>';
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    expect(result.tokens[0].kind).toBe('hex-string');
    expect(result.tokens[0].decodedText).toBe('Hello');
  });

  it('pads odd-length hex strings per ISO 32000-1 §7.3.4.3', () => {
    // <48656c6c6f7> -> 11 hex digits -> padded to <48656c6c6f70> -> "Hellop"
    const source = '<48656c6c6f7>';
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    expect(result.tokens[0].decodedText).toBe('Hellop');
  });

  it('handles PDF comments and ignores them', () => {
    const source = '% This is a comment\nq % Another comment\n1 0 0 1 0 0 cm\nQ';
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    const words = result.tokens.map((t) => t.raw);
    expect(words).toEqual(['q', '1', '0', '0', '1', '0', '0', 'cm', 'Q']);
  });

  it('handles structural brackets for arrays and dicts', () => {
    const source = '[ 12 (Hello) /Name ] << /Key 42 >>';
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    const rawTokens = result.tokens.map((t) => t.raw);
    expect(rawTokens).toEqual([
      '[',
      '12',
      '(Hello)',
      '/Name',
      ']',
      '<<',
      '/Key',
      '42',
      '>>',
    ]);
  });

  it('handles PDF name hex escapes #xx', () => {
    expect(decodePdfName('A#20B#23C')).toBe('A B#C');
  });

  it('parses numbers accurately', () => {
    expect(parsePdfNumber('100')).toBe(100);
    expect(parsePdfNumber('-45.75')).toBe(-45.75);
    expect(parsePdfNumber('+.5')).toBe(0.5);
    expect(parsePdfNumber('invalid')).toBeNull();
  });

  it('identifies whitespace and delimiters', () => {
    expect(isWhitespace(0x20)).toBe(true); // Space
    expect(isWhitespace(0x0a)).toBe(true); // LF
    expect(isDelimiter(0x28)).toBe(true);  // (
    expect(isDelimiter(0x2f)).toBe(true);  // /
    expect(isDelimiter(0x41)).toBe(false); // 'A'
  });

  it('tokenizes inline images with raw binary data containing delimiters (ISO 32000-1 §8.9.5)', () => {
    // Raw binary data between ID and EI contains '(', '<', '%', '/', which would break normal tokenization
    const binaryData = '(\x00\xff<%/';
    const source = `BI /W 10 /H 10 /CS /DeviceRGB /BPC 8 ID ${binaryData} EI Q`;
    const result = lexContentStream(source);

    expect(result.complete).toBe(true);
    expect(result.diagnostics).toEqual([]);

    const imageToken = result.tokens.find((t) => t.kind === 'inline-image-data');
    expect(imageToken).toBeDefined();
    expect(imageToken?.raw).toBe(binaryData);

    const eiToken = result.tokens.find((t) => t.raw === 'EI');
    expect(eiToken).toBeDefined();

    const qToken = result.tokens[result.tokens.length - 1];
    expect(qToken.raw).toBe('Q');
  });
});
