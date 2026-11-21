import { describe, expect, it } from 'vitest';
import { stripPdfTextObjects } from './nativeAppearanceUnderlay';

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);

describe('native appearance text isolation', () => {
  it('preserves graphics and ignores operator-like bytes inside PDF strings and comments', () => {
    const input = 'q 1 0 0 RG 0 0 10 10 re S % BT comment\nBT /F1 12 Tf (literal ET and \\(BT\\)) Tj <4254> Tj ET Q';
    const result = decode(stripPdfTextObjects(encode(input)));
    expect(result).toContain('1 0 0 RG 0 0 10 10 re S');
    expect(result).toContain('% BT comment');
    expect(result).toMatch(/\sQ$/);
    expect(result).not.toContain('literal ET');
  });

  it('fails closed for nested XObjects, inline images, malformed text or missing text', () => {
    for (const input of ['q /Other Do Q BT (text) Tj ET', 'BI /W 1 ID x EI BT (text) Tj ET', 'BT (text) Tj', 'q 0 0 m S Q']) {
      expect(() => stripPdfTextObjects(encode(input))).toThrow(/Cannot safely edit native appearance/);
    }
  });
});
