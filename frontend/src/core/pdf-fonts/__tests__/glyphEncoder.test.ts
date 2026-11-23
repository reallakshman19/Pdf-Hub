import { describe, expect, it } from 'vitest';
import { encodeTextForFont } from '../glyphEncoder';
import type { PdfFontMetadata } from '../types';

describe('glyphEncoder', () => {
  const mockCompositeFont: PdfFontMetadata = {
    resourceName: '/F1',
    baseFont: 'BAAAAA+Calibri',
    cleanFontFamily: 'Calibri',
    isSubset: true,
    subtype: 'Type0',
    encodingType: 'Identity-H',
    cMap: {
      cidToUnicode: new Map([
        [1, 'H'],
        [2, 'e'],
        [3, 'l'],
        [4, 'o'],
      ]),
      unicodeToCid: new Map([
        ['H', 1],
        ['e', 2],
        ['l', 3],
        ['o', 4],
      ]),
      hasLigatures: false,
      codeSpaceBytes: 2,
    },
    metrics: {
      defaultWidthPt: 0.5,
      widths: new Map([
        [1, 0.6], // H
        [2, 0.5], // e
        [3, 0.25], // l
        [4, 0.5], // o
      ]),
      unitsPerEm: 1000,
    },
  };

  const mockSimpleFont: PdfFontMetadata = {
    resourceName: '/F2',
    baseFont: 'Helvetica',
    cleanFontFamily: 'Helvetica',
    isSubset: false,
    subtype: 'TrueType',
    encodingType: 'WinAnsi',
    cMap: null,
    metrics: {
      defaultWidthPt: 0.5,
      widths: new Map([
        [65, 0.667], // 'A'
        [66, 0.722], // 'B'
      ]),
      unitsPerEm: 1000,
    },
  };

  it('encodes empty string gracefully', () => {
    const res = encodeTextForFont('', mockCompositeFont, 12);
    expect(res.status).toBe('encodable');
    if (res.status === 'encodable') {
      expect(res.encodedBytes.length).toBe(0);
      expect(res.hexString).toBe('');
      expect(res.advanceWidthPt).toBe(0);
    }
  });

  describe('with CMap composite font', () => {
    it('encodes valid characters into 2-byte CID hex and computes advances', () => {
      const res = encodeTextForFont('Hello', mockCompositeFont, 10);
      expect(res.status).toBe('encodable');
      if (res.status === 'encodable') {
        expect(res.isTwoByteCid).toBe(true);
        // H=1, e=2, l=3, l=3, o=4
        expect(res.hexString).toBe('00010002000300030004');
        expect(res.encodedBytes).toEqual(
          new Uint8Array([0, 1, 0, 2, 0, 3, 0, 3, 0, 4]),
        );
        // Total advance: (0.6 + 0.5 + 0.25 + 0.25 + 0.5) * 10 = 2.1 * 10 = 21pt
        expect(res.advanceWidthPt).toBeCloseTo(21);
      }
    });

    it('detects missing glyphs when text contains characters outside the subset', () => {
      const res = encodeTextForFont('Help!', mockCompositeFont, 10);
      expect(res.status).toBe('missing-glyphs');
      if (res.status === 'missing-glyphs') {
        expect(res.missingCharacters).toEqual(['p', '!']);
        expect(res.availableCharacters).toContain('H');
        expect(res.availableCharacters).toContain('e');
        expect(res.availableCharacters).toContain('l');
        expect(res.availableCharacters).toContain('o');
      }
    });

    it('matches multi-character ligatures when individual characters are absent', () => {
      const fontWithLigature: PdfFontMetadata = {
        resourceName: '/F3',
        baseFont: 'BAAAAA+Calibri',
        cleanFontFamily: 'Calibri',
        isSubset: true,
        subtype: 'Type0',
        encodingType: 'Identity-H',
        cMap: {
          cidToUnicode: new Map([
            [1, 'p'],
            [2, 'r'],
            [3, 'o'],
            [4, 'fi'], // ligature only, no isolated 'f' or 'i'
            [5, 'l'],
            [6, 'e'],
          ]),
          unicodeToCid: new Map([
            ['p', 1],
            ['r', 2],
            ['o', 3],
            ['fi', 4],
            ['l', 5],
            ['e', 6],
          ]),
          hasLigatures: true,
          codeSpaceBytes: 2,
        },
        metrics: {
          defaultWidthPt: 0.5,
          widths: new Map([
            [1, 0.5],
            [2, 0.5],
            [3, 0.5],
            [4, 0.8], // 'fi' ligature width
            [5, 0.3],
            [6, 0.5],
          ]),
          unitsPerEm: 1000,
        },
      };

      const res = encodeTextForFont('profile', fontWithLigature, 10);
      expect(res.status).toBe('encodable');
      if (res.status === 'encodable') {
        expect(res.hexString).toBe('000100020003000400050006');
        // Total: (0.5 + 0.5 + 0.5 + 0.8 + 0.3 + 0.5) * 10 = 3.1 * 10 = 31pt
        expect(res.advanceWidthPt).toBeCloseTo(31);
      }
    });

    it('preserves surrogate pairs and astral Unicode characters without splitting', () => {
      const fontWithAstral: PdfFontMetadata = {
        resourceName: '/F4',
        baseFont: 'MathSymbolFont',
        cleanFontFamily: 'MathSymbolFont',
        isSubset: true,
        subtype: 'Type0',
        encodingType: 'Identity-H',
        cMap: {
          cidToUnicode: new Map([[100, '🚀']]),
          unicodeToCid: new Map([['🚀', 100]]),
          hasLigatures: true,
          codeSpaceBytes: 2,
        },
        metrics: {
          defaultWidthPt: 0.5,
          widths: new Map([[100, 1.0]]),
          unitsPerEm: 1000,
        },
      };

      const res = encodeTextForFont('🚀', fontWithAstral, 12);
      expect(res.status).toBe('encodable');
      if (res.status === 'encodable') {
        expect(res.hexString).toBe('0064');
        expect(res.advanceWidthPt).toBeCloseTo(12);
      }
    });
  });

  describe('with simple font (WinAnsi)', () => {
    it('encodes ASCII text into 1-byte hex and computes advances', () => {
      const res = encodeTextForFont('AB', mockSimpleFont, 12);
      expect(res.status).toBe('encodable');
      if (res.status === 'encodable') {
        expect(res.isTwoByteCid).toBe(false);
        expect(res.hexString).toBe('4142');
        expect(res.encodedBytes).toEqual(new Uint8Array([0x41, 0x42]));
        // (0.667 + 0.722) * 12 = 1.389 * 12 = 16.668
        expect(res.advanceWidthPt).toBeCloseTo(16.668);
      }
    });

    it('rejects characters outside printable ASCII in simple font mode', () => {
      const res = encodeTextForFont('A\u00A9', mockSimpleFont, 12);
      expect(res.status).toBe('missing-glyphs');
      if (res.status === 'missing-glyphs') {
        expect(res.missingCharacters).toContain('\u00A9');
      }
    });
  });
});
