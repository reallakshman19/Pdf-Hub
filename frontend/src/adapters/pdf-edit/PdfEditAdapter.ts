import { pdfLib } from '@/core/pdf/lazyPdfLib';
import type { PdfAnnotation, Point2D } from '@/core/annotations/types';
import { readFillColor, readStrokeColor, readStrokeWidth } from '@/core/annotations/readers';
import { computeCalloutPath } from '@/core/annotations/callout-geometry';
import { raceWithAbort, throwIfAborted } from '@/core/cancellation/operationCancellation';

type PDFPageT = import('pdf-lib').PDFPage;
type PdfColor = import('pdf-lib').Color;
type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;

type HeaderFooterOptions = {
  pages: number[];
  zone: 'header' | 'footer';
  text: string;
  align: 'left' | 'center' | 'right';
  marginX: number;
  marginY: number;
  fontSize: number;
  color: string;
  opacity: number;
  fileName: string;
  now: Date;
  enablePageNumberToken: boolean;
  enableFileNameToken: boolean;
  enableDateToken: boolean;
  signal?: AbortSignal;
};

type DrawTextOptions = {
  pages: number[];
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
  rotation?: number;
  fileName: string;
  now: Date;
  enablePageNumberToken: boolean;
  enableFileNameToken: boolean;
  enableDateToken: boolean;
  signal?: AbortSignal;
};

export interface PdfEditOperationOptions {
  signal?: AbortSignal;
}

async function awaitPdfOperation<T>(
  operationPromise: Promise<T>,
  signal: AbortSignal | undefined,
  operation: string,
): Promise<T> {
  return raceWithAbort(operationPromise, signal, operation);
}

function pdfCheckpoint(signal: AbortSignal | undefined, operation: string): void {
  throwIfAborted(signal, operation);
}

function normalizePageIndices(pageIndices: number[]): number[] {
  return Array.from(new Set(pageIndices)).sort((a, b) => a - b);
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

function resolveHeaderFooterTokens(
  template: string,
  values: {
    page: number;
    pages: number;
    file: string;
    date: string;
    enablePageNumberToken: boolean;
    enableFileNameToken: boolean;
    enableDateToken: boolean;
  },
): string {
  let output = template;

  if (values.enablePageNumberToken) {
    output = output.replaceAll('{page}', String(values.page));
    output = output.replaceAll('{{page}}', String(values.page));
    output = output.replaceAll('{pages}', String(values.pages));
    output = output.replaceAll('{{total_pages}}', String(values.pages));
    output = output.replaceAll('{{pages}}', String(values.pages));
  }
  if (values.enableFileNameToken) {
    output = output.replaceAll('{file}', values.file);
    output = output.replaceAll('{{file_name}}', values.file);
    output = output.replaceAll('{{file}}', values.file);
  }
  if (values.enableDateToken) {
    output = output.replaceAll('{date}', values.date);
    output = output.replaceAll('{{date}}', values.date);
  }

  return output;
}

function drawArrowHead(
  page: PDFPageT,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: PdfColor,
  thickness: number,
  style: 'open' | 'filled',
  lib: PdfLibNs,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  // ASME Y14.2 mechanical CAD standard drafting arrowhead: 3:1 aspect ratio with prominent visibility
  const headLength = Math.max(10, thickness * 6);
  const wingAngle = Math.PI / 15; // 12 degrees for razor-sharp engineering profile

  const leftX = x2 - headLength * Math.cos(angle - wingAngle);
  const leftY = y2 - headLength * Math.sin(angle - wingAngle);
  const rightX = x2 - headLength * Math.cos(angle + wingAngle);
  const rightY = y2 - headLength * Math.sin(angle + wingAngle);

  if (style === 'filled') {
    page.pushOperators(
      lib.setFillingColor(color),
      lib.moveTo(x2, y2),
      lib.lineTo(leftX, leftY),
      lib.lineTo(rightX, rightY),
      lib.closePath(),
      lib.fill(),
    );
    return;
  }

  page.drawLine({
    start: { x: x2, y: y2 },
    end: { x: leftX, y: leftY },
    thickness,
    color,
  });

  page.drawLine({
    start: { x: x2, y: y2 },
    end: { x: rightX, y: rightY },
    thickness,
    color,
  });
}

type LineCapStyle = 'none' | 'arrow' | 'circle' | 'square';

function readLineCapStyle(value: unknown, fallback: LineCapStyle): LineCapStyle {
  if (value === 'none' || value === 'arrow' || value === 'circle' || value === 'square') {
    return value;
  }
  return fallback;
}

function readPoint(value: unknown): Point2D | null {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number'
  ) {
    return value as Point2D;
  }
  return null;
}

