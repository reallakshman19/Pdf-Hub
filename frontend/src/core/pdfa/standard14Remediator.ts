/**
 * Standard-14 & External Unembedded Font Classifier and In-Place Remediator.
 *
 * Replaces unembedded PDF Type1/TrueType font dictionaries referencing
 * Standard-14 names (Helvetica, Times, Courier, Symbol, ZapfDingbats) with
 * metric-compatible embedded TrueType (`/FontFile2` from OFL Liberation Sans)
 * or Type 1 (`/FontFile` from BSD-3 Foxit PFB) font programs, single-byte
 * advance `/Widths`, and `/ToUnicode` CMaps without modifying existing page
 * content streams.
 */

import { pdfLib } from '@/core/pdf/lazyPdfLib';
import type { ArchivalFontAssetKey } from './assets/archivalFontBundle';
import { buildSingleByteToUnicodeCMap, inspectType1FontProgram } from './pfbParser';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFDocumentT = import('pdf-lib').PDFDocument;
type PDFDictT = import('pdf-lib').PDFDict;
type PDFObjectT = import('pdf-lib').PDFObject;

export interface Standard14Mapping {
  readonly canonicalName: string;
  readonly assetKey: ArchivalFontAssetKey;
  readonly kind: 'ttf' | 'pfb';
  readonly standardFontKey: keyof PdfLibNs['StandardFonts'];
  readonly flags: number;
  readonly italicAngle: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly stemV: number;
  readonly fontBBox: readonly [number, number, number, number];
  readonly fixedWidth?: number;
  readonly defaultEncoding: 'WinAnsiEncoding' | 'Symbol' | 'ZapfDingbats';
  readonly embeddedBaseFontName: string;
}

const HELVETICA_BBOX = [-166, -225, 1000, 931] as const;
const TIMES_BBOX = [-168, -218, 1000, 898] as const;
const COURIER_BBOX = [-23, -250, 715, 805] as const;

