import { pdfLib } from '@/core/pdf/lazyPdfLib';

type PdfLibNs = typeof import('pdf-lib');
type PdfColor = import('pdf-lib').Color;
import { throwIfAborted } from '@/core/cancellation/operationCancellation';
import {
  createHeaderFooterVisualGeometry,
  visualPointToPdf,
} from '@/core/header-footer/pdfWriterGeometry';

export type BatesPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface BatesNumberingOptions {
  prefix?: string;
  startNumber?: number;
  digits?: number;
  suffix?: string;
  position?: BatesPosition;
  marginXPt?: number;
  marginYPt?: number;
  fontSize?: number;
  color?: string;
  opacity?: number;
  fontFamily?: 'Helvetica' | 'Courier' | 'TimesRoman';
  pageIndices?: readonly number[];
  signal?: AbortSignal;
}

export interface BatesResult {
  modifiedBytes: Uint8Array;
  stampedPageCount: number;
  sampleFirstStamp: string;
}

export function formatBatesNumber(
  number: number,
  prefix: string = 'BATES-',
  digits: number = 4,
  suffix: string = '',
): string {
  const safeNumber = Math.max(0, Math.floor(number));
  const padded = String(safeNumber).padStart(Math.max(1, digits), '0');
  return `${prefix}${padded}${suffix}`;
}

function hexToRgb(hex: string, lib: PdfLibNs): PdfColor {
  const normalized = hex.replace('#', '').trim();
  const safe =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized.padEnd(6, '0').slice(0, 6);

  const red = parseInt(safe.slice(0, 2), 16) / 255;
  const green = parseInt(safe.slice(2, 4), 16) / 255;
  const blue = parseInt(safe.slice(4, 6), 16) / 255;
  return lib.rgb(red, green, blue);
}

/**
 * Applies sequential Bates numbering or engineering drawing revision stamping to PDF pages.
 */
export async function applyBatesNumbering(
  sourceBytes: Uint8Array,
  options: BatesNumberingOptions = {},
): Promise<BatesResult> {
  throwIfAborted(options.signal, 'apply bates numbering: start');
  if (!sourceBytes || sourceBytes.length === 0) {
    throw new Error('Cannot apply Bates numbering to empty source bytes.');
  }
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(sourceBytes);
  const totalPages = doc.getPageCount();

  if (totalPages === 0) {
    throw new Error('Cannot apply Bates numbering to an empty PDF document.');
  }

  const prefix = options.prefix ?? 'BATES-';
  const startNumber = options.startNumber !== undefined ? Math.max(0, Math.floor(options.startNumber)) : 1;
  const digits = options.digits !== undefined ? Math.max(1, Math.min(12, Math.floor(options.digits))) : 4;
  const suffix = options.suffix ?? '';
  const position = options.position ?? 'bottom-right';
  const marginX = options.marginXPt !== undefined ? Math.max(0, options.marginXPt) : 36;
  const marginY = options.marginYPt !== undefined ? Math.max(0, options.marginYPt) : 24;
  const fontSize = options.fontSize !== undefined ? Math.max(4, Math.min(72, options.fontSize)) : 10;
  const color = options.color ?? '#000000';
  const opacity = options.opacity !== undefined ? Math.max(0, Math.min(1, options.opacity)) : 1.0;

  // Resolve standard font
  let standardFontName = lib.StandardFonts.Helvetica;
  if (options.fontFamily === 'Courier') {
    standardFontName = lib.StandardFonts.Courier;
  } else if (options.fontFamily === 'TimesRoman') {
    standardFontName = lib.StandardFonts.TimesRoman;
  }
  const font = await doc.embedFont(standardFontName);
  const textColor = hexToRgb(color, lib);

  const targetIndices = options.pageIndices && options.pageIndices.length > 0
    ? options.pageIndices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < totalPages)
    : Array.from({ length: totalPages }, (_, i) => i);

  if (targetIndices.length === 0) {
    throw new Error('No valid target pages found for Bates numbering.');
  }

  let sampleFirstStamp = '';

  for (let i = 0; i < targetIndices.length; i++) {
    throwIfAborted(options.signal, 'apply bates numbering: draw page');
    const pageIndex = targetIndices[i]!;
    const page = doc.getPage(pageIndex);
    const currentNumber = startNumber + i;
    const stampText = formatBatesNumber(currentNumber, prefix, digits, suffix);

    if (i === 0) {
      sampleFirstStamp = stampText;
    }

    const cropBox = page.getCropBox() ?? page.getMediaBox();
    const geometry = createHeaderFooterVisualGeometry(
      cropBox.width,
      cropBox.height,
      page.getRotation().angle,
    );

    const textWidth = font.widthOfTextAtSize(stampText, fontSize);
    let visualX = marginX;
    let visualY = marginY;

    switch (position) {
      case 'top-left':
        visualX = marginX;
        visualY = geometry.visualHeight - marginY - fontSize;
        break;
      case 'top-center':
        visualX = Math.max(0, (geometry.visualWidth - textWidth) / 2);
        visualY = geometry.visualHeight - marginY - fontSize;
        break;
      case 'top-right':
        visualX = Math.max(0, geometry.visualWidth - marginX - textWidth);
        visualY = geometry.visualHeight - marginY - fontSize;
        break;
      case 'bottom-left':
        visualX = marginX;
        visualY = marginY;
        break;
      case 'bottom-center':
        visualX = Math.max(0, (geometry.visualWidth - textWidth) / 2);
        visualY = marginY;
        break;
      case 'bottom-right':
      default:
        visualX = Math.max(0, geometry.visualWidth - marginX - textWidth);
        visualY = marginY;
        break;
    }

    const pt = visualPointToPdf(geometry, visualX, visualY);

    page.drawText(stampText, {
      x: pt.x + cropBox.x,
      y: pt.y + cropBox.y,
      font,
      size: fontSize,
      color: textColor,
      opacity,
      rotate: lib.degrees(geometry.rotation),
    });
  }

  throwIfAborted(options.signal, 'apply bates numbering: save');
  const modifiedBytes = await doc.save();

  return {
    modifiedBytes,
    stampedPageCount: targetIndices.length,
    sampleFirstStamp,
  };
}
