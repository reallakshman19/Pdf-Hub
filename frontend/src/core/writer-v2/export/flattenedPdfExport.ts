import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFPage,
  type PDFFont,
} from 'pdf-lib';
import type {
  PdfPoint,
  PdfRect,
  WriterElementV2,
} from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';

export interface FlattenWriterExportInput {
  pdfBytes: Uint8Array;
  elements: WriterElementV2[];
  assets?: WriterAssetRecordV2[];
}

export interface FlattenWriterExportResult {
  bytes: Uint8Array;
  pageCount: number;
  flattenedElementCount: number;
  embeddedAssetCount: number;
}

interface DrawContext {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  assetsById: Map<string, WriterAssetRecordV2>;
  embeddedAssetIds: Set<string>;
}

const DEFAULT_FONT_SIZE = 11;
const DEFAULT_LINE_HEIGHT = 14;

export async function exportFlattenedWriterPdf(
  input: FlattenWriterExportInput,
): Promise<FlattenWriterExportResult> {
  const doc = await PDFDocument.load(input.pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const assetsById = new Map((input.assets ?? []).map((asset) => [asset.id, asset]));
  const embeddedAssetIds = new Set<string>();

  const elements = input.elements
    .filter((element) => !element.hidden)
    .slice()
    .sort((a, b) => a.style.zIndex - b.style.zIndex);

  for (const element of elements) {
    const page = pages[element.pageIndex];

    if (!page) continue;

    await drawWriterElement({
      doc,
      page,
      font,
      assetsById,
      embeddedAssetIds,
    }, element);
  }

  return {
    bytes: await doc.save(),
    pageCount: pages.length,
    flattenedElementCount: elements.length,
    embeddedAssetCount: embeddedAssetIds.size,
  };
}

async function drawWriterElement(
  context: DrawContext,
  element: WriterElementV2,
): Promise<void> {
  const rect = normalizeRect(element.rect);

  if (element.type === 'textCallout') {
    drawCalloutLeader(context.page, element, rect);
  }

  drawBoxBackground(context.page, element, rect);
  await drawElementImages(context, element, rect);
  drawElementText(context.page, context.font, element, rect);
}

function drawBoxBackground(
  page: PDFPage,
  element: WriterElementV2,
  rect: PdfRect,
): void {
  const background = parseCssColor(element.style.backgroundColor, {
    r: 1,
    g: 1,
    b: 1,
  });
  const border = parseCssColor(element.style.borderColor, {
    r: 0.15,
    g: 0.39,
    b: 0.92,
  });

  if ((element.style.opacity ?? 1) > 0 && element.style.backgroundColor !== 'transparent') {
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: rgb(background.r, background.g, background.b),
      opacity: clamp(element.style.opacity ?? 1, 0, 1),
    });
  }

  const borderWidth = element.style.borderWidth ?? 1;

  if (borderWidth > 0 && element.style.borderColor !== 'transparent') {
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      borderColor: rgb(border.r, border.g, border.b),
      borderWidth,
    });
  }
}

function drawElementText(
  page: PDFPage,
  font: PDFFont,
  element: WriterElementV2,
  rect: PdfRect,
): void {
  const text = (element.plainText ?? '').trim();

  if (!text) return;

  const padding = element.style.padding ?? 8;
  const fontSize = DEFAULT_FONT_SIZE;
  const lineHeight = DEFAULT_LINE_HEIGHT;
  const maxWidth = Math.max(1, rect.width - padding * 2);
  const lines = wrapText(text, font, fontSize, maxWidth);
  const topY = rect.y + rect.height - padding - fontSize;

  for (const [index, line] of lines.entries()) {
    const y = topY - index * lineHeight;

    if (y < rect.y + padding) break;

    page.drawText(line, {
      x: rect.x + padding,
      y,
      size: fontSize,
      font,
      color: rgb(0.07, 0.09, 0.15),
      maxWidth,
    });
  }
}