const STANDARD_14_SPECS: Record<string, Standard14Mapping> = {
  Helvetica: {
    canonicalName: 'Helvetica',
    assetKey: 'sansRegular',
    kind: 'ttf',
    standardFontKey: 'Helvetica',
    flags: 32, // Nonsymbolic
    italicAngle: 0,
    ascent: 718,
    descent: -207,
    capHeight: 718,
    stemV: 88,
    fontBBox: HELVETICA_BBOX,
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'LiberationSans',
  },
  'Helvetica-Bold': {
    canonicalName: 'Helvetica-Bold',
    assetKey: 'sansBold',
    kind: 'ttf',
    standardFontKey: 'HelveticaBold',
    flags: 32,
    italicAngle: 0,
    ascent: 718,
    descent: -207,
    capHeight: 718,
    stemV: 140,
    fontBBox: [-170, -228, 1003, 962],
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'LiberationSans-Bold',
  },
  'Helvetica-Oblique': {
    canonicalName: 'Helvetica-Oblique',
    assetKey: 'sansItalic',
    kind: 'ttf',
    standardFontKey: 'HelveticaOblique',
    flags: 96, // Nonsymbolic (32) + Italic (64)
    italicAngle: -12,
    ascent: 718,
    descent: -207,
    capHeight: 718,
    stemV: 88,
    fontBBox: [-170, -225, 1116, 931],
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'LiberationSans-Italic',
  },
  'Helvetica-BoldOblique': {
    canonicalName: 'Helvetica-BoldOblique',
    assetKey: 'sansBoldItalic',
    kind: 'ttf',
    standardFontKey: 'HelveticaBoldOblique',
    flags: 96,
    italicAngle: -12,
    ascent: 718,
    descent: -207,
    capHeight: 718,
    stemV: 140,
    fontBBox: [-174, -228, 1114, 962],
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'LiberationSans-BoldItalic',
  },
  'Times-Roman': {
    canonicalName: 'Times-Roman',
    assetKey: 'serifRegular',
    kind: 'pfb',
    standardFontKey: 'TimesRoman',
    flags: 34, // Serif (2) + Nonsymbolic (32)
    italicAngle: 0,
    ascent: 683,
    descent: -217,
    capHeight: 662,
    stemV: 84,
    fontBBox: TIMES_BBOX,
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'FoxitSerif',
  },
  'Times-Bold': {
    canonicalName: 'Times-Bold',
    assetKey: 'serifBold',
    kind: 'pfb',
    standardFontKey: 'TimesRomanBold',
    flags: 34,
    italicAngle: 0,
    ascent: 683,
    descent: -217,
    capHeight: 676,
    stemV: 132,
    fontBBox: [-168, -218, 1000, 935],
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'FoxitSerif-Bold',
  },
  'Times-Italic': {
    canonicalName: 'Times-Italic',
    assetKey: 'serifItalic',
    kind: 'pfb',
    standardFontKey: 'TimesRomanItalic',
    flags: 98, // Serif (2) + Nonsymbolic (32) + Italic (64)
    italicAngle: -15.5,
    ascent: 683,
    descent: -217,
    capHeight: 653,
    stemV: 76,
    fontBBox: [-169, -217, 1010, 883],
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'FoxitSerif-Italic',
  },
  'Times-BoldItalic': {
    canonicalName: 'Times-BoldItalic',
    assetKey: 'serifBoldItalic',
    kind: 'pfb',
    standardFontKey: 'TimesRomanBoldItalic',
    flags: 98,
    italicAngle: -15,
    ascent: 683,
    descent: -217,
    capHeight: 669,
    stemV: 120,
    fontBBox: [-200, -218, 996, 921],
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'FoxitSerif-BoldItalic',
  },
  Courier: {
    canonicalName: 'Courier',
    assetKey: 'fixedRegular',
    kind: 'pfb',
    standardFontKey: 'Courier',
    flags: 33, // FixedPitch (1) + Nonsymbolic (32)
    italicAngle: 0,
    ascent: 629,
    descent: -157,
    capHeight: 562,
    stemV: 51,
    fontBBox: COURIER_BBOX,
    fixedWidth: 600,
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'FoxitFixed',
  },
  'Courier-Bold': {
    canonicalName: 'Courier-Bold',
    assetKey: 'fixedBold',
    kind: 'pfb',
    standardFontKey: 'CourierBold',
    flags: 33,
    italicAngle: 0,
    ascent: 629,
    descent: -157,
    capHeight: 562,
    stemV: 106,
    fontBBox: [-113, -250, 749, 801],
    fixedWidth: 600,
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'FoxitFixed-Bold',
  },
  'Courier-Oblique': {
    canonicalName: 'Courier-Oblique',
    assetKey: 'fixedItalic',
    kind: 'pfb',
    standardFontKey: 'CourierOblique',
    flags: 97, // FixedPitch (1) + Nonsymbolic (32) + Italic (64)
    italicAngle: -12,
    ascent: 629,
    descent: -157,
    capHeight: 562,
    stemV: 51,
    fontBBox: [-27, -250, 849, 805],
    fixedWidth: 600,
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'FoxitFixed-Italic',
  },
  'Courier-BoldOblique': {
    canonicalName: 'Courier-BoldOblique',
    assetKey: 'fixedBoldItalic',
    kind: 'pfb',
    standardFontKey: 'CourierBoldOblique',
    flags: 97,
    italicAngle: -12,
    ascent: 629,
    descent: -157,
    capHeight: 562,
    stemV: 106,
    fontBBox: [-57, -250, 869, 801],
    fixedWidth: 600,
    defaultEncoding: 'WinAnsiEncoding',
    embeddedBaseFontName: 'FoxitFixed-BoldItalic',
  },
  Symbol: {
    canonicalName: 'Symbol',
    assetKey: 'symbol',
    kind: 'pfb',
    standardFontKey: 'Symbol',
    flags: 4, // Symbolic
    italicAngle: 0,
    ascent: 1010,
    descent: -293,
    capHeight: 673,
    stemV: 85,
    fontBBox: [-180, -293, 1090, 1010],
    defaultEncoding: 'Symbol',
    embeddedBaseFontName: 'FoxitSymbol',
  },
  ZapfDingbats: {
    canonicalName: 'ZapfDingbats',
    assetKey: 'dingbats',
    kind: 'pfb',
    standardFontKey: 'ZapfDingbats',
    flags: 4, // Symbolic
    italicAngle: 0,
    ascent: 820,
    descent: -143,
    capHeight: 705,
    stemV: 90,
    fontBBox: [-1, -143, 981, 820],
    defaultEncoding: 'ZapfDingbats',
    embeddedBaseFontName: 'FoxitDingbats',
  },
};

