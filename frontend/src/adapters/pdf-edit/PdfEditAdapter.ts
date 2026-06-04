import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import type { PdfAnnotation, Point2D } from '@/core/annotations/types';
import { readFillColor, readStrokeColor, readStrokeWidth } from '@/core/annotations/readers';
import { computeCalloutPath } from '@/core/annotations/callout-geometry';

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
};

function normalizePageIndices(pageIndices: number[]): number[] {
  return Array.from(new Set(pageIndices)).sort((a, b) => a - b);
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
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
  return rgb(red, green, blue);
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
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: ReturnType<typeof rgb>,
  thickness: number,
  style: 'open' | 'filled',
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = Math.max(8, thickness * 4);

  const leftX = x2 - headLength * Math.cos(angle - Math.PI / 6);
  const leftY = y2 - headLength * Math.sin(angle - Math.PI / 6);
  const rightX = x2 - headLength * Math.cos(angle + Math.PI / 6);
  const rightY = y2 - headLength * Math.sin(angle + Math.PI / 6);

  if (style === 'filled') {
    page.drawSvgPath(
      `M ${x2} ${y2} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`,
      {
        color,
        borderColor: color,
        borderWidth: Math.max(0.5, thickness * 0.5),
      },
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
  page: PDFPage,
  cap: LineCapStyle,
  from: Point2D,
  to: Point2D,
  color: ReturnType<typeof rgb>,
  thickness: number,
): void {
  if (cap === 'none') {
    return;
  }

  if (cap === 'arrow') {
    drawArrowHead(page, from.x, from.y, to.x, to.y, color, thickness, 'filled');
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
  static async countPages(bytes: Uint8Array): Promise<number> {
    const pdfDoc = await PDFDocument.load(bytes);
    return pdfDoc.getPageCount();
  }

  static async getPageSize(
    bytes: Uint8Array,
    pageIndex: number,
  ): Promise<{ width: number; height: number }> {
    const pdfDoc = await PDFDocument.load(bytes);
    const page = pdfDoc.getPage(pageIndex);
    return { width: page.getWidth(), height: page.getHeight() };
  }

  static async merge(baseBytes: Uint8Array, appendDocs: Uint8Array[]): Promise<Uint8Array> {
    const out = await PDFDocument.load(baseBytes);

    for (const docBytes of appendDocs) {
      const src = await PDFDocument.load(docBytes);
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach((page) => out.addPage(page));
    }

    return await out.save();
  }

  static async insertAt(baseBytes: Uint8Array, insertBytes: Uint8Array, atIndex: number): Promise<Uint8Array> {
    const baseDoc = await PDFDocument.load(baseBytes);
    const insertDoc = await PDFDocument.load(insertBytes);
    const copied = await baseDoc.copyPages(insertDoc, insertDoc.getPageIndices());

    let targetIndex = Math.max(0, Math.min(atIndex, baseDoc.getPageCount()));
    copied.forEach((page) => {
      baseDoc.insertPage(targetIndex, page);
      targetIndex += 1;
    });

    return await baseDoc.save();
  }

  static async insertBlankPage(
    baseBytes: Uint8Array,
    atIndex: number,
    size: { width: number; height: number },
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(baseBytes);
    pdfDoc.insertPage(Math.max(0, Math.min(atIndex, pdfDoc.getPageCount())), [size.width, size.height]);
    return await pdfDoc.save();
  }

  static async replacePage(
    baseBytes: Uint8Array,
    targetIndex: number,
    donorBytes: Uint8Array,
    donorPageIndex: number,
  ): Promise<Uint8Array> {
    const baseDoc = await PDFDocument.load(baseBytes);
    const donorDoc = await PDFDocument.load(donorBytes);
    const outDoc = await PDFDocument.create();

    const donorCopied = await outDoc.copyPages(donorDoc, [donorPageIndex]);
    const replacement = donorCopied[0];

    for (const index of baseDoc.getPageIndices()) {
      if (index === targetIndex) {
        outDoc.addPage(replacement);
      } else {
        const [copied] = await outDoc.copyPages(baseDoc, [index]);
        outDoc.addPage(copied);
      }
    }

    return await outDoc.save();
  }

  static async extractPages(baseBytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.load(baseBytes);
    const outDoc = await PDFDocument.create();
    const normalized = normalizePageIndices(pageIndices);
    const copied = await outDoc.copyPages(srcDoc, normalized);
    copied.forEach((page) => outDoc.addPage(page));
    return await outDoc.save();
  }

  static async removePages(baseBytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.load(baseBytes);
    const toRemove = new Set(normalizePageIndices(pageIndices));
    const keepIndices = srcDoc.getPageIndices().filter((index) => !toRemove.has(index));

    if (keepIndices.length === 0) {
      throw new Error('Cannot remove all pages from the document');
    }

    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(srcDoc, keepIndices);
    copied.forEach((page) => outDoc.addPage(page));
    return await outDoc.save();
  }

  static async duplicatePages(baseBytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.load(baseBytes);
    const selected = new Set(normalizePageIndices(pageIndices));

    const order: number[] = [];
    srcDoc.getPageIndices().forEach((index) => {
      order.push(index);
      if (selected.has(index)) {
        order.push(index);
      }
    });

    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(srcDoc, order);
    copied.forEach((page) => outDoc.addPage(page));
    return await outDoc.save();
  }

  static async rotatePages(
    baseBytes: Uint8Array,
    pageIndices: number[],
    deltaDegrees: number,
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(baseBytes);
    const selected = new Set(normalizePageIndices(pageIndices));

    pdfDoc.getPages().forEach((page, index) => {
      if (!selected.has(index)) {
        return;
      }
      const nextRotation = (page.getRotation().angle + deltaDegrees + 360) % 360;
      page.setRotation(degrees(nextRotation));
    });

    return await pdfDoc.save();
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

  static async reorderPages(baseBytes: Uint8Array, order: number[]): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.load(baseBytes);
    const pageCount = srcDoc.getPageCount();

    if (order.length !== pageCount) {
      throw new Error('Reorder list length does not match page count');
    }

    const sorted = [...order].sort((a, b) => a - b);
    for (let index = 0; index < pageCount; index += 1) {
      if (sorted[index] !== index) {
        throw new Error('Reorder list is not a valid page permutation');
      }
    }

    const out = await PDFDocument.create();
    const copied = await out.copyPages(srcDoc, order);
    copied.forEach((page) => out.addPage(page));
    return await out.save();
  }

  static async addHeaderFooterText(
    baseBytes: Uint8Array,
    options: HeaderFooterOptions,
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(baseBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const totalPages = pdfDoc.getPageCount();

    for (const pageIndex of options.pages) {
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
        color: hexToRgb(options.color),
        opacity: options.opacity,
      });
    }

    return await pdfDoc.save();
  }

  static async drawTextOnPages(
    baseBytes: Uint8Array,
    options: DrawTextOptions,
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(baseBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const totalPages = pdfDoc.getPageCount();

    for (const pageIndex of options.pages) {
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
        color: hexToRgb(options.color),
        opacity: options.opacity,
        rotate: options.rotation !== undefined ? degrees(options.rotation) : undefined,
      });
    }

    return await pdfDoc.save();
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
    }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(baseBytes);
    const image = options.mimeType === 'image/jpeg'
      ? await pdfDoc.embedJpg(options.imageBytes)
      : await pdfDoc.embedPng(options.imageBytes);

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
      const page = pdfDoc.getPage(pageIndex);
      const pageHeight = page.getHeight();
      const drawY = pageHeight - options.y - drawHeight;
      page.drawImage(image, { x: options.x, y: drawY, width: drawWidth, height: drawHeight });
    }

    return await pdfDoc.save();
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
    },
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(baseBytes);
    const fill = hexToRgb(options.fillColor);

    for (const pageIndex of options.pages) {
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

    return await pdfDoc.save();
  }

  static async rotatePage(baseBytes: Uint8Array, pageIndex: number, deltaDegrees: number): Promise<Uint8Array> {
    return this.rotatePages(baseBytes, [pageIndex], deltaDegrees);
  }

  static async deletePage(baseBytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
    return this.removePages(baseBytes, [pageIndex]);
  }

  static async exportWithAnnotations(baseBytes: Uint8Array, annotations: PdfAnnotation[]): Promise<Uint8Array> {
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
      const borderColor = borderColorHex === 'transparent' ? undefined : hexToRgb(borderColorHex);
      const fillColor = fillColorHex === 'transparent' ? undefined : hexToRgb(fillColorHex);

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
          drawLineCap(page, startCap, { x: x2, y: y2 }, { x: x1, y: y1 }, borderColor, strokeWidth);
          drawLineCap(page, endCap, { x: x1, y: y1 }, { x: x2, y: y2 }, borderColor, strokeWidth);
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
                ? hexToRgb(annotation.data.textColor)
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
              color: typeof annotation.data.textColor === 'string' ? hexToRgb(annotation.data.textColor) : rgb(0.12, 0.12, 0.12),
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
              ? hexToRgb(annotation.data.textColor)
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