function drawLineCap(
  page: PDFPageT,
  cap: LineCapStyle,
  from: Point2D,
  to: Point2D,
  color: PdfColor,
  thickness: number,
  lib: PdfLibNs,
): void {
  if (cap === 'none') {
    return;
  }

  if (cap === 'arrow') {
    drawArrowHead(page, from.x, from.y, to.x, to.y, color, thickness, 'filled', lib);
    return;
  }

  const radius = Math.max(2.5, thickness * 1.5);
  if (cap === 'circle') {
    page.drawEllipse({
      x: to.x,
      y: to.y,
      xScale: radius,
      yScale: radius,
      color,
      borderColor: color,
      borderWidth: Math.max(0.5, thickness * 0.5),
    });
    return;
  }

  const size = radius * 2;
  page.drawRectangle({
    x: to.x - radius,
    y: to.y - radius,
    width: size,
    height: size,
    color,
    borderColor: color,
    borderWidth: Math.max(0.5, thickness * 0.5),
  });
}

export class PdfEditAdapter {
  static async countPages(
    bytes: Uint8Array,
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<number> {
    const { PDFDocument } = await pdfLib();
    const pdfDoc = await awaitPdfOperation(
      PDFDocument.load(bytes),
      operationOptions.signal,
      'count PDF pages: load',
    );
    pdfCheckpoint(operationOptions.signal, 'count PDF pages');
    return pdfDoc.getPageCount();
  }

  static async getPageSize(
    bytes: Uint8Array,
    pageIndex: number,
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<{ width: number; height: number }> {
    const { PDFDocument } = await pdfLib();
    const pdfDoc = await awaitPdfOperation(
      PDFDocument.load(bytes),
      operationOptions.signal,
      'read PDF page size: load',
    );
    pdfCheckpoint(operationOptions.signal, 'read PDF page size');
    const page = pdfDoc.getPage(pageIndex);
    return { width: page.getWidth(), height: page.getHeight() };
  }

  static async merge(
    baseBytes: Uint8Array,
    appendDocs: Uint8Array[],
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const out = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'merge PDFs: load base',
    );

    for (const docBytes of appendDocs) {
      pdfCheckpoint(operationOptions.signal, 'merge PDFs');
      const src = await awaitPdfOperation(
        PDFDocument.load(docBytes),
        operationOptions.signal,
        'merge PDFs: load donor',
      );
      const copied = await awaitPdfOperation(
        out.copyPages(src, src.getPageIndices()),
        operationOptions.signal,
        'merge PDFs: copy pages',
      );
      for (const page of copied) {
        pdfCheckpoint(operationOptions.signal, 'merge PDFs: add page');
        out.addPage(page);
      }
    }

    return await awaitPdfOperation(out.save(), operationOptions.signal, 'merge PDFs: save');
  }

  static async insertAt(
    baseBytes: Uint8Array,
    insertBytes: Uint8Array,
    atIndex: number,
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const baseDoc = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'insert PDF: load base',
    );
    const insertDoc = await awaitPdfOperation(
      PDFDocument.load(insertBytes),
      operationOptions.signal,
      'insert PDF: load donor',
    );
    const copied = await awaitPdfOperation(
      baseDoc.copyPages(insertDoc, insertDoc.getPageIndices()),
      operationOptions.signal,
      'insert PDF: copy pages',
    );

    let targetIndex = Math.max(0, Math.min(atIndex, baseDoc.getPageCount()));
    for (const page of copied) {
      pdfCheckpoint(operationOptions.signal, 'insert PDF: add page');
      baseDoc.insertPage(targetIndex, page);
      targetIndex += 1;
    }

    return await awaitPdfOperation(baseDoc.save(), operationOptions.signal, 'insert PDF: save');
  }