const STANDARD_14_ALIASES: Record<string, string> = {
  Helvetica: 'Helvetica',
  'Helvetica-Bold': 'Helvetica-Bold',
  HelveticaBold: 'Helvetica-Bold',
  'Helvetica-Oblique': 'Helvetica-Oblique',
  HelveticaOblique: 'Helvetica-Oblique',
  'Helvetica-Italic': 'Helvetica-Oblique',
  'Helvetica-BoldOblique': 'Helvetica-BoldOblique',
  HelveticaBoldOblique: 'Helvetica-BoldOblique',
  'Helvetica-BoldItalic': 'Helvetica-BoldOblique',
  Times: 'Times-Roman',
  'Times-Roman': 'Times-Roman',
  TimesRoman: 'Times-Roman',
  'Times-Bold': 'Times-Bold',
  TimesBold: 'Times-Bold',
  'Times-Italic': 'Times-Italic',
  TimesItalic: 'Times-Italic',
  'Times-BoldItalic': 'Times-BoldItalic',
  TimesBoldItalic: 'Times-BoldItalic',
  Courier: 'Courier',
  'Courier-Bold': 'Courier-Bold',
  CourierBold: 'Courier-Bold',
  'Courier-Oblique': 'Courier-Oblique',
  CourierOblique: 'Courier-Oblique',
  'Courier-Italic': 'Courier-Oblique',
  'Courier-BoldOblique': 'Courier-BoldOblique',
  CourierBoldOblique: 'Courier-BoldOblique',
  'Courier-BoldItalic': 'Courier-BoldOblique',
  Symbol: 'Symbol',
  ZapfDingbats: 'ZapfDingbats',
};

