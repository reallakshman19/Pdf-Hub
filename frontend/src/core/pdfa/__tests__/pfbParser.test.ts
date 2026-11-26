import { describe, expect, it } from 'vitest';
import { loadArchivalFontAsset, type ArchivalFontAssetKey } from '../assets/archivalFontBundle';
import {
  buildSingleByteToUnicodeCMap,
  inspectType1FontProgram,
  parsePfbBinary,
} from '../pfbParser';

describe('pfbParser and archivalFontBundle', () => {
  it('classifies staged BSD-3 Foxit Type1C font programs cleanly', () => {
    const keys: ArchivalFontAssetKey[] = [
      'serifRegular',
      'serifBold',
      'serifItalic',
      'serifBoldItalic',
      'fixedRegular',
      'fixedBold',
      'fixedItalic',
      'fixedBoldItalic',
      'symbol',
      'dingbats',
    ];

    for (const key of keys) {
      const data = loadArchivalFontAsset(key);
      const spec = inspectType1FontProgram(data);
      expect(spec.kind).toBe('type1c');
      if (spec.kind === 'type1c') {
        expect(spec.streamBytes.length).toBeGreaterThan(10_000);
        expect(spec.fontName.length).toBeGreaterThan(0);
      }
    }
  });

  it('parses classic Adobe PFB binary segments with accurate Length1/Length2/Length3', () => {
    const header = new TextEncoder().encode('%!PS-AdobeFont-1.0: DemoType1 1.0\n/FontName /DemoType1 def\n');
    const eexec = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    const trailer = new TextEncoder().encode('00000000\ncleartomark\n');

    const pfb = new Uint8Array(6 + header.length + 6 + eexec.length + 6 + trailer.length + 2);
    const writeSeg = (offset: number, type: number, chunk: Uint8Array): number => {
      pfb[offset] = 0x80;
      pfb[offset + 1] = type;
      pfb[offset + 2] = chunk.length & 0xff;
      pfb[offset + 3] = (chunk.length >>> 8) & 0xff;
      pfb[offset + 4] = (chunk.length >>> 16) & 0xff;
      pfb[offset + 5] = (chunk.length >>> 24) & 0xff;
      pfb.set(chunk, offset + 6);
      return offset + 6 + chunk.length;
    };

    let cursor = writeSeg(0, 1, header);
    cursor = writeSeg(cursor, 2, eexec);
    cursor = writeSeg(cursor, 1, trailer);
    pfb[cursor] = 0x80;
    pfb[cursor + 1] = 3;

    const parsed = parsePfbBinary(pfb);
    expect(parsed.fontName).toBe('DemoType1');
    expect(parsed.length1).toBe(header.length);
    expect(parsed.length2).toBe(eexec.length);
    expect(parsed.length3).toBe(trailer.length);
    expect(parsed.streamBytes.length).toBe(header.length + eexec.length + trailer.length);
  });

  it('loads all 4 OFL LiberationSans TTF binaries with valid sfnt header', () => {
    const sansKeys: ArchivalFontAssetKey[] = [
      'sansRegular',
      'sansBold',
      'sansItalic',
      'sansBoldItalic',
    ];
    for (const key of sansKeys) {
      const ttf = loadArchivalFontAsset(key);
      expect(ttf[0]).toBe(0x00);
      expect(ttf[1]).toBe(0x01);
      expect(ttf[2]).toBe(0x00);
      expect(ttf[3]).toBe(0x00);
      expect(ttf.length).toBeGreaterThan(100_000);
    }
  });

  it('builds <=100-entry bfchar chunks in single-byte ToUnicode CMaps', () => {
    const cmap = new TextDecoder().decode(buildSingleByteToUnicodeCMap('WinAnsiEncoding'));
    expect(cmap).toContain('begincodespacerange');
    expect(cmap).toContain('<00> <FF>');
    expect(cmap).toContain('100 beginbfchar');
    expect(cmap).toContain('<80> <20AC>');
    expect(cmap).toContain('endcmap');
  });
});
