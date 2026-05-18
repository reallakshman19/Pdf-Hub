import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from 'pdf-lib';

export type TextAlign = 'left' | 'center' | 'right';

export type ContentBlock =
  | {
      type: 'heading';
      text: string;
      fontSize?: number;
      color?: string;
      align?: TextAlign;
    }
  | {
      type: 'paragraph' | 'text';
      text: string;
      fontSize?: number;
      color?: string;
      align?: TextAlign;
    }
  | {
      type: 'spacer';
      height: number;
    }
  | {
      type: 'table';
      rows: string[][];
      fontSize?: number;
      columnWidths?: number[];
    }
  | {
      type: 'separator';
      color?: string;
      thickness?: number;
      marginTop?: number;
      marginBottom?: number;
    }
  | {
      type: 'list';
      items: string[];
      ordered?: boolean;
      fontSize?: number;
      color?: string;
      indent?: number;
    }
  | {
      type: 'signatureLine';
      label?: string;
      width?: number;
      color?: string;
      marginTop?: number;
    };

export type PageSizeName = 'a4' | 'letter';

export interface ContentPageOptions {
  size?: PageSizeName;
  background?: string;
  blocks: ContentBlock[];
}

export interface ImageHeaderPageOptions {
  size?: PageSizeName;
  imageSrc: string;
  headerHeight?: number;
  title: string;
  subtitle?: string;
  bodyMarkdown?: string;
}

export function getPageSizePoints(size: PageSizeName = 'a4'): {
  width: number;
  height: number;
} {
  if (size === 'letter') {
    return {
      width: 612,
      height: 792,
    };
  }

  return {
    width: 595,
    height: 842,
  };
}

export async function buildContentPagePdf(
  options: ContentPageOptions,
): Promise<Uint8Array> {
  const pageSize = getPageSizePoints(options.size);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  if (options.background) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageSize.width,
      height: pageSize.height,
      color: hexToRgb(options.background),
    });
  }

  let cursorY = pageSize.height - 54;
  const marginX = 54;
  const maxWidth = pageSize.width - marginX * 2;

  for (const block of options.blocks) {
    if (block.type === 'spacer') {
      cursorY -= Math.max(0, block.height);
      continue;
    }

    if (block.type === 'heading') {
      const fontSize = block.fontSize ?? 18;
      cursorY = drawWrappedText({
        page,
        text: block.text,
        x: marginX,
        y: cursorY,
        maxWidth,
        font: boldFont,
        fontSize,
        color: block.color ?? '#111827',
        align: block.align ?? 'left',
      });
      cursorY -= 12;
      continue;
    }

    if (block.type === 'paragraph' || block.type === 'text') {
      const fontSize = block.fontSize ?? 11;
      cursorY = drawWrappedText({
        page,
        text: block.text,
        x: marginX,
        y: cursorY,
        maxWidth,
        font: regularFont,
        fontSize,
        color: block.color ?? '#111827',
        align: block.align ?? 'left',
      });
      cursorY -= 10;
      continue;
    }

    if (block.type === 'table') {
      const fontSize = block.fontSize ?? 9;
      cursorY = drawSimpleTable({
        page,
        rows: block.rows,
        x: marginX,
        y: cursorY,
        width: maxWidth,
        font: regularFont,
        fontSize,
        columnWidths: block.columnWidths,
      });
      cursorY -= 12;
      continue;
    }

    if (block.type === 'separator') {
      cursorY = drawSeparator({
        page,
        x: marginX,
        y: cursorY,
        width: maxWidth,
        color: block.color ?? '#CBD5E1',
        thickness: block.thickness ?? 1,
        marginTop: block.marginTop ?? 8,
        marginBottom: block.marginBottom ?? 12,
      });
      continue;
    }

    if (block.type === 'list') {
      cursorY = drawList({
        page,
        items: block.items,
        ordered: block.ordered ?? false,
        x: marginX,
        y: cursorY,
        maxWidth,
        font: regularFont,
        fontSize: block.fontSize ?? 11,
        color: block.color ?? '#111827',
        indent: block.indent ?? 18,
      });
      cursorY -= 8;
      continue;
    }

    if (block.type === 'signatureLine') {
      cursorY = drawSignatureLine({
        page,
        x: marginX,
        y: cursorY,
        font: regularFont,
        label: block.label ?? 'Signature',
        width: block.width ?? 180,
        color: block.color ?? '#64748B',
        marginTop: block.marginTop ?? 24,
      });
      cursorY -= 12;
      continue;
    }
  }

  return await pdfDoc.save();
}

