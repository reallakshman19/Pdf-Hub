/**
 * PDF-lib Font Extractor.
 * Extracts font dictionaries, descendant CIDFonts, /W arrays, and /ToUnicode streams
 * from PDFPage resources into domain PdfFontMetadata.
 */

import { inspectPdfFont, type PdfFontMetadata, type RawFontDictInput } from '@/core/pdf-fonts';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFPageT = import('pdf-lib').PDFPage;
type PDFDictT = import('pdf-lib').PDFDict;
type PDFArrayT = import('pdf-lib').PDFArray;

export function extractPdfFontFromPage(
  page: PDFPageT,
  resourceName: string,
  lib: PdfLibNs,
): PdfFontMetadata | null {
  const cleanResourceKey = resourceName.replace(/^\//, '');

  // 1. Look up font dictionary in page resources (or inherited parent resources)
  const resources = page.node.Resources();
  if (!resources) {
    return null;
  }

  const fontsDict = resources.lookupMaybe(lib.PDFName.of('Font'), lib.PDFDict);
  if (!fontsDict) {
    return null;
  }

  // Check both with and without leading slash
  const fontObj =
    fontsDict.lookupMaybe(lib.PDFName.of(cleanResourceKey), lib.PDFDict) ??
    fontsDict.lookupMaybe(lib.PDFName.of(`/${cleanResourceKey}`), lib.PDFDict);

  if (!fontObj) {
    return null;
  }

  return buildFontMetadataFromDict(cleanResourceKey, fontObj, lib);
}

export function extractAllPageFonts(
  page: PDFPageT,
  lib: PdfLibNs,
): Map<string, PdfFontMetadata> {
  const result = new Map<string, PdfFontMetadata>();
  const resources = page.node.Resources();
  if (!resources) {
    return result;
  }

  const fontsDict = resources.lookupMaybe(lib.PDFName.of('Font'), lib.PDFDict);
  if (!fontsDict) {
    return result;
  }

  const keys = fontsDict.keys();
  for (const key of keys) {
    const cleanKey = key.decodeText().replace(/^\//, '');
    const fontObj = fontsDict.lookupMaybe(key, lib.PDFDict);
    if (fontObj) {
      const meta = buildFontMetadataFromDict(cleanKey, fontObj, lib);
      result.set(cleanKey, meta);
      result.set(`/${cleanKey}`, meta);
    }
  }

  return result;
}

function buildFontMetadataFromDict(
  resourceName: string,
  fontDict: PDFDictT,
  lib: PdfLibNs,
): PdfFontMetadata {
  const subtypeObj = fontDict.lookup(lib.PDFName.of('Subtype'));
  const rawSubtype =
    subtypeObj instanceof lib.PDFName ? subtypeObj.decodeText() : 'TrueType';

  const baseFontObj = fontDict.lookup(lib.PDFName.of('BaseFont'));
  const baseFont =
    baseFontObj instanceof lib.PDFName ? baseFontObj.decodeText() : undefined;

  const encodingObj = fontDict.lookup(lib.PDFName.of('Encoding'));
  let encoding: string | null = null;
  if (encodingObj instanceof lib.PDFName) {
    encoding = encodingObj.decodeText();
  }

  const firstCharObj = fontDict.lookup(lib.PDFName.of('FirstChar'));
  const firstChar =
    firstCharObj instanceof lib.PDFNumber ? firstCharObj.asNumber() : undefined;

  const lastCharObj = fontDict.lookup(lib.PDFName.of('LastChar'));
  const lastChar =
    lastCharObj instanceof lib.PDFNumber ? lastCharObj.asNumber() : undefined;

  // Simple widths array
  const widthsObj = fontDict.lookup(lib.PDFName.of('Widths'));
  let widths: number[] | undefined;
  if (widthsObj instanceof lib.PDFArray) {
    widths = extractNumberArray(widthsObj, lib);
  }

  // /ToUnicode stream bytes (checked on root Type 0 dict first, fallback to descendant CIDFont per ISO 32000-1 §9.10.3)
  let toUnicodeBytes = extractStreamBytes(fontDict, 'ToUnicode', lib);

  // FontDescriptor
  const descriptorObj = fontDict.lookup(lib.PDFName.of('FontDescriptor'));
  const descriptor =
    descriptorObj instanceof lib.PDFDict
      ? extractDescriptor(descriptorObj, lib)
      : null;

  // DescendantFonts (for Type 0 composite fonts)
  let descendantFont: RawFontDictInput['descendantFont'] = null;
  const descendantFontsObj = fontDict.lookup(lib.PDFName.of('DescendantFonts'));
  if (descendantFontsObj instanceof lib.PDFArray && descendantFontsObj.size() > 0) {
    const descObj = descendantFontsObj.lookup(0);
    if (descObj instanceof lib.PDFDict) {
      if (!toUnicodeBytes) {
        toUnicodeBytes = extractStreamBytes(descObj, 'ToUnicode', lib);
      }

      const descSubtype = descObj.lookup(lib.PDFName.of('Subtype'));
      const descBaseFont = descObj.lookup(lib.PDFName.of('BaseFont'));
      const descDw = descObj.lookup(lib.PDFName.of('DW'));
      const descW = descObj.lookup(lib.PDFName.of('W'));
      const descDesc = descObj.lookup(lib.PDFName.of('FontDescriptor'));

      descendantFont = {
        subtype:
          descSubtype instanceof lib.PDFName
            ? descSubtype.decodeText()
            : 'CIDFontType2',
        baseFont:
          descBaseFont instanceof lib.PDFName
            ? descBaseFont.decodeText()
            : undefined,
        defaultWidth:
          descDw instanceof lib.PDFNumber ? descDw.asNumber() : 1000,
        cidW:
          descW instanceof lib.PDFArray ? extractRawCidWArray(descW, lib) : [],
        descriptor:
          descDesc instanceof lib.PDFDict
            ? extractDescriptor(descDesc, lib)
            : null,
      };
    }
  }

  const rawInput: RawFontDictInput = {
    resourceName: `/${resourceName.replace(/^\//, '')}`,
    subtype: rawSubtype,
    baseFont,
    encoding,
    firstChar,
    lastChar,
    widths,
    toUnicodeBytes,
    descriptor,
    descendantFont,
  };

  return inspectPdfFont(rawInput);
}

function extractNumberArray(arrayObj: PDFArrayT, lib: PdfLibNs): number[] {
  const result: number[] = [];
  for (let i = 0; i < arrayObj.size(); i++) {
    const item = arrayObj.lookup(i);
    if (item instanceof lib.PDFNumber) {
      result.push(item.asNumber());
    }
  }
  return result;
}

function extractRawCidWArray(arrayObj: PDFArrayT, lib: PdfLibNs): unknown[] {
  const result: unknown[] = [];
  for (let i = 0; i < arrayObj.size(); i++) {
    const item = arrayObj.lookup(i);
    if (item instanceof lib.PDFNumber) {
      result.push(item.asNumber());
    } else if (item instanceof lib.PDFArray) {
      result.push(extractNumberArray(item, lib));
    }
  }
  return result;
}

function extractStreamBytes(
  dict: PDFDictT,
  key: string,
  lib: PdfLibNs,
): Uint8Array | null {
  const streamObj = dict.lookup(lib.PDFName.of(key));
  if (streamObj instanceof lib.PDFRawStream) {
    try {
      const decoded = lib.decodePDFRawStream(streamObj).decode();
      return Uint8Array.from(decoded);
    } catch {
      return null;
    }
  }
  return null;
}

function extractDescriptor(
  descDict: PDFDictT,
  lib: PdfLibNs,
): NonNullable<RawFontDictInput['descriptor']> {
  const fontNameObj = descDict.lookup(lib.PDFName.of('FontName'));
  const flagsObj = descDict.lookup(lib.PDFName.of('Flags'));
  const italicAngleObj = descDict.lookup(lib.PDFName.of('ItalicAngle'));
  const ascentObj = descDict.lookup(lib.PDFName.of('Ascent'));
  const descentObj = descDict.lookup(lib.PDFName.of('Descent'));
  const capHeightObj = descDict.lookup(lib.PDFName.of('CapHeight'));
  const missingWidthObj = descDict.lookup(lib.PDFName.of('MissingWidth'));

  return {
    fontName:
      fontNameObj instanceof lib.PDFName ? fontNameObj.decodeText() : undefined,
    flags: flagsObj instanceof lib.PDFNumber ? flagsObj.asNumber() : 0,
    italicAngle:
      italicAngleObj instanceof lib.PDFNumber
        ? italicAngleObj.asNumber()
        : undefined,
    ascent:
      ascentObj instanceof lib.PDFNumber ? ascentObj.asNumber() : undefined,
    descent:
      descentObj instanceof lib.PDFNumber ? descentObj.asNumber() : undefined,
    capHeight:
      capHeightObj instanceof lib.PDFNumber
        ? capHeightObj.asNumber()
        : undefined,
    missingWidth:
      missingWidthObj instanceof lib.PDFNumber
        ? missingWidthObj.asNumber()
        : undefined,
  };
}
