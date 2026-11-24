/**
 * Builds the per-font decoders the existing-text provenance matcher uses to
 * turn content-stream string bytes into Unicode and glyph advances
 * (ISO 32000-1 §9.6.6 simple-font encodings, §9.7.4 CIDFont widths,
 * §9.10 ToUnicode). Fonts whose mapping cannot be proved get no decoder; the
 * matcher then only accepts printable-ASCII strings and stops tracking
 * advances after them.
 */

import {
  simpleEncodingToUnicode,
  type ExistingTextFontDecoder,
  type ExistingTextFontDecoders,
} from '@/core/existing-text/fontDecoding';
import type { PdfFontMetadata } from '@/core/pdf-fonts';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { extractAllPageFonts } from './PdfLibFontExtractor';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFPageT = import('pdf-lib').PDFPage;
type PDFDictT = import('pdf-lib').PDFDict;

const STANDARD_14 = new Set([
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
]);

export function buildExistingTextFontDecoders(
  page: PDFPageT,
  lib: PdfLibNs,
): ExistingTextFontDecoders {
  const decoders: Record<string, ExistingTextFontDecoder> = {};
  const fontsDict = page.node
    .Resources()
    ?.lookupMaybe(lib.PDFName.of('Font'), lib.PDFDict);
  if (!fontsDict) return decoders;

  const metadataByName = extractAllPageFonts(page, lib);
  for (const key of fontsDict.keys()) {
    const name = key.decodeText().replace(/^\//, '');
    const fontDict = fontsDict.lookupMaybe(key, lib.PDFDict);
    const metadata = metadataByName.get(name);
    if (!fontDict || !metadata) continue;
    try {
      const decoder = metadata.subtype === 'Type0'
        ? type0Decoder(metadata)
        : simpleDecoder(fontDict, metadata, lib);
      if (decoder) decoders[name] = decoder;
    } catch {
      // A font we cannot model gets no decoder; the matcher fails closed for it.
    }
  }
  return decoders;
}

function type0Decoder(metadata: PdfFontMetadata): ExistingTextFontDecoder | null {
  if (metadata.encodingType !== 'Identity-H' || !metadata.cMap) return null;
  if (metadata.cMap.codeSpaceBytes !== 2) return null;
  return {
    codeBytes: 2,
    toUnicode: metadata.cMap.cidToUnicode,
    widths: metadata.metrics.widths,
    defaultWidth: metadata.metrics.defaultWidthPt,
  };
}

function simpleDecoder(
  fontDict: PDFDictT,
  metadata: PdfFontMetadata,
  lib: PdfLibNs,
): ExistingTextFontDecoder | null {
  const baseFont = (metadata.baseFont ?? '').replace(/^\//, '');
  const encodingObj = fontDict.lookup(lib.PDFName.of('Encoding'));
  let toUnicode: Map<number, string>;

  const namedEncoding =
    encodingObj instanceof lib.PDFName ? encodingObj.decodeText().replace(/^\//, '') : null;
  if (namedEncoding === 'WinAnsiEncoding') {
    toUnicode = simpleEncodingToUnicode('WinAnsi');
  } else if (namedEncoding === 'MacRomanEncoding') {
    toUnicode = simpleEncodingToUnicode('MacRoman');
  } else if (!encodingObj && STANDARD_14.has(baseFont)) {
    toUnicode = simpleEncodingToUnicode('Standard');
  } else {
    // Built-in or /Differences encodings are only trusted through /ToUnicode.
    toUnicode = new Map();
  }

  if (metadata.cMap && metadata.cMap.codeSpaceBytes === 1) {
    for (const [code, unicode] of metadata.cMap.cidToUnicode) {
      toUnicode.set(code, unicode);
    }
  }
  if (toUnicode.size === 0) return null;

  const widthsObj = fontDict.lookup(lib.PDFName.of('Widths'));
  if (widthsObj instanceof lib.PDFArray && metadata.metrics.widths.size > 0) {
    return {
      codeBytes: 1,
      toUnicode,
      widths: metadata.metrics.widths,
      // MissingWidth is optional; without it advances past unknown codes are untracked.
      defaultWidth: null,
    };
  }

  if (STANDARD_14.has(baseFont)) {
    const embedder = lib.StandardFontEmbedder.for(
      baseFont as Parameters<typeof lib.StandardFontEmbedder.for>[0],
    );
    const widths = new Map<number, number>();
    for (const [code, unicode] of toUnicode) {
      try {
        widths.set(code, embedder.widthOfTextAtSize(unicode, 1));
      } catch {
        // Not encodable in the standard font: leave the width unknown.
      }
    }
    return { codeBytes: 1, toUnicode, widths, defaultWidth: null };
  }

  return { codeBytes: 1, toUnicode, widths: new Map(), defaultWidth: null };
}