export async function buildImageHeaderPagePdf(
  options: ImageHeaderPageOptions,
): Promise<Uint8Array> {
  const pageSize = getPageSizePoints(options.size);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const headerHeight = Math.max(80, Math.min(options.headerHeight ?? 180, pageSize.height * 0.45));
  const image = parseDataImage(options.imageSrc);

  const embeddedImage =
    image.mimeType === 'image/jpeg'
      ? await pdfDoc.embedJpg(image.bytes)
      : await pdfDoc.embedPng(image.bytes);

  page.drawRectangle({
    x: 0,
    y: pageSize.height - headerHeight,
    width: pageSize.width,
    height: headerHeight,
    color: rgb(0.96, 0.97, 0.99),
  });

  const imageMaxWidth = pageSize.width * 0.34;
  const imageMaxHeight = headerHeight - 36;
  const imageScale = Math.min(
    imageMaxWidth / embeddedImage.width,
    imageMaxHeight / embeddedImage.height,
  );
  const imageWidth = embeddedImage.width * imageScale;
  const imageHeight = embeddedImage.height * imageScale;

  page.drawImage(embeddedImage, {
    x: 36,
    y: pageSize.height - headerHeight + (headerHeight - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight,
  });

  page.drawText(options.title, {
    x: 54 + imageMaxWidth,
    y: pageSize.height - 70,
    font: boldFont,
    size: 20,
    color: rgb(0.07, 0.09, 0.16),
    maxWidth: pageSize.width - imageMaxWidth - 90,
  });

  if (options.subtitle) {
    page.drawText(options.subtitle, {
      x: 54 + imageMaxWidth,
      y: pageSize.height - 98,
      font: regularFont,
      size: 11,
      color: rgb(0.25, 0.29, 0.36),
      maxWidth: pageSize.width - imageMaxWidth - 90,
    });
  }

  if (options.bodyMarkdown?.trim()) {
    drawWrappedText({
      page,
      text: markdownToPlainText(options.bodyMarkdown),
      x: 54,
      y: pageSize.height - headerHeight - 42,
      maxWidth: pageSize.width - 108,
      font: regularFont,
      fontSize: 11,
      color: '#111827',
      align: 'left',
    });
  }

  return await pdfDoc.save();
}

function resolveAlignedX(args: {
  x: number;
  maxWidth: number;
  lineWidth: number;
  align?: TextAlign;
}): number {
  if (args.align === 'center') {
    return Math.max(args.x, args.x + (args.maxWidth - args.lineWidth) / 2);
  }

  if (args.align === 'right') {
    return Math.max(args.x, args.x + args.maxWidth - args.lineWidth);
  }

  return args.x;
}

function drawWrappedText(args: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  font: PDFFont;
  fontSize: number;
  color: string;
  align?: TextAlign;
}): number {
  const lines = wrapText(args.text, args.font, args.fontSize, args.maxWidth);
  let y = args.y;

  for (const line of lines) {
    const lineWidth = args.font.widthOfTextAtSize(line, args.fontSize);
    const drawX = resolveAlignedX({
      x: args.x,
      maxWidth: args.maxWidth,
      lineWidth,
      align: args.align ?? 'left',
    });

    args.page.drawText(line, {
      x: drawX,
      y,
      font: args.font,
      size: args.fontSize,
      color: hexToRgb(args.color),
      maxWidth: args.maxWidth,
    });

    y -= args.fontSize * 1.35;
  }

  return y;
}

function drawSeparator(args: {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  color: string;
  thickness: number;
  marginTop: number;
  marginBottom: number;
}): number {
  const safeThickness = Math.max(0.25, args.thickness);
  const lineY = args.y - Math.max(0, args.marginTop);

  args.page.drawLine({
    start: { x: args.x, y: lineY },
    end: { x: args.x + args.width, y: lineY },
    thickness: safeThickness,
    color: hexToRgb(args.color),
  });

  return lineY - Math.max(0, args.marginBottom);
}

function drawList(args: {
  page: PDFPage;
  items: string[];
  ordered: boolean;
  x: number;
  y: number;
  maxWidth: number;
  font: PDFFont;
  fontSize: number;
  color: string;
  indent: number;
}): number {
  if (args.items.length === 0) {
    return args.y;
  }

  const safeIndent = Math.max(10, args.indent);
  const markerWidth = safeIndent - 4;
  const textX = args.x + safeIndent;
  const textWidth = Math.max(20, args.maxWidth - safeIndent);
  let y = args.y;

  args.items.forEach((item, index) => {
    const marker = args.ordered ? `${index + 1}.` : '-';

    args.page.drawText(marker, {
      x: args.x,
      y,
      font: args.font,
      size: args.fontSize,
      color: hexToRgb(args.color),
      maxWidth: markerWidth,
    });

    const afterTextY = drawWrappedText({
      page: args.page,
      text: item,
      x: textX,
      y,
      maxWidth: textWidth,
      font: args.font,
      fontSize: args.fontSize,
      color: args.color,
      align: 'left',
    });

    y = afterTextY - 4;
  });

  return y;
}