  static async insertBlankPage(
    baseBytes: Uint8Array,
    atIndex: number,
    size: { width: number; height: number },
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const pdfDoc = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'insert blank page: load',
    );
    pdfCheckpoint(operationOptions.signal, 'insert blank page');
    pdfDoc.insertPage(Math.max(0, Math.min(atIndex, pdfDoc.getPageCount())), [size.width, size.height]);
    return await awaitPdfOperation(pdfDoc.save(), operationOptions.signal, 'insert blank page: save');
  }

  static async replacePage(
    baseBytes: Uint8Array,
    targetIndex: number,
    donorBytes: Uint8Array,
    donorPageIndex: number,
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const baseDoc = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'replace page: load base',
    );
    const donorDoc = await awaitPdfOperation(
      PDFDocument.load(donorBytes),
      operationOptions.signal,
      'replace page: load donor',
    );
    const outDoc = await awaitPdfOperation(
      PDFDocument.create(),
      operationOptions.signal,
      'replace page: create output',
    );

    const donorCopied = await awaitPdfOperation(
      outDoc.copyPages(donorDoc, [donorPageIndex]),
      operationOptions.signal,
      'replace page: copy donor',
    );
    const replacement = donorCopied[0];

    for (const index of baseDoc.getPageIndices()) {
      pdfCheckpoint(operationOptions.signal, 'replace page: rebuild output');
      if (index === targetIndex) {
        outDoc.addPage(replacement);
      } else {
        const [copied] = await awaitPdfOperation(
          outDoc.copyPages(baseDoc, [index]),
          operationOptions.signal,
          'replace page: copy source page',
        );
        outDoc.addPage(copied);
      }
    }

    return await awaitPdfOperation(outDoc.save(), operationOptions.signal, 'replace page: save');
  }

  static async extractPages(
    baseBytes: Uint8Array,
    pageIndices: number[],
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const srcDoc = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'extract pages: load',
    );
    const outDoc = await awaitPdfOperation(
      PDFDocument.create(),
      operationOptions.signal,
      'extract pages: create output',
    );
    const normalized = normalizePageIndices(pageIndices);
    const copied = await awaitPdfOperation(
      outDoc.copyPages(srcDoc, normalized),
      operationOptions.signal,
      'extract pages: copy',
    );
    for (const page of copied) {
      pdfCheckpoint(operationOptions.signal, 'extract pages: add page');
      outDoc.addPage(page);
    }
    return await awaitPdfOperation(outDoc.save(), operationOptions.signal, 'extract pages: save');
  }

  static async removePages(
    baseBytes: Uint8Array,
    pageIndices: number[],
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const srcDoc = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'remove pages: load',
    );
    const toRemove = new Set(normalizePageIndices(pageIndices));
    const keepIndices = srcDoc.getPageIndices().filter((index) => !toRemove.has(index));

    if (keepIndices.length === 0) {
      throw new Error('Cannot remove all pages from the document');
    }

    const outDoc = await awaitPdfOperation(
      PDFDocument.create(),
      operationOptions.signal,
      'remove pages: create output',
    );
    const copied = await awaitPdfOperation(
      outDoc.copyPages(srcDoc, keepIndices),
      operationOptions.signal,
      'remove pages: copy',
    );
    for (const page of copied) {
      pdfCheckpoint(operationOptions.signal, 'remove pages: add page');
      outDoc.addPage(page);
    }
    return await awaitPdfOperation(outDoc.save(), operationOptions.signal, 'remove pages: save');
  }

  static async duplicatePages(
    baseBytes: Uint8Array,
    pageIndices: number[],
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const srcDoc = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'duplicate pages: load',
    );
    const selected = new Set(normalizePageIndices(pageIndices));

    const order: number[] = [];
    for (const index of srcDoc.getPageIndices()) {
      pdfCheckpoint(operationOptions.signal, 'duplicate pages: build order');
      order.push(index);
      if (selected.has(index)) order.push(index);
    }

    const outDoc = await awaitPdfOperation(
      PDFDocument.create(),
      operationOptions.signal,
      'duplicate pages: create output',
    );
    const copied = await awaitPdfOperation(
      outDoc.copyPages(srcDoc, order),
      operationOptions.signal,
      'duplicate pages: copy',
    );
    for (const page of copied) {
      pdfCheckpoint(operationOptions.signal, 'duplicate pages: add page');
      outDoc.addPage(page);
    }
    return await awaitPdfOperation(outDoc.save(), operationOptions.signal, 'duplicate pages: save');
  }

  static async rotatePages(
    baseBytes: Uint8Array,
    pageIndices: number[],
    deltaDegrees: number,
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument, degrees } = await pdfLib();
    const pdfDoc = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'rotate pages: load',
    );
    const selected = new Set(normalizePageIndices(pageIndices));

    for (const [index, page] of pdfDoc.getPages().entries()) {
      pdfCheckpoint(operationOptions.signal, 'rotate pages');
      if (!selected.has(index)) continue;
      const nextRotation = (page.getRotation().angle + deltaDegrees + 360) % 360;
      page.setRotation(degrees(nextRotation));
    }

    return await awaitPdfOperation(pdfDoc.save(), operationOptions.signal, 'rotate pages: save');
  }

  static async movePage(baseBytes: Uint8Array, fromIndex: number, toIndex: number): Promise<Uint8Array> {
    return this.movePagesAsBlock(baseBytes, [fromIndex], toIndex, 'before');
  }

  static async movePagesAsBlock(
    baseBytes: Uint8Array,
    pageIndices: number[], // 0-based
    targetIndex: number,   // 0-based
    placement: 'before' | 'after' | 'append'
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const srcDoc = await PDFDocument.load(baseBytes);
    const pageCount = srcDoc.getPageCount();

    const allPages = Array.from({ length: pageCount }, (_, i) => i);
    const selectedSet = new Set(pageIndices);
    const validSelected = pageIndices.filter(p => p >= 0 && p < pageCount);
    if (validSelected.length === 0) return baseBytes;

    const remainingPages = allPages.filter(p => !selectedSet.has(p));
    let insertIndex = remainingPages.length;

    if (placement !== 'append') {
      const remainingTargetIndex = remainingPages.indexOf(targetIndex);
      if (remainingTargetIndex !== -1) {
        insertIndex = placement === 'before' ? remainingTargetIndex : remainingTargetIndex + 1;
      }
    }

    const newOrder = [
      ...remainingPages.slice(0, insertIndex),
      ...validSelected,
      ...remainingPages.slice(insertIndex)
    ];

    const out = await PDFDocument.create();
    const copied = await out.copyPages(srcDoc, newOrder);
    copied.forEach((page) => out.addPage(page));
    return await out.save();
  }

  static async reorderPages(
    baseBytes: Uint8Array,
    order: number[],
    operationOptions: PdfEditOperationOptions = {},
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const srcDoc = await awaitPdfOperation(
      PDFDocument.load(baseBytes),
      operationOptions.signal,
      'reorder pages: load',
    );
    const pageCount = srcDoc.getPageCount();

    if (order.length !== pageCount) {
      throw new Error('Reorder list length does not match page count');
    }

    const sorted = [...order].sort((a, b) => a - b);
    for (let index = 0; index < pageCount; index += 1) {
      pdfCheckpoint(operationOptions.signal, 'reorder pages: validate');
      if (sorted[index] !== index) {
        throw new Error('Reorder list is not a valid page permutation');
      }
    }

    const out = await awaitPdfOperation(
      PDFDocument.create(),
      operationOptions.signal,
      'reorder pages: create output',
    );
    const copied = await awaitPdfOperation(
      out.copyPages(srcDoc, order),
      operationOptions.signal,
      'reorder pages: copy',
    );
    for (const page of copied) {
      pdfCheckpoint(operationOptions.signal, 'reorder pages: add page');
      out.addPage(page);
    }
    return await awaitPdfOperation(out.save(), operationOptions.signal, 'reorder pages: save');
  }

  static async addHeaderFooterText(
    baseBytes: Uint8Array,
    options: HeaderFooterOptions,
  ): Promise<Uint8Array> {
    const lib = await pdfLib();
    const { PDFDocument, StandardFonts } = lib;
    const pdfDoc = await awaitPdfOperation(PDFDocument.load(baseBytes), options.signal, 'header/footer: load');
    const font = await awaitPdfOperation(pdfDoc.embedFont(StandardFonts.Helvetica), options.signal, 'header/footer: embed font');
    const totalPages = pdfDoc.getPageCount();

    for (const pageIndex of options.pages) {
      pdfCheckpoint(options.signal, 'header/footer: draw page');
      const page = pdfDoc.getPage(pageIndex);
      const width = page.getWidth();
      const height = page.getHeight();

      const text = resolveHeaderFooterTokens(options.text, {
        page: pageIndex + 1,
        pages: totalPages,
        file: options.fileName,
        date: options.now.toLocaleDateString(),
        enablePageNumberToken: options.enablePageNumberToken,
        enableFileNameToken: options.enableFileNameToken,
        enableDateToken: options.enableDateToken,
      });

      const textWidth = font.widthOfTextAtSize(text, options.fontSize);
      const x =
        options.align === 'left'
          ? options.marginX
          : options.align === 'center'
          ? (width - textWidth) / 2
          : width - options.marginX - textWidth;
      const y =
        options.zone === 'header'
          ? height - options.marginY - options.fontSize
          : options.marginY;

      page.drawText(text, {
        x,
        y,
        font,
        size: options.fontSize,
        color: hexToRgb(options.color, lib),
        opacity: options.opacity,
      });
    }

    return await awaitPdfOperation(pdfDoc.save(), options.signal, 'header/footer: save');
  }

  static async drawTextOnPages(
    baseBytes: Uint8Array,
    options: DrawTextOptions,
  ): Promise<Uint8Array> {
    const lib = await pdfLib();
    const { PDFDocument, StandardFonts, degrees } = lib;
    const pdfDoc = await awaitPdfOperation(PDFDocument.load(baseBytes), options.signal, 'draw text: load');
    const font = await awaitPdfOperation(pdfDoc.embedFont(StandardFonts.Helvetica), options.signal, 'draw text: embed font');
    const totalPages = pdfDoc.getPageCount();

    for (const pageIndex of options.pages) {
      pdfCheckpoint(options.signal, 'draw text: draw page');
      const page = pdfDoc.getPage(pageIndex);
      const width = page.getWidth();

      const text = resolveHeaderFooterTokens(options.text, {
        page: pageIndex + 1,
        pages: totalPages,
        file: options.fileName,
        date: options.now.toLocaleDateString(),
        enablePageNumberToken: options.enablePageNumberToken,
        enableFileNameToken: options.enableFileNameToken,
        enableDateToken: options.enableDateToken,
      });

      const textWidth = font.widthOfTextAtSize(text, options.fontSize);
      const x =
        options.align === 'left'
          ? options.x
          : options.align === 'center'
          ? (width - textWidth) / 2
          : width - options.x - textWidth;

      page.drawText(text, {
        x,
        y: options.y,
        font,
        size: options.fontSize,
        color: hexToRgb(options.color, lib),
        opacity: options.opacity,
        rotate: options.rotation !== undefined ? degrees(options.rotation) : undefined,
      });
    }

    return await awaitPdfOperation(pdfDoc.save(), options.signal, 'draw text: save');
  }

  static async insertImage(
    baseBytes: Uint8Array,
    options: {
      pages: number[];
      imageBytes: Uint8Array;
      mimeType: 'image/jpeg' | 'image/png';
      x: number;
      y: number;
      width?: number;
      height?: number;
      scale?: number;
      opacity?: number;
      borderWidth?: number;
      borderColor?: string;
      rotation?: number;
      signal?: AbortSignal;
    }
  ): Promise<Uint8Array> {
    const { PDFDocument } = await pdfLib();
    const pdfDoc = await awaitPdfOperation(PDFDocument.load(baseBytes), options.signal, 'insert image: load');
    const image = options.mimeType === 'image/jpeg'
      ? await awaitPdfOperation(pdfDoc.embedJpg(options.imageBytes), options.signal, 'insert image: embed JPEG')
      : await awaitPdfOperation(pdfDoc.embedPng(options.imageBytes), options.signal, 'insert image: embed PNG');

    let drawWidth = image.width;
    let drawHeight = image.height;

    if (options.width && options.height) {
      drawWidth = options.width;
      drawHeight = options.height;
    } else if (options.scale) {
      drawWidth = image.width * options.scale;
      drawHeight = image.height * options.scale;
    }

    for (const pageIndex of options.pages) {
      pdfCheckpoint(options.signal, 'insert image: draw page');
      const page = pdfDoc.getPage(pageIndex);
      const pageHeight = page.getHeight();
      const drawY = pageHeight - options.y - drawHeight;
      page.drawImage(image, { x: options.x, y: drawY, width: drawWidth, height: drawHeight });
    }

    return await awaitPdfOperation(pdfDoc.save(), options.signal, 'insert image: save');
  }

  static async drawRedactionBoxes(
    baseBytes: Uint8Array,
    options: {
      pages: number[];
      x: number;
      y: number;
      width: number;
      height: number;
      fillColor: string;
      signal?: AbortSignal;
    },
  ): Promise<Uint8Array> {
    const lib = await pdfLib();
    const { PDFDocument } = lib;
    const pdfDoc = await awaitPdfOperation(PDFDocument.load(baseBytes), options.signal, 'redaction boxes: load');
    const fill = hexToRgb(options.fillColor, lib);

    for (const pageIndex of options.pages) {
      pdfCheckpoint(options.signal, 'redaction boxes: draw page');
      const page = pdfDoc.getPage(pageIndex);
      const pageHeight = page.getHeight();
      const drawY = pageHeight - options.y - options.height;

      page.drawRectangle({
        x: options.x,
        y: drawY,
        width: options.width,
        height: options.height,
        color: fill,
        opacity: 1,
      });
    }

    return await awaitPdfOperation(pdfDoc.save(), options.signal, 'redaction boxes: save');
  }

  static async rotatePage(baseBytes: Uint8Array, pageIndex: number, deltaDegrees: number): Promise<Uint8Array> {
    return this.rotatePages(baseBytes, [pageIndex], deltaDegrees);
  }

  static async deletePage(baseBytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
    return this.removePages(baseBytes, [pageIndex]);
  }

  static async drawProfessionalCallout(
    baseBytes: Uint8Array,
    options: {
      pages: number[];
      callout: import('@/core/macro/psIsonote/professional/model').ProfessionalCalloutModel;
      signal?: AbortSignal;
    },
  ): Promise<Uint8Array> {
    return PdfEditAdapter.drawProfessionalCallouts(baseBytes, [options], options.signal);
  }

  /**
   * Draws ALL professional callouts in a single PDFDocument.load/save cycle.
   * Use this instead of calling drawProfessionalCallout() in a loop — it's far more
   * memory-efficient (no repeated load/save per callout) and produces correct output.
   */
  static async drawProfessionalCallouts(
    baseBytes: Uint8Array,
    calloutOps: Array<{
      pages: number[];
      callout: import('@/core/macro/psIsonote/professional/model').ProfessionalCalloutModel;
    }>,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const lib = await pdfLib();
    const { PDFDocument, StandardFonts } = lib;
    const pdfDoc = await awaitPdfOperation(PDFDocument.load(baseBytes), signal, 'draw professional callouts: load');
    const helvetica = await awaitPdfOperation(pdfDoc.embedFont(StandardFonts.Helvetica), signal, 'draw professional callouts: embed regular font');
    const helveticaBold = await awaitPdfOperation(pdfDoc.embedFont(StandardFonts.HelveticaBold), signal, 'draw professional callouts: embed bold font');

    for (const options of calloutOps) {
      for (const pageIndex of options.pages) {
        pdfCheckpoint(signal, 'draw professional callouts: draw page');
        if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;
        const page = pdfDoc.getPage(pageIndex);
        const pageHeight = page.getHeight();

        for (const primitive of options.callout.primitives) {
          if (primitive.type === 'line') {
            page.drawLine({
              start: { x: primitive.start.x, y: pageHeight - primitive.start.y },
              end: { x: primitive.end.x, y: pageHeight - primitive.end.y },
              thickness: primitive.width,
              color: hexToRgb(primitive.color, lib),
            });
          } else if (primitive.type === 'arrow') {
            const color = hexToRgb(primitive.color, lib);
            page.drawLine({
              start: { x: primitive.start.x, y: pageHeight - primitive.start.y },
              end: { x: primitive.end.x, y: pageHeight - primitive.end.y },
              thickness: primitive.width,
              color,
            });
            drawArrowHead(
              page,
              primitive.start.x,
              pageHeight - primitive.start.y,
              primitive.end.x,
              pageHeight - primitive.end.y,
              color,
              primitive.width,
              primitive.headStyle === 'open' ? 'open' : 'filled',
              lib,
            );
          } else if (primitive.type === 'circle') {
            page.drawEllipse({
              x: primitive.center.x,
              y: pageHeight - primitive.center.y,
              xScale: primitive.radius,
              yScale: primitive.radius,
              color: hexToRgb(primitive.fillColor, lib),
              borderColor: hexToRgb(primitive.borderColor, lib),
              borderWidth: primitive.borderWidth,
            });
          } else if (primitive.type === 'rectangle') {
            page.drawRectangle({
              x: primitive.rect.x,
              y: pageHeight - primitive.rect.y - primitive.rect.height,
              width: primitive.rect.width,
              height: primitive.rect.height,
              color: hexToRgb(primitive.fillColor, lib),
              borderColor: hexToRgb(primitive.borderColor, lib),
              borderWidth: primitive.borderWidth,
            });
          } else if (primitive.type === 'text') {
            const font = primitive.fontWeight === 'bold' ? helveticaBold : helvetica;
            page.drawText(primitive.text, {
              x: primitive.position.x,
              y: pageHeight - primitive.position.y,
              font,
              size: primitive.fontSize,
              color: hexToRgb(primitive.color, lib),
            });
          }
        }
      }
    }

    return await awaitPdfOperation(pdfDoc.save(), signal, 'draw professional callouts: save');
  }


  static async exportWithAnnotations(baseBytes: Uint8Array, annotations: PdfAnnotation[]): Promise<Uint8Array> {
    const lib = await pdfLib();
    const { PDFDocument, StandardFonts, rgb, degrees } = lib;
    const pdfDoc = await PDFDocument.load(baseBytes);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const annotation of annotations) {
      if (annotation.pageNumber < 1 || annotation.pageNumber > pdfDoc.getPageCount()) {
        continue;
      }

      const page = pdfDoc.getPage(annotation.pageNumber - 1);
      const x = annotation.rect.x;
      const y = page.getHeight() - annotation.rect.y - annotation.rect.height;

      const text =
        (typeof annotation.data.text === 'string' && annotation.data.text) ||
        (typeof annotation.data.content === 'string' && annotation.data.content) ||
        (annotation.type === 'stamp' ? 'STAMP' : '');

      const borderColorHex = readStrokeColor(annotation);
      const fillColorHex = readFillColor(annotation);
      const strokeWidth = readStrokeWidth(annotation);
      const borderColor = borderColorHex === 'transparent' ? undefined : hexToRgb(borderColorHex, lib);
      const fillColor = fillColorHex === 'transparent' ? undefined : hexToRgb(fillColorHex, lib);

      if (annotation.type === 'highlight') {
        page.drawRectangle({
          x,
          y,
          width: annotation.rect.width,
          height: annotation.rect.height,
          color: fillColor ?? rgb(1, 0.92, 0.2),
          opacity: typeof annotation.data.opacity === 'number' ? annotation.data.opacity : 0.35,
          borderWidth: 0,
        });
        continue;
      }

      if (annotation.type === 'shape-rect') {
        page.drawRectangle({
          x, y,
          width: annotation.rect.width,
          height: annotation.rect.height,
          borderWidth: strokeWidth,
          borderColor,
          color: fillColor,
          opacity: 0.8,
        });
        continue;
      }

      if (annotation.type === 'shape-ellipse') {
        page.drawEllipse({
          x: x + annotation.rect.width / 2,
          y: y + annotation.rect.height / 2,
          xScale: annotation.rect.width / 2,
          yScale: annotation.rect.height / 2,
          borderWidth: strokeWidth,
          borderColor,
          color: fillColor,
        });
        continue;
      }

      if (annotation.type === 'redaction') {
        page.drawRectangle({
          x, y,
          width: annotation.rect.width,
          height: annotation.rect.height,
          color: rgb(0, 0, 0),
        });
        continue;
      }

      if (annotation.type === 'ink') {
        const paths = Array.isArray(annotation.data.paths) ? annotation.data.paths : [];
        for (const path of paths) {
          if (!Array.isArray(path) || path.length < 4) continue;

          for (let i = 0; i < path.length - 2; i += 2) {
            const x1 = x + path[i];
            const y1 = y + annotation.rect.height - path[i+1];
            const x2 = x + path[i+2];
            const y2 = y + annotation.rect.height - path[i+3];

            if (borderColor) {
              page.drawLine({
                start: { x: x1, y: y1 },
                end: { x: x2, y: y2 },
                thickness: strokeWidth,
                color: borderColor,
              });
            }
          }
        }
        continue;
      }

      // Simplified cloud and polygon exports as rect bounds for basic rendering support
      // (Advanced PDF-lib custom paths are too complex for this block without custom SVG to PDF logic)
      if (annotation.type === 'shape-cloud' || annotation.type === 'shape-polygon' || annotation.type === 'squiggly') {
        page.drawRectangle({
          x, y,
          width: annotation.rect.width,
          height: annotation.rect.height,
          borderWidth: strokeWidth,
          borderColor: borderColor || rgb(1, 0, 0),
          color: fillColor,
        });
        continue;
      }

      if (annotation.type === 'line' || annotation.type === 'arrow') {
        const points = Array.isArray(annotation.data.points)
          ? annotation.data.points
          : [0, annotation.rect.height / 2, annotation.rect.width, annotation.rect.height / 2];

        const x1 = x + points[0];
        const y1 = y + annotation.rect.height - points[1];
        const x2 = x + points[2];
        const y2 = y + annotation.rect.height - points[3];

        if (borderColor) {
          const startCap = readLineCapStyle(annotation.data.lineStartCap, 'none');
          const endCap = readLineCapStyle(
            annotation.data.lineEndCap,
            annotation.type === 'arrow' ? 'arrow' : 'none',
          );

          page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: strokeWidth,
            color: borderColor,
          });
          drawLineCap(page, startCap, { x: x2, y: y2 }, { x: x1, y: y1 }, borderColor, strokeWidth, lib);
          drawLineCap(page, endCap, { x: x1, y: y1 }, { x: x2, y: y2 }, borderColor, strokeWidth, lib);
        }
        continue;
      }

      if (annotation.type === 'callout') {
        const anchor = readPoint(annotation.data.anchor);
        const knee = readPoint(annotation.data.knee);
        const leaderStyle = annotation.data.leaderStyle === 'straight' ? 'straight' : 'elbow';
        const arrowHead = annotation.data.arrowHead === 'filled'
          ? 'filled'
          : annotation.data.arrowHead === 'none'
            ? 'none'
            : 'open';

        if (anchor && borderColor) {
          const route = computeCalloutPath(anchor, annotation.rect, {
            leaderStyle,
            kneePoint: knee,
          });

          for (let index = 0; index < route.points.length - 1; index += 1) {
            const start = route.points[index];
            const end = route.points[index + 1];
            page.drawLine({
              start: { x: start.x, y: page.getHeight() - start.y },
              end: { x: end.x, y: page.getHeight() - end.y },
              thickness: strokeWidth,
              color: borderColor,
            });
          }

          if (arrowHead !== 'none' && route.points.length >= 2) {
            const from = route.points[route.points.length - 2];
            const to = route.points[route.points.length - 1];
            drawArrowHead(
              page,
              from.x,
              page.getHeight() - from.y,
              to.x,
              page.getHeight() - to.y,
              borderColor,
              strokeWidth,
              arrowHead,
              lib,
            );
          }
        }

        page.drawRectangle({
          x,
          y,
          width: annotation.rect.width,
          height: annotation.rect.height,
          color: fillColor,
          opacity: typeof annotation.data.opacity === 'number' ? annotation.data.opacity : 0.8,
          borderWidth: typeof annotation.data.borderWidth === 'number' ? annotation.data.borderWidth : 1,
          borderColor,
        });

        if (text) {
          page.drawText(text, {
            x: x + 6,
            y: y + Math.max(8, annotation.rect.height - 18),
            font: helvetica,
            size: typeof annotation.data.fontSize === 'number' ? annotation.data.fontSize : 12,
            color:
              typeof annotation.data.textColor === 'string'
                ? hexToRgb(annotation.data.textColor, lib)
                : rgb(0.12, 0.12, 0.12),
            maxWidth: Math.max(20, annotation.rect.width - 12),
            rotate:
              typeof annotation.data.rotation === 'number'
                ? degrees(annotation.data.rotation)
                : undefined,
          });
        }
        continue;
      }

      if (annotation.type === 'sticky-note') {
        const isCollapsed = annotation.data.isCollapsed !== false;
        if (isCollapsed) {
          page.drawRectangle({
            x, y,
            width: annotation.rect.width,
            height: annotation.rect.height,
            color: fillColor ?? rgb(1, 0.9, 0),
            opacity: 1,
            borderWidth: 1,
            borderColor: borderColor ?? rgb(0.9, 0.8, 0),
          });
        } else {
          page.drawRectangle({
            x, y,
            width: annotation.rect.width,
            height: annotation.rect.height,
            color: fillColor ?? rgb(1, 0.98, 0.8),
            opacity: 1,
            borderWidth: 1,
            borderColor: borderColor ?? rgb(0.9, 0.8, 0),
          });
          if (text) {
            page.drawText(text, {
              x: x + 6,
              y: y + Math.max(8, annotation.rect.height - 24),
              font: helvetica,
              size: typeof annotation.data.fontSize === 'number' ? annotation.data.fontSize : 10,
              color: typeof annotation.data.textColor === 'string' ? hexToRgb(annotation.data.textColor, lib) : rgb(0.12, 0.12, 0.12),
              maxWidth: Math.max(20, annotation.rect.width - 12),
            });
          }
        }
        continue;
      }

      if (text) {
        page.drawRectangle({
          x,
          y,
          width: annotation.rect.width,
          height: annotation.rect.height,
          color: fillColor,
          opacity: typeof annotation.data.opacity === 'number' ? annotation.data.opacity : 0.75,
          borderWidth: strokeWidth,
          borderColor,
        });

        page.drawText(text, {
          x: x + 6,
          y: y + Math.max(8, annotation.rect.height - 18),
          font: helvetica,
          size: typeof annotation.data.fontSize === 'number' ? annotation.data.fontSize : 12,
          color:
            typeof annotation.data.textColor === 'string'
              ? hexToRgb(annotation.data.textColor, lib)
              : annotation.type === 'stamp'
              ? rgb(0.75, 0.1, 0.1)
              : rgb(0.12, 0.12, 0.12),
          maxWidth: Math.max(20, annotation.rect.width - 12),
          rotate:
            typeof annotation.data.rotation === 'number'
              ? degrees(annotation.data.rotation)
              : undefined,
        });
      }
    }

    return await pdfDoc.save();
  }
}

