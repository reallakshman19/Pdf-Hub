import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type ContentBlock =
  | {
      type: 'heading';
      text: string;
      fontSize?: number;
      color?: string;
    }
  | {
      type: 'paragraph' | 'text';
      text: string;
      fontSize?: number;
      color?: string;
    }
  | {
      type: 'spacer';
      height: number;
    }
  | {
      type: 'table';
      rows: string[][];
      fontSize?: number;
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
      });
      cursorY -= 12;
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
    });
  }

  return await pdfDoc.save();
}

function drawWrappedText(args: {
  page: Parameters<typeof drawSimpleTable>[0]['page'];
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  font: Parameters<typeof drawSimpleTable>[0]['font'];
  fontSize: number;
  color: string;
}): number {
  const lines = wrapText(args.text, args.font, args.fontSize, args.maxWidth);
  let y = args.y;

  for (const line of lines) {
    args.page.drawText(line, {
      x: args.x,
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

function drawSimpleTable(args: {
  page: Parameters<PDFDocument['addPage']>[0] extends never ? never : ReturnType<PDFDocument['addPage']>;
  rows: string[][];
  x: number;
  y: number;
  width: number;
  font: Awaited<ReturnType<PDFDocument['embedFont']>>;
  fontSize: number;
}): number {
  const columnCount = Math.max(1, ...args.rows.map((row) => row.length));
  const columnWidth = args.width / columnCount;
  const rowHeight = Math.max(18, args.fontSize * 2.4);
  let y = args.y;

  args.rows.forEach((row, rowIndex) => {
    const isHeader = rowIndex === 0;

    row.forEach((cell, columnIndex) => {
      const x = args.x + columnIndex * columnWidth;

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
        maxWidth: columnWidth - 8,
      });
    });

    y -= rowHeight;
  });

  return y;
}

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
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