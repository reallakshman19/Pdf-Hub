import { describe, expect, it } from 'vitest';
import {
  cleanFontFamilyName,
  inspectPdfFont,
  parseCidWidthsArray,
  parseSimpleWidthsArray,
} from '../fontInspector';

describe('fontInspector', () => {
  describe('cleanFontFamilyName', () => {
    it('strips 6-character subset tags and detects subsetted fonts', () => {
      const res1 = cleanFontFamilyName('/ABCDEE+Calibri');
      expect(res1.cleanFamily).toBe('Calibri');
      expect(res1.isSubset).toBe(true);

      const res2 = cleanFontFamilyName('BCDFGH+Arial-BoldMT');
      expect(res2.cleanFamily).toBe('Arial');
      expect(res2.isSubset).toBe(true);
    });

    it('identifies standard fonts without subset tags', () => {
      const res1 = cleanFontFamilyName('/Helvetica');
      expect(res1.cleanFamily).toBe('Helvetica');
      expect(res1.isSubset).toBe(false);

      const res2 = cleanFontFamilyName('TimesNewRoman,Italic');
      expect(res2.cleanFamily).toBe('TimesNewRoman');
      expect(res2.isSubset).toBe(false);
    });

    it('unescapes #xx hex representations in font family names', () => {
      const res1 = cleanFontFamilyName('/ABCDEE+Times#20New#20Roman-Bold');
      expect(res1.cleanFamily).toBe('Times New Roman');
      expect(res1.isSubset).toBe(true);

      const res2 = cleanFontFamilyName('/My#20Custom#20Font');
      expect(res2.cleanFamily).toBe('My Custom Font');
      expect(res2.isSubset).toBe(false);
    });
  });

  describe('parseCidWidthsArray', () => {
    it('parses Format 1: c [ w1 w2 ... ]', () => {
      const cidW = [1, [500, 600, 700], 10, [250]];
      const widths = parseCidWidthsArray(cidW);

      expect(widths.get(1)).toBe(500);
      expect(widths.get(2)).toBe(600);
      expect(widths.get(3)).toBe(700);
      expect(widths.get(10)).toBe(250);
      expect(widths.has(4)).toBe(false);
    });

    it('parses Format 2: c_first c_last w and guards against invalid/overflow ranges', () => {
      const cidW = [20, 23, 850, 50, 40, 900, 100, 70000, 500]; // 50,40 is inverted; 100,70000 exceeds 16-bit
      const widths = parseCidWidthsArray(cidW);

      expect(widths.get(20)).toBe(850);
      expect(widths.get(21)).toBe(850);
      expect(widths.get(22)).toBe(850);
      expect(widths.get(23)).toBe(850);
      expect(widths.has(24)).toBe(false);
      // Inverted range and overflow range ignored
      expect(widths.has(50)).toBe(false);
      expect(widths.has(100)).toBe(false);
    });

    it('parses mixed Format 1 and Format 2', () => {
      const cidW = [1, [500], 10, 12, 600];
      const widths = parseCidWidthsArray(cidW);

      expect(widths.get(1)).toBe(500);
      expect(widths.get(10)).toBe(600);
      expect(widths.get(11)).toBe(600);
      expect(widths.get(12)).toBe(600);
    });
  });

  describe('parseSimpleWidthsArray', () => {
    it('maps character codes to widths given firstChar and lastChar', () => {
      const widths = parseSimpleWidthsArray(32, 34, [250, 333, 400]);
      expect(widths.get(32)).toBe(250);
      expect(widths.get(33)).toBe(333);
      expect(widths.get(34)).toBe(400);
      expect(widths.has(35)).toBe(false);
    });
  });

  describe('inspectPdfFont', () => {
    it('inspects a simple TrueType font with standard encoding and widths', () => {
      const font = inspectPdfFont({
        resourceName: '/F1',
        subtype: '/TrueType',
        baseFont: '/Helvetica',
        encoding: '/WinAnsiEncoding',
        firstChar: 65,
        lastChar: 66,
        widths: [667, 722],
        defaultWidth: 500,
        descriptor: {
          fontName: 'Helvetica',
          flags: 32,
          ascent: 718,
          descent: -207,
          capHeight: 718,
        },
      });

      expect(font.resourceName).toBe('/F1');
      expect(font.cleanFontFamily).toBe('Helvetica');
      expect(font.isSubset).toBe(false);
      expect(font.subtype).toBe('TrueType');
      expect(font.encodingType).toBe('WinAnsi');
      expect(font.cMap).toBeNull();

      expect(font.metrics.widths.get(65)).toBeCloseTo(0.667);
      expect(font.metrics.widths.get(66)).toBeCloseTo(0.722);
      expect(font.metrics.defaultWidthPt).toBeCloseTo(0.5);
      expect(font.metrics.ascentPt).toBeCloseTo(0.718);
      expect(font.metrics.descentPt).toBeCloseTo(-0.207);
    });

    it('inspects a composite Type0 font with descendant CIDFont and /ToUnicode stream', () => {
      const cmapStr = `
        begincmap
        1 begincodespacerange
        <0000> <FFFF>
        endcodespacerange
        1 beginbfchar
        <0001> <0048>
        endbfchar
        endcmap
      `;
      const toUnicodeBytes = new TextEncoder().encode(cmapStr);

      const font = inspectPdfFont({
        resourceName: '/F2',
        subtype: '/Type0',
        baseFont: '/BAAAAA+MyriadPro-Regular',
        encoding: '/Identity-H',
        toUnicodeBytes,
        descendantFont: {
          subtype: '/CIDFontType2',
          baseFont: '/BAAAAA+MyriadPro-Regular',
          defaultWidth: 1000,
          cidW: [1, [550]],
          descriptor: {
            fontName: 'BAAAAA+MyriadPro-Regular',
            flags: 4,
            ascent: 750,
            descent: -250,
          },
        },
      });

      expect(font.cleanFontFamily).toBe('MyriadPro');
      expect(font.isSubset).toBe(true);
      expect(font.subtype).toBe('Type0');
      expect(font.encodingType).toBe('Identity-H');
      expect(font.cMap).not.toBeNull();
      expect(font.cMap?.cidToUnicode.get(1)).toBe('H');
      expect(font.cMap?.unicodeToCid.get('H')).toBe(1);
      expect(font.metrics.widths.get(1)).toBeCloseTo(0.55);
    });
  });
});
