import { describe, expect, it } from 'vitest';
import { decodeUtf16Hex, parseToUnicodeCMap } from '../cMapParser';

describe('cMapParser', () => {
  it('decodes UTF-16 hex strings correctly including ligatures', () => {
    expect(decodeUtf16Hex('0041')).toBe('A');
    expect(decodeUtf16Hex('00480065006C006C006F')).toBe('Hello');
    expect(decodeUtf16Hex('00660069')).toBe('fi'); // ligature
    expect(decodeUtf16Hex('41')).toBe('A'); // 2-char fallback
  });

  it('parses codespacerange to determine CID byte width', () => {
    const cmapTwoByte = `
      /CIDInit /ProcSet findresource begin
      12 dict begin
      begincmap
      /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
      1 begincodespacerange
      <0000> <FFFF>
      endcodespacerange
      endcmap
    `;
    const result2 = parseToUnicodeCMap(cmapTwoByte);
    expect(result2.codeSpaceBytes).toBe(2);

    const cmapOneByte = `
      begincmap
      1 begincodespacerange
      <00> <FF>
      endcodespacerange
      endcmap
    `;
    const result1 = parseToUnicodeCMap(cmapOneByte);
    expect(result1.codeSpaceBytes).toBe(1);
  });

  it('parses beginbfchar blocks with standard characters and ligatures', () => {
    const cmap = `
      begincmap
      3 beginbfchar
      <0001> <0041>
      <0002> <0042>
      <0035> <00660069>
      endbfchar
      endcmap
    `;

    const parsed = parseToUnicodeCMap(cmap);
    expect(parsed.cidToUnicode.get(1)).toBe('A');
    expect(parsed.cidToUnicode.get(2)).toBe('B');
    expect(parsed.cidToUnicode.get(0x35)).toBe('fi');
    expect(parsed.hasLigatures).toBe(true);

    // Bidirectional
    expect(parsed.unicodeToCid.get('A')).toBe(1);
    expect(parsed.unicodeToCid.get('B')).toBe(2);
    expect(parsed.unicodeToCid.get('fi')).toBe(0x35);
  });

  it('parses beginbfrange contiguous format (<srcLo> <srcHi> <dstLo>)', () => {
    const cmap = `
      begincmap
      1 beginbfrange
      <0001> <0004> <0041>
      endbfrange
      endcmap
    `;

    const parsed = parseToUnicodeCMap(cmap);
    expect(parsed.cidToUnicode.get(1)).toBe('A');
    expect(parsed.cidToUnicode.get(2)).toBe('B');
    expect(parsed.cidToUnicode.get(3)).toBe('C');
    expect(parsed.cidToUnicode.get(4)).toBe('D');
    expect(parsed.cidToUnicode.has(5)).toBe(false);

    expect(parsed.unicodeToCid.get('A')).toBe(1);
    expect(parsed.unicodeToCid.get('D')).toBe(4);
  });

  it('parses beginbfrange array format (<srcLo> <srcHi> [ <dst1> <dst2> ... ])', () => {
    const cmap = `
      begincmap
      1 beginbfrange
      <0010> <0012> [ <0058> <0059> <0066006C> ]
      endbfrange
      endcmap
    `;

    const parsed = parseToUnicodeCMap(cmap);
    expect(parsed.cidToUnicode.get(0x10)).toBe('X');
    expect(parsed.cidToUnicode.get(0x11)).toBe('Y');
    expect(parsed.cidToUnicode.get(0x12)).toBe('fl'); // ligature
    expect(parsed.hasLigatures).toBe(true);

    expect(parsed.unicodeToCid.get('X')).toBe(0x10);
    expect(parsed.unicodeToCid.get('Y')).toBe(0x11);
    expect(parsed.unicodeToCid.get('fl')).toBe(0x12);
  });

  it('handles a realistic full PDF /ToUnicode stream', () => {
    const realisticCMap = `
      /CIDInit /ProcSet findresource begin
      12 dict begin
      begincmap
      /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
      /CMapName /Custom-ToUnicode def
      /CMapType 2 def
      1 begincodespacerange
      <0000> <FFFF>
      endcodespacerange
      2 beginbfrange
      <0001> <0003> <0031>
      <0004> <0006> [ <0061> <0062> <0063> ]
      endbfrange
      2 beginbfchar
      <0007> <0020>
      <0008> <002E>
      endbfchar
      endcmap
      CMapName currentdict /CMap defineresource pop
      end
      end
    `;

    const parsed = parseToUnicodeCMap(realisticCMap);
    expect(parsed.codeSpaceBytes).toBe(2);
    expect(parsed.cidToUnicode.get(1)).toBe('1');
    expect(parsed.cidToUnicode.get(2)).toBe('2');
    expect(parsed.cidToUnicode.get(3)).toBe('3');
    expect(parsed.cidToUnicode.get(4)).toBe('a');
    expect(parsed.cidToUnicode.get(5)).toBe('b');
    expect(parsed.cidToUnicode.get(6)).toBe('c');
    expect(parsed.cidToUnicode.get(7)).toBe(' ');
    expect(parsed.cidToUnicode.get(8)).toBe('.');

    expect(parsed.unicodeToCid.get('1')).toBe(1);
    expect(parsed.unicodeToCid.get('b')).toBe(5);
    expect(parsed.unicodeToCid.get(' ')).toBe(7);
  });

  it('ignores PostScript comments and handles interior whitespace in hex tokens', () => {
    const cmapWithComments = `
      %!PS-Adobe-3.0 Resource-CMap
      % 1 beginbfchar
      % <0099> <005A>
      % endbfchar
      begincmap
      1 begincodespacerange
      < 0000 > < FFFF >
      endcodespacerange
      1 beginbfchar
      < 0001 > < 0041 > % mapping to A
      endbfchar
      1 beginbfrange
      <0002> <0004> < 0042 >
      endbfrange
      endcmap
    `;

    const parsed = parseToUnicodeCMap(cmapWithComments);
    // Commented out 0x99 must NOT be parsed
    expect(parsed.cidToUnicode.has(0x99)).toBe(false);
    // Whitespace in hex tokens parsed cleanly
    expect(parsed.cidToUnicode.get(1)).toBe('A');
    expect(parsed.cidToUnicode.get(2)).toBe('B');
    expect(parsed.cidToUnicode.get(3)).toBe('C');
    expect(parsed.cidToUnicode.get(4)).toBe('D');
  });
});