function drawSignatureLine(args: {
  page: PDFPage;
  x: number;
  y: number;
  font: PDFFont;
  label: string;
  width: number;
  color: string;
  marginTop: number;
}): number {
  const safeWidth = Math.max(60, args.width);
  const lineY = args.y - Math.max(0, args.marginTop);

  args.page.drawLine({
    start: { x: args.x, y: lineY },
    end: { x: args.x + safeWidth, y: lineY },
    thickness: 0.75,
    color: hexToRgb(args.color),
  });

  args.page.drawText(args.label, {
    x: args.x,
    y: lineY - 13,
    font: args.font,
    size: 9,
    color: hexToRgb(args.color),
    maxWidth: safeWidth,
  });

  return lineY - 24;
}

function resolveTableColumnWidths(args: {
  totalWidth: number;
  columnCount: number;
  columnWidths?: number[];
}): number[] {
  const fallback = Array.from(
    { length: args.columnCount },
    () => args.totalWidth / args.columnCount,
  );

  if (
    !args.columnWidths ||
    args.columnWidths.length !== args.columnCount ||
    args.columnWidths.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    return fallback;
  }

  const totalWeight = args.columnWidths.reduce((sum, value) => sum + value, 0);

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return fallback;
  }

  return args.columnWidths.map((weight) => (weight / totalWeight) * args.totalWidth);
}

function drawSimpleTable(args: {
  page: PDFPage;
  rows: string[][];
  x: number;
  y: number;
  width: number;
  font: PDFFont;
  fontSize: number;
  columnWidths?: number[];
}): number {
  const columnCount = Math.max(1, ...args.rows.map((row) => row.length));
  const columnWidths = resolveTableColumnWidths({
    totalWidth: args.width,
    columnCount,
    columnWidths: args.columnWidths,
  });
  const rowHeight = Math.max(18, args.fontSize * 2.4);
  let y = args.y;

  args.rows.forEach((row, rowIndex) => {
    const isHeader = rowIndex === 0;
    let x = args.x;

    row.forEach((cell, columnIndex) => {
      const columnWidth = columnWidths[columnIndex] ?? args.width / columnCount;

      args.page.drawRectangle({
        x,
        y: y - rowHeight + 4,
        width: columnWidth,
        height: rowHeight,
        borderColor: rgb(0.82, 0.84, 0.88),
        borderWidth: 0.75,
        color: isHeader ? rgb(0.94, 0.96, 0.98) : undefined,
      });

      args.page.drawText(String(cell ?? ''), {
        x: x + 4,
        y: y - args.fontSize - 2,
        font: args.font,
        size: args.fontSize,
        color: rgb(0.07, 0.09, 0.16),
        maxWidth: Math.max(1, columnWidth - 8),
      });

      x += columnWidth;
    });

    y -= rowHeight;
  });

  return y;
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\n+/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);

      if (width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }

    if (words.length === 0) {
      lines.push('');
    }
  }

  return lines;
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function parseDataImage(source: string): {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
} {
  const value = source.trim();

  if (/^\s*javascript:/i.test(value)) {
    throw new Error('Unsafe image source blocked: javascript URL.');
  }

  if (/^\s*data:text\/html/i.test(value)) {
    throw new Error('Unsafe image source blocked: data:text/html is not allowed.');
  }

  const match = /^data:(image\/png|image\/jpeg|image\/jpg);base64,(.+)$/i.exec(value);

  if (!match) {
    throw new Error('Image header page requires a data:image/png or data:image/jpeg source.');
  }

  const declaredMime = match[1].toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : match[1].toLowerCase() as 'image/png' | 'image/jpeg';

  const bytes = decodeBase64(match[2]);
  const detectedMime = detectImageMime(bytes);

  if (!detectedMime) {
    throw new Error('Image header page image bytes are not PNG or JPEG.');
  }

  if (declaredMime !== detectedMime) {
    throw new Error(`Image header page declared ${declaredMime} but detected ${detectedMime}.`);
  }

  return {
    bytes,
    mimeType: detectedMime,
  };
}

function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error('Invalid base64 image data.');
  }

  const decoder = globalThis.atob;

  if (typeof decoder !== 'function') {
    throw new Error('Base64 decoder is unavailable in this runtime.');
  }

  const binary = decoder(clean);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function detectImageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  return null;
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const safe = normalizeHex(hex);
  return rgb(
    parseInt(safe.slice(0, 2), 16) / 255,
    parseInt(safe.slice(2, 4), 16) / 255,
    parseInt(safe.slice(4, 6), 16) / 255,
  );
}

function normalizeHex(hex: string): string {
  const normalized = hex.replace('#', '').trim();

  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return normalized
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }

  return '111827';
}