async function drawElementImages(
  context: DrawContext,
  element: WriterElementV2,
  rect: PdfRect,
): Promise<void> {
  const assetIds = [
    ...(element.imageAssetId ? [element.imageAssetId] : []),
    ...(element.assetIds ?? []),
  ];

  if (assetIds.length === 0) return;

  const padding = element.style.padding ?? 8;
  let imageY = rect.y + padding;

  for (const assetId of assetIds) {
    const asset = context.assetsById.get(assetId);

    if (!asset || !asset.dataUrl.startsWith('data:image/')) continue;

    const imageBytes = dataUrlToBytes(asset.dataUrl);
    const image = asset.mimeType.includes('png')
      ? await context.doc.embedPng(imageBytes)
      : await context.doc.embedJpg(imageBytes);

    const maxWidth = Math.max(1, rect.width - padding * 2);
    const maxHeight = Math.max(1, rect.height / 2);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;

    context.page.drawImage(image, {
      x: rect.x + padding,
      y: imageY,
      width,
      height,
    });

    imageY += height + 4;
    context.embeddedAssetIds.add(asset.id);
  }
}

function drawCalloutLeader(
  page: PDFPage,
  element: WriterElementV2,
  rect: PdfRect,
): void {
  const callout = element.callout;

  if (!callout?.anchorPoint || callout.leaderStyle === 'none') return;

  const border = parseCssColor(callout.leaderColor, {
    r: 0.28,
    g: 0.33,
    b: 0.41,
  });

  const target = nearestRectEdgePoint(callout.anchorPoint, rect);

  page.drawLine({
    start: {
      x: callout.anchorPoint.x,
      y: callout.anchorPoint.y,
    },
    end: {
      x: target.x,
      y: target.y,
    },
    thickness: callout.leaderWidth,
    color: rgb(border.r, border.g, border.b),
  });

  if (callout.leaderStyle === 'arrow') {
    drawArrowHead(page, callout.anchorPoint, target, callout.leaderWidth, border);
  }
}

function drawArrowHead(
  page: PDFPage,
  anchor: PdfPoint,
  target: PdfPoint,
  width: number,
  color: { r: number; g: number; b: number },
): void {
  const angle = Math.atan2(anchor.y - target.y, anchor.x - target.x);
  const size = Math.max(6, width * 5);
  const p1 = {
    x: anchor.x - Math.cos(angle - Math.PI / 6) * size,
    y: anchor.y - Math.sin(angle - Math.PI / 6) * size,
  };
  const p2 = {
    x: anchor.x - Math.cos(angle + Math.PI / 6) * size,
    y: anchor.y - Math.sin(angle + Math.PI / 6) * size,
  };

  page.drawLine({
    start: anchor,
    end: p1,
    thickness: width,
    color: rgb(color.r, color.g, color.b),
  });

  page.drawLine({
    start: anchor,
    end: p2,
    thickness: width,
    color: rgb(color.r, color.g, color.b),
  });
}

function nearestRectEdgePoint(anchor: PdfPoint, rect: PdfRect): PdfPoint {
  const center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };

  const dx = center.x - anchor.x;
  const dy = center.y - anchor.y;

  if (dx === 0 && dy === 0) {
    return {
      x: rect.x,
      y: rect.y + rect.height / 2,
    };
  }

  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const tx = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const t = Math.min(tx, ty);

  return {
    x: center.x - dx * t,
    y: center.y - dy * t,
  };
}

function normalizeRect(rect: PdfRect): PdfRect {
  const x1 = Math.min(rect.x, rect.x + rect.width);
  const x2 = Math.max(rect.x, rect.x + rect.width);
  const y1 = Math.min(rect.y, rect.y + rect.height);
  const y2 = Math.max(rect.y, rect.y + rect.height);

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const output: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      output.push('');
      continue;
    }

    let line = '';

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);

      if (width <= maxWidth || !line) {
        line = candidate;
        continue;
      }

      output.push(line);
      line = word;
    }

    if (line) output.push(line);
  }

  return output;
}

function parseCssColor(
  value: string | undefined,
  fallback: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  if (!value || value === 'transparent') return fallback;

  const hex = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(1, 3), 16) / 255,
      g: Number.parseInt(hex.slice(3, 5), 16) / 255,
      b: Number.parseInt(hex.slice(5, 7), 16) / 255,
    };
  }

  const rgbMatch = hex.match(/^rgba?\(([^)]+)\)$/i);

  if (rgbMatch) {
    const [r, g, b] = rgbMatch[1]
      .split(',')
      .slice(0, 3)
      .map((part) => Number.parseFloat(part.trim()) / 255);

    if ([r, g, b].every((part) => Number.isFinite(part))) {
      return { r, g, b };
    }
  }

  return fallback;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];

  if (!base64) {
    throw new Error('Invalid image data URL.');
  }

  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