function stripPdfFontName(raw: string): string {
  return raw.replace(/^\//, '').replace(/^[A-Z]{6}\+/, '').trim();
}

export function resolveStandard14Spec(baseFont: string): Standard14Mapping | null {
  const cleaned = stripPdfFontName(baseFont);
  const canonical = STANDARD_14_ALIASES[cleaned];
  return canonical ? STANDARD_14_SPECS[canonical] : null;
}

export function resolveExternalFallbackSpec(baseFont: string): Standard14Mapping {
  const lower = stripPdfFontName(baseFont).toLowerCase();
  const bold = /bold|black|heavy|demi|semibold/.test(lower);
  const italic = /italic|oblique|slant/.test(lower);

  if (/courier|mono|consolas|menlo|fixed/.test(lower)) {
    if (bold && italic) return STANDARD_14_SPECS['Courier-BoldOblique'];
    if (bold) return STANDARD_14_SPECS['Courier-Bold'];
    if (italic) return STANDARD_14_SPECS['Courier-Oblique'];
    return STANDARD_14_SPECS.Courier;
  }

  if (/times|serif|georgia|garamond|cambria|palatino/.test(lower)) {
    if (bold && italic) return STANDARD_14_SPECS['Times-BoldItalic'];
    if (bold) return STANDARD_14_SPECS['Times-Bold'];
    if (italic) return STANDARD_14_SPECS['Times-Italic'];
    return STANDARD_14_SPECS['Times-Roman'];
  }

  if (bold && italic) return STANDARD_14_SPECS['Helvetica-BoldOblique'];
  if (bold) return STANDARD_14_SPECS['Helvetica-Bold'];
  if (italic) return STANDARD_14_SPECS['Helvetica-Oblique'];
  return STANDARD_14_SPECS.Helvetica;
}

// WinAnsi 0x80..0x9F Unicode points for matching single-byte measurement via pdf-lib.
const WINANSI_EXTENDED_CHARS: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d,
  0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

async function computeSingleByteWidths(
  spec: Standard14Mapping,
  lib: PdfLibNs,
): Promise<number[]> {
  if (typeof spec.fixedWidth === 'number') {
    return Array.from({ length: 224 }, () => spec.fixedWidth!);
  }

  const scratchDoc = await lib.PDFDocument.create();
  const stdFont = scratchDoc.embedStandardFont(lib.StandardFonts[spec.standardFontKey]);
  const widths: number[] = [];

  for (let code = 32; code <= 255; code += 1) {
    let charCode = code;
    if (spec.defaultEncoding === 'WinAnsiEncoding' && code >= 0x80 && code <= 0x9f) {
      charCode = WINANSI_EXTENDED_CHARS[code] ?? 0x20;
    }
    try {
      const w = stdFont.widthOfTextAtSize(String.fromCharCode(charCode), 1000);
      widths.push(Math.round(Number.isFinite(w) ? w : 500));
    } catch {
      widths.push(500);
    }
  }
  return widths;
}

export interface FontRemediatorContext {
  doc: PDFDocumentT;
  lib: PdfLibNs;
  loadAsset: (key: ArchivalFontAssetKey) => Promise<Uint8Array> | Uint8Array;
  embeddedPrograms: Map<ArchivalFontAssetKey, { streamRef: import('pdf-lib').PDFRef; fontFileKey: 'FontFile' | 'FontFile2' | 'FontFile3' }>;
  cachedWidths: Map<string, number[]>;
  cachedToUnicode: Map<string, import('pdf-lib').PDFRef>;
}

export async function createFontRemediatorContext(
  doc: PDFDocumentT,
  lib: PdfLibNs,
): Promise<FontRemediatorContext> {
  const { loadArchivalFontAsset } = await import('./assets/archivalFontBundle');
  return {
    doc,
    lib,
    loadAsset: (key) => loadArchivalFontAsset(key),
    embeddedPrograms: new Map(),
    cachedWidths: new Map(),
    cachedToUnicode: new Map(),
  };
}

function getOrEmbedProgram(
  ctx: FontRemediatorContext,
  spec: Standard14Mapping,
): Promise<{ streamRef: import('pdf-lib').PDFRef; fontFileKey: 'FontFile' | 'FontFile2' | 'FontFile3' }>
  | { streamRef: import('pdf-lib').PDFRef; fontFileKey: 'FontFile' | 'FontFile2' | 'FontFile3' } {
  const existing = ctx.embeddedPrograms.get(spec.assetKey);
  if (existing) return existing;

  return Promise.resolve(ctx.loadAsset(spec.assetKey)).then((rawBytes) => {
    const stillExisting = ctx.embeddedPrograms.get(spec.assetKey);
    if (stillExisting) return stillExisting;

    let entry: { streamRef: import('pdf-lib').PDFRef; fontFileKey: 'FontFile' | 'FontFile2' | 'FontFile3' };
    if (spec.kind === 'ttf') {
      const safeBytes = rawBytes instanceof Uint8Array ? rawBytes : Uint8Array.from(rawBytes);
      const stream = ctx.doc.context.flateStream(safeBytes, {
        Length1: safeBytes.length,
      });
      entry = {
        streamRef: ctx.doc.context.register(stream),
        fontFileKey: 'FontFile2',
      };
    } else {
      const parsedProgram = inspectType1FontProgram(rawBytes);
      if (parsedProgram.kind === 'type1c') {
        const safeBytes = parsedProgram.streamBytes instanceof Uint8Array
          ? parsedProgram.streamBytes
          : Uint8Array.from(parsedProgram.streamBytes);
        const stream = ctx.doc.context.flateStream(safeBytes, {
          Subtype: 'Type1C',
        });
        entry = {
          streamRef: ctx.doc.context.register(stream),
          fontFileKey: 'FontFile3',
        };
      } else {
        const { parsed } = parsedProgram;
        const safeBytes = parsed.streamBytes instanceof Uint8Array
          ? parsed.streamBytes
          : Uint8Array.from(parsed.streamBytes);
        const stream = ctx.doc.context.flateStream(safeBytes, {
          Length1: parsed.length1,
          Length2: parsed.length2,
          Length3: parsed.length3,
        });
        entry = {
          streamRef: ctx.doc.context.register(stream),
          fontFileKey: 'FontFile',
        };
      }
    }

    ctx.embeddedPrograms.set(spec.assetKey, entry);
    return entry;
  });
}

function getOrEmbedToUnicode(
  ctx: FontRemediatorContext,
  encoding: 'WinAnsiEncoding' | 'StandardEncoding' | 'MacRomanEncoding' | 'Symbol' | 'ZapfDingbats',
): import('pdf-lib').PDFRef {
  const existing = ctx.cachedToUnicode.get(encoding);
  if (existing) return existing;
  const cmapBytes = buildSingleByteToUnicodeCMap(encoding);
  const stream = ctx.doc.context.flateStream(cmapBytes);
  const ref = ctx.doc.context.register(stream);
  ctx.cachedToUnicode.set(encoding, ref);
  return ref;
}

function detectEncodingChoice(
  fontDict: PDFDictT,
  spec: Standard14Mapping,
  lib: PdfLibNs,
): 'WinAnsiEncoding' | 'StandardEncoding' | 'MacRomanEncoding' | 'Symbol' | 'ZapfDingbats' {
  const enc = fontDict.lookup(lib.PDFName.of('Encoding'));
  if (enc instanceof lib.PDFName) {
    const text = enc.decodeText();
    if (text === 'MacRomanEncoding') return 'MacRomanEncoding';
    if (text === 'StandardEncoding') return 'StandardEncoding';
    if (text === 'WinAnsiEncoding') return 'WinAnsiEncoding';
  }
  return spec.defaultEncoding;
}

/**
 * Remediates a single font dictionary in place when unembedded or missing `/ToUnicode`.
 * Returns a human-readable remediation log entry or `null` if no mutation was needed.
 */
export async function remediateFontDictionaryInPlace(
  fontDict: PDFDictT,
  ctx: FontRemediatorContext,
  options: {
    embedStandard14Fonts: boolean;
    substituteExternalUnembeddedFonts: boolean;
    ensureToUnicode: boolean;
  },
): Promise<string | null> {
  const { lib, doc } = ctx;
  const subtype = fontDict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() ?? '';
  const baseFont =
    fontDict.lookupMaybe(lib.PDFName.of('BaseFont'), lib.PDFName)?.decodeText() ?? 'UnknownFont';

  if (subtype === 'Type3') {
    return null;
  }

  // Type 0 composite fonts already hold descendant FontDescriptor checks; only ensure ToUnicode if unembedded is false.
  if (subtype === 'Type0') {
    return null;
  }

  const descriptor = fontDict.lookupMaybe(lib.PDFName.of('FontDescriptor'), lib.PDFDict);
  const hasFontProgram = Boolean(
    descriptor &&
      (descriptor.get(lib.PDFName.of('FontFile')) ||
        descriptor.get(lib.PDFName.of('FontFile2')) ||
        descriptor.get(lib.PDFName.of('FontFile3'))),
  );

  const stdSpec = resolveStandard14Spec(baseFont);
  const canRemediateStandard14 = !hasFontProgram && stdSpec !== null && options.embedStandard14Fonts;
  const canSubstituteExternal =
    !hasFontProgram && stdSpec === null && options.substituteExternalUnembeddedFonts;

  let changed = false;
  let actionSummary: string | null = null;

  if (canRemediateStandard14 || canSubstituteExternal) {
    const spec = stdSpec ?? resolveExternalFallbackSpec(baseFont);
    const { streamRef, fontFileKey } = await getOrEmbedProgram(ctx, spec);
    const fontName = lib.PDFName.of(spec.embeddedBaseFontName);

    const nextDescriptor = doc.context.obj({
      Type: 'FontDescriptor',
      FontName: fontName,
      Flags: spec.flags,
      FontBBox: [...spec.fontBBox],
      ItalicAngle: spec.italicAngle,
      Ascent: spec.ascent,
      Descent: spec.descent,
      CapHeight: spec.capHeight,
      StemV: spec.stemV,
      [fontFileKey]: streamRef,
    });
    const descriptorRef = doc.context.register(nextDescriptor);

    fontDict.set(
      lib.PDFName.of('Subtype'),
      lib.PDFName.of(spec.kind === 'ttf' ? 'TrueType' : 'Type1'),
    );
    fontDict.set(lib.PDFName.of('BaseFont'), fontName);
    fontDict.set(lib.PDFName.of('FontDescriptor'), descriptorRef);

    // Ensure valid FirstChar / LastChar / Widths when missing
    const existingWidths = fontDict.lookupMaybe(lib.PDFName.of('Widths'), lib.PDFArray);
    if (!existingWidths || existingWidths.size() === 0) {
      let widths = ctx.cachedWidths.get(spec.canonicalName);
      if (!widths) {
        widths = await computeSingleByteWidths(spec, lib);
        ctx.cachedWidths.set(spec.canonicalName, widths);
      }
      fontDict.set(lib.PDFName.of('FirstChar'), lib.PDFNumber.of(32));
      fontDict.set(lib.PDFName.of('LastChar'), lib.PDFNumber.of(255));
      fontDict.set(lib.PDFName.of('Widths'), doc.context.obj(widths));
    }

    // Preserve existing Encoding dict/name if nonsymbolic; Symbol/ZapfDingbats omit encoding override.
    if (spec.defaultEncoding === 'WinAnsiEncoding' && !fontDict.get(lib.PDFName.of('Encoding'))) {
      fontDict.set(lib.PDFName.of('Encoding'), lib.PDFName.of('WinAnsiEncoding'));
    }

    changed = true;
    actionSummary = stdSpec
      ? `Embedded Standard-14 font "${baseFont}" via ${spec.embeddedBaseFontName}.`
      : `Substituted unembedded external font "${baseFont}" with ${spec.embeddedBaseFontName}.`;
  }

  // Ensure ToUnicode CMap for nonsymbolic / remediated single-byte fonts when missing
  const hasToUnicode = Boolean(fontDict.get(lib.PDFName.of('ToUnicode')));
  if (
    !hasToUnicode &&
    (changed || (options.ensureToUnicode && hasFontProgram && subtype !== 'Type3'))
  ) {
    const spec = stdSpec ?? resolveExternalFallbackSpec(baseFont);
    const encChoice = detectEncodingChoice(fontDict, spec, lib);
    fontDict.set(lib.PDFName.of('ToUnicode'), getOrEmbedToUnicode(ctx, encChoice));
    if (!actionSummary) {
      actionSummary = `Added single-byte ToUnicode CMap for "${baseFont}".`;
    }
  }

  return actionSummary;
}

export function extractFontDescriptorObject(
  fontDict: PDFDictT,
  lib: PdfLibNs,
  lookup: (obj: PDFObjectT | undefined) => PDFObjectT | undefined,
): {
  embedded: boolean;
  hasToUnicode: boolean;
  subtype: string;
  baseFont: string;
} {
  const subtype =
    fontDict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() ?? 'Unknown';
  const baseFont =
    fontDict.lookupMaybe(lib.PDFName.of('BaseFont'), lib.PDFName)?.decodeText() ?? 'Unnamed';
  const hasToUnicode = Boolean(fontDict.get(lib.PDFName.of('ToUnicode')));

  if (subtype === 'Type3') {
    const charProcs = lookup(fontDict.get(lib.PDFName.of('CharProcs')));
    return {
      embedded: Boolean(charProcs instanceof lib.PDFDict),
      hasToUnicode,
      subtype,
      baseFont,
    };
  }

  if (subtype === 'Type0') {
    const descendants = fontDict.lookupMaybe(lib.PDFName.of('DescendantFonts'), lib.PDFArray);
    let embedded = false;
    if (descendants && descendants.size() > 0) {
      const firstDescendant = descendants.lookupMaybe(0, lib.PDFDict);
      const cidDescriptor = firstDescendant?.lookupMaybe(lib.PDFName.of('FontDescriptor'), lib.PDFDict);
      embedded = Boolean(
        cidDescriptor &&
          (cidDescriptor.get(lib.PDFName.of('FontFile')) ||
            cidDescriptor.get(lib.PDFName.of('FontFile2')) ||
            cidDescriptor.get(lib.PDFName.of('FontFile3'))),
      );
    }
    return {
      embedded,
      hasToUnicode,
      subtype,
      baseFont,
    };
  }

  const descriptor = fontDict.lookupMaybe(lib.PDFName.of('FontDescriptor'), lib.PDFDict);
  const embedded = Boolean(
    descriptor &&
      (descriptor.get(lib.PDFName.of('FontFile')) ||
        descriptor.get(lib.PDFName.of('FontFile2')) ||
        descriptor.get(lib.PDFName.of('FontFile3'))),
  );

  return {
    embedded,
    hasToUnicode,
    subtype,
    baseFont,
  };
}
