import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFString,
  rgb,
  StandardFonts,
  type PDFPage,
  type PDFFont,
} from 'pdf-lib';
import { pickStandard14Font } from './fontFamilyResolver';
import type {
  PdfPoint,
  PdfRect,
  WriterElementV2,
  WriterTableBorder,
  WriterTableCell,
  WriterTableCellStyle,
  WriterTableColumn,
  WriterTableData,
} from '../types';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import {
  editorStateToPdfBlocks,
  type PdfBlock,
  type PdfInlineText,
  type PdfTextStyle,
} from './richTextRenderer';

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

interface PendingLinkAnnotation {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
}

interface DrawContext {
  doc: PDFDocument;
  page: PDFPage;
  /** Lazily-populated cache: StandardFonts enum value → embedded PDFFont. */
  fontCache: Map<StandardFonts, PDFFont>;
  /** Fallback element-level font family (from element.style.fontFamily). */
  elementFontFamily: string | undefined;
  assetsById: Map<string, WriterAssetRecordV2>;
  embeddedAssetIds: Set<string>;
  pendingLinks: PendingLinkAnnotation[];
}

const DEFAULT_FONT_SIZE = 11;

export async function exportFlattenedWriterPdf(
  input: FlattenWriterExportInput,
): Promise<FlattenWriterExportResult> {
  const doc = await PDFDocument.load(input.pdfBytes);

  // Shared font cache — variants are embedded on first use, reused after.
  const fontCache = new Map<StandardFonts, PDFFont>();

  const pages = doc.getPages();
  const assetsById = new Map((input.assets ?? []).map((asset) => [asset.id, asset]));
  const embeddedAssetIds = new Set<string>();
  const pendingLinks: PendingLinkAnnotation[] = [];

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
      fontCache,
      elementFontFamily: element.style.fontFamily,
      assetsById,
      embeddedAssetIds,
      pendingLinks,
    }, element);
  }

  // Emit PDF URI link annotations collected during drawing.
  for (const link of pendingLinks) {
    registerLinkAnnotation(doc, link);
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

  if (element.type === 'imageBox') {
    await drawImageBox(context, element, rect);
    return;
  }

  if (element.type === 'tableBox') {
    await drawTableBox(context, element, rect);
    return;
  }

  if (element.type === 'textCallout') {
    drawCalloutLeader(context.page, element, rect);
  }

  drawBoxBackground(context.page, element, rect);

  const padding = element.style.padding ?? 8;
  const blocks = editorStateToPdfBlocks(element.editorStateJson, element.plainText ?? '');

  const startY = rect.y + rect.height - padding - DEFAULT_FONT_SIZE;
  await drawRichBlocks(context, blocks, rect, padding, DEFAULT_FONT_SIZE, startY);

  // Draw any standalone attached assets that weren't embedded in rich text blocks
  const assetIds = [
    ...(element.imageAssetId ? [element.imageAssetId] : []),
    ...(element.assetIds ?? []),
  ];
  let imageY = rect.y + padding;
  for (const assetId of assetIds) {
    if (context.embeddedAssetIds.has(assetId)) continue;
    const asset = context.assetsById.get(assetId);
    if (!asset || !asset.dataUrl.startsWith('data:image/')) continue;
    try {
      const imageBytes = dataUrlToBytes(asset.dataUrl);
      const isPng = asset.mimeType.includes('png');
      const image = isPng
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
    } catch {
      // ignore
    }
  }
}

async function drawImageBox(
  context: DrawContext,
  element: WriterElementV2,
  rect: PdfRect,
): Promise<void> {
  drawBoxBackground(context.page, element, rect);

  const assetId = element.imageAssetId ?? element.assetIds?.[0];

  if (!assetId) return;

  const asset = context.assetsById.get(assetId);

  if (!asset || !asset.dataUrl.startsWith('data:image/')) {
    return;
  }

  const imageBytes = dataUrlToBytes(asset.dataUrl);
  const image = asset.mimeType.includes('png') || asset.dataUrl.startsWith('data:image/png')
    ? await context.doc.embedPng(imageBytes)
    : await context.doc.embedJpg(imageBytes);

  const padding = element.style.padding ?? 0;
  const maxWidth = Math.max(1, rect.width - padding * 2);
  const maxHeight = Math.max(1, rect.height - padding * 2);
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;

  context.page.drawImage(image, {
    x: rect.x + padding + (maxWidth - width) / 2,
    y: rect.y + padding + (maxHeight - height) / 2,
    width,
    height,
    opacity: clamp(element.style.opacity ?? 1, 0, 1),
  });

  context.embeddedAssetIds.add(asset.id);
}

async function drawTableBox(
  context: DrawContext,
  element: WriterElementV2,
  rect: PdfRect,
): Promise<void> {
  drawBoxBackground(context.page, element, rect);

  const tableData = element.tableData;

  if (!isValidWriterTableData(tableData)) {
    return;
  }

  const hasHeaderRow = tableData.hasHeaderRow !== false;
  const columns = tableData.columns;

  const paddingFallback = element.style.padding ?? 4;
  const headerHeight = hasHeaderRow ? Math.min(28, Math.max(18, rect.height * 0.18)) : 0;
  const bodyHeight = Math.max(1, rect.height - headerHeight);

  const columnWidths = normalizeWriterTableColumnWidths({
    columns,
    totalWidth: rect.width,
    minColumnWidth: 8,
  });

  const bodyRowHeights = normalizeWriterTableRowHeights({
    tableData,
    totalHeight: bodyHeight,
    minRowHeight: 10,
  });

  if (hasHeaderRow) {
    let x = rect.x;
    const y = rect.y + rect.height - headerHeight;

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      const width = columnWidths[columnIndex] ?? rect.width / columns.length;

      const style = resolveFlattenedHeaderCellStyle(
        element,
        tableData,
        column,
      );

      await drawStyledTableCell(context, {
        rect: {
          x,
          y,
          width,
          height: headerHeight,
        },
        text: column.label ?? column.id,
        style,
        fallbackPadding: paddingFallback,
        fallbackFontSize: element.style.fontSize ?? 9,
      });

      x += width;
    }
  }

  const rowBottomY = buildFlattenedTableRowBottomPositions({
    bodyTopY: rect.y + bodyHeight,
    rowHeights: bodyRowHeights,
  });

  const columnX = buildFlattenedTableColumnPositions({
    startX: rect.x,
    columnWidths,
  });

  for (let rowIndex = 0; rowIndex < tableData.rows.length; rowIndex += 1) {
    const row = tableData.rows[rowIndex];

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      const cell = row.cells[columnIndex];

      if (cell?.mergedInto) {
        continue;
      }

      const colSpan = clampFlattenedTableSpan(
        cell?.colSpan,
        columnIndex,
        columns.length,
      );

      const rowSpan = clampFlattenedTableSpan(
        cell?.rowSpan,
        rowIndex,
        tableData.rows.length,
      );

      const x = columnX[columnIndex] ?? rect.x;
      const y = rowBottomY[rowIndex + rowSpan - 1] ?? rect.y;
      const width = sumFlattenedTableSpan(columnWidths, columnIndex, colSpan);
      const height = sumFlattenedTableSpan(bodyRowHeights, rowIndex, rowSpan);

      const style = resolveFlattenedBodyCellStyle(
        element,
        tableData,
        column,
        cell,
      );

      await drawStyledTableCell(context, {
        rect: {
          x,
          y,
          width,
          height,
        },
        text: cell?.text ?? '',
        style,
        fallbackPadding: paddingFallback,
        fallbackFontSize: element.style.fontSize ?? 9,
      });
    }
  }
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

/**
 * Resolve and (if needed) embed the correct Standard-14 font for a text run.
 * Family resolution order: run-level fontFamily → element-level fontFamily → Helvetica.
 * Bold / italic variants are selected within the resolved family.
 */
async function getFontForStyle(
  context: DrawContext,
  style: PdfTextStyle,
): Promise<PDFFont> {
  const family = style.fontFamily ?? context.elementFontFamily;
  const variant = pickStandard14Font(family, !!style.bold, !!style.italic);

  const cached = context.fontCache.get(variant);
  if (cached) return cached;

  const embedded = await context.doc.embedFont(variant);
  context.fontCache.set(variant, embedded);
  return embedded;
}

interface StyledWord {
  text: string;
  style: PdfTextStyle;
  isWhitespace: boolean;
  href?: string;
}

interface StyledLine {
  words: StyledWord[];
  width: number;
  height: number;
}

async function wrapStyledText(
  context: DrawContext,
  children: PdfInlineText[],
  maxWidth: number,
  defaultFontSize: number,
): Promise<StyledLine[]> {
  const words: StyledWord[] = [];
  for (const child of children) {
    const text = child.text;
    const style = child.style;
    const href = child.href;
    let currentWord = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === ' ' || char === '\t' || char === '\n') {
        if (currentWord) {
          words.push({ text: currentWord, style, isWhitespace: false, href });
          currentWord = '';
        }
        words.push({ text: char, style, isWhitespace: true });
      } else {
        currentWord += char;
      }
    }
    if (currentWord) {
      words.push({ text: currentWord, style, isWhitespace: false, href });
    }
  }

  const lines: StyledLine[] = [];
  let currentLineWords: StyledWord[] = [];
  let currentLineWidth = 0;
  let currentLineHeight = defaultFontSize * 1.25;

  for (const word of words) {
    const font = await getFontForStyle(context, word.style);
    const size = word.style.fontSize ?? defaultFontSize;
    const wordWidth = font.widthOfTextAtSize(word.text, size);
    const wordHeight = size * 1.25;

    if (currentLineWidth + wordWidth > maxWidth && currentLineWords.length > 0) {
      lines.push({
        words: currentLineWords,
        width: currentLineWidth,
        height: currentLineHeight,
      });
      if (word.isWhitespace) {
        currentLineWords = [];
        currentLineWidth = 0;
        currentLineHeight = defaultFontSize * 1.25;
      } else {
        currentLineWords = [word];
        currentLineWidth = wordWidth;
        currentLineHeight = wordHeight;
      }
    } else {
      currentLineWords.push(word);
      currentLineWidth += wordWidth;
      currentLineHeight = Math.max(currentLineHeight, wordHeight);
    }
  }

  if (currentLineWords.length > 0) {
    lines.push({
      words: currentLineWords,
      width: currentLineWidth,
      height: currentLineHeight,
    });
  }

  return lines;
}

async function drawRichBlocks(
  context: DrawContext,
  blocks: PdfBlock[],
  rect: PdfRect,
  padding: number,
  defaultFontSize: number,
  startY: number,
): Promise<number> {
  let y = startY;
  const maxWidth = Math.max(1, rect.width - padding * 2);

  for (const block of blocks) {
    if (y < rect.y + padding) break;

    if (block.type === 'paragraph' || block.type === 'heading') {
      const isHeading = block.type === 'heading';
      let headingSize = defaultFontSize;
      if (isHeading) {
        if (block.tag === 'h1') headingSize = 18;
        else if (block.tag === 'h2') headingSize = 14;
        else if (block.tag === 'h3') headingSize = 12;
      }

      if (isHeading) {
        y -= 4;
      }

      const childrenWithHeadingOverrides = block.children.map((child) => {
        if (isHeading) {
          return {
            ...child,
            style: {
              bold: true,
              fontSize: headingSize,
              ...child.style,
            },
          };
        }
        return child;
      });

      const lines = await wrapStyledText(
        context,
        childrenWithHeadingOverrides,
        maxWidth,
        headingSize,
      );

      for (const line of lines) {
        if (y - line.height < rect.y + padding) {
          y = rect.y;
          break;
        }

        let startX = rect.x + padding;
        if (block.type === 'paragraph' && block.indent) {
          startX += block.indent * 12;
        }

        if (block.alignment === 'right') {
          startX = rect.x + rect.width - padding - line.width;
        } else if (block.alignment === 'center') {
          startX = rect.x + padding + (maxWidth - line.width) / 2;
        }

        let currentX = startX;
        for (const word of line.words) {
          const font = await getFontForStyle(context, word.style);
          const size = word.style.fontSize ?? headingSize;
          const wordWidth = font.widthOfTextAtSize(word.text, size);

          if (word.style.backgroundColor && word.style.backgroundColor !== 'transparent') {
            const bg = parseCssColor(word.style.backgroundColor, { r: 1, g: 1, b: 0 });
            context.page.drawRectangle({
              x: currentX,
              y: y - line.height * 0.15,
              width: wordWidth,
              height: size * 1.25,
              color: rgb(bg.r, bg.g, bg.b),
            });
          }

          const textColor = parseCssColor(word.style.color, { r: 0.07, g: 0.09, b: 0.15 });

          context.page.drawText(word.text, {
            x: currentX,
            y: y,
            size,
            font,
            color: rgb(textColor.r, textColor.g, textColor.b),
          });

          if (word.style.underline) {
            context.page.drawLine({
              start: { x: currentX, y: y - 1 },
              end: { x: currentX + wordWidth, y: y - 1 },
              thickness: size * 0.07,
              color: rgb(textColor.r, textColor.g, textColor.b),
            });
          }

          if (word.style.strikethrough) {
            context.page.drawLine({
              start: { x: currentX, y: y + size * 0.35 },
              end: { x: currentX + wordWidth, y: y + size * 0.35 },
              thickness: size * 0.07,
              color: rgb(textColor.r, textColor.g, textColor.b),
            });
          }

          if (word.href) {
            context.pendingLinks.push({
              page: context.page,
              x: currentX,
              y: y - size * 0.2,
              width: wordWidth,
              height: size * 1.3,
              url: word.href,
            });
          }

          currentX += wordWidth;
        }

        y -= line.height + 2;
      }

      y -= 4;
    } else if (block.type === 'list') {
      for (const [index, item] of block.items.entries()) {
        if (y < rect.y + padding) break;

        const indentLevel = item.indent ?? 1;
        const listIndent = indentLevel * 15;
        const itemMaxWidth = maxWidth - listIndent;

        const lines = await wrapStyledText(context, item.children, itemMaxWidth, defaultFontSize);
        if (lines.length === 0) continue;

        const prefix =
          block.listType === 'number'
            ? `${index + 1}. `
            : block.listType === 'check'
            ? item.checked
              ? '☑ '
              : '☐ '
            : '• ';
        const prefixFont = await getFontForStyle(context, { bold: true });
        const prefixWidth = prefixFont.widthOfTextAtSize(prefix, defaultFontSize);
        const prefixX = rect.x + padding + listIndent - prefixWidth - 4;

        if (y - lines[0].height < rect.y + padding) {
          y = rect.y;
          break;
        }

        context.page.drawText(prefix, {
          x: prefixX,
          y: y,
          size: defaultFontSize,
          font: prefixFont,
          color: rgb(0.07, 0.09, 0.15),
        });

        for (const line of lines) {
          if (y - line.height < rect.y + padding) {
            y = rect.y;
            break;
          }

          let currentX = rect.x + padding + listIndent;
          for (const word of line.words) {
            const font = await getFontForStyle(context, word.style);
            const size = word.style.fontSize ?? defaultFontSize;
            const wordWidth = font.widthOfTextAtSize(word.text, size);

            if (word.style.backgroundColor && word.style.backgroundColor !== 'transparent') {
              const bg = parseCssColor(word.style.backgroundColor, { r: 1, g: 1, b: 0 });
              context.page.drawRectangle({
                x: currentX,
                y: y - line.height * 0.15,
                width: wordWidth,
                height: size * 1.25,
                color: rgb(bg.r, bg.g, bg.b),
              });
            }

            const textColor = parseCssColor(word.style.color, { r: 0.07, g: 0.09, b: 0.15 });

            context.page.drawText(word.text, {
              x: currentX,
              y: y,
              size,
              font,
              color: rgb(textColor.r, textColor.g, textColor.b),
            });

            if (word.style.underline) {
              context.page.drawLine({
                start: { x: currentX, y: y - 1 },
                end: { x: currentX + wordWidth, y: y - 1 },
                thickness: size * 0.07,
                color: rgb(textColor.r, textColor.g, textColor.b),
              });
            }

            if (word.style.strikethrough) {
              context.page.drawLine({
                start: { x: currentX, y: y + size * 0.35 },
                end: { x: currentX + wordWidth, y: y + size * 0.35 },
                thickness: size * 0.07,
                color: rgb(textColor.r, textColor.g, textColor.b),
              });
            }

            if (word.href) {
              context.pendingLinks.push({
                page: context.page,
                x: currentX,
                y: y - size * 0.2,
                width: wordWidth,
                height: size * 1.3,
                url: word.href,
              });
            }

            currentX += wordWidth;
          }

          y -= line.height + 2;
        }

        y -= 2;
      }
      y -= 4;
    } else if (block.type === 'image') {
      const asset = Array.from(context.assetsById.values()).find((a) => a.dataUrl === block.src) ||
                    context.assetsById.get(block.src);

      const src = asset ? asset.dataUrl : block.src;
      if (src && src.startsWith('data:image/')) {
        try {
          const imageBytes = dataUrlToBytes(src);
          const isPng = src.includes('image/png') || src.includes('png');
          const image = isPng
            ? await context.doc.embedPng(imageBytes)
            : await context.doc.embedJpg(imageBytes);

          let imgWidth = block.width === 'inherit' ? image.width : block.width;
          let imgHeight = block.height === 'inherit' ? image.height : block.height;

          const maxImgWidth = maxWidth;
          const maxImgHeight = Math.max(20, y - rect.y - padding - 15);
          const scale = Math.min(maxImgWidth / imgWidth, maxImgHeight / imgHeight, 1);

          imgWidth = imgWidth * scale;
          imgHeight = imgHeight * scale;

          if (y - imgHeight < rect.y + padding) {
            y = rect.y;
            break;
          }

          context.page.drawImage(image, {
            x: rect.x + padding + (maxWidth - imgWidth) / 2,
            y: y - imgHeight,
            width: imgWidth,
            height: imgHeight,
          });

          if (asset) {
            context.embeddedAssetIds.add(asset.id);
          }

          y -= imgHeight + 4;

          if (block.caption) {
            const captionFont = await getFontForStyle(context, { italic: true });
            const captionSize = 9;
            const captionWidth = captionFont.widthOfTextAtSize(block.caption, captionSize);
            const captionX = rect.x + padding + (maxWidth - captionWidth) / 2;

            context.page.drawText(block.caption, {
              x: captionX,
              y: y - captionSize,
              size: captionSize,
              font: captionFont,
              color: rgb(0.39, 0.45, 0.55),
            });
            y -= captionSize + 6;
          }
        } catch {
          // ignore
        }
      }
    } else if (block.type === 'table') {
      if (block.rows.length === 0) continue;
      const numCols = Math.max(...block.rows.map((row) => row.cells.length));
      if (numCols === 0) continue;

      const colWidth = maxWidth / numCols;
      const cellPadding = 4;
      const minCellRowHeight = 18;

      for (const row of block.rows) {
        if (y < rect.y + padding) break;

        let rowHeight = minCellRowHeight;
        const measuredCellHeights: number[] = [];

        for (const cell of row.cells) {
          const measureRect: PdfRect = {
            x: 0,
            y: 0,
            width: colWidth,
            height: 9999,
          };
          const finalY = await drawRichBlocks(
            { ...context, page: { ...context.page, drawText() {}, drawRectangle() {}, drawLine() {}, drawImage() {} } as unknown as PDFPage },
            cell.children,
            measureRect,
            cellPadding,
            defaultFontSize - 1,
            9999 - cellPadding,
          );
          const cellConsumedHeight = 9999 - finalY + cellPadding;
          measuredCellHeights.push(cellConsumedHeight);
          rowHeight = Math.max(rowHeight, cellConsumedHeight);
        }

        if (y - rowHeight < rect.y + padding) {
          y = rect.y;
          break;
        }

        for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
          const cell = row.cells[colIdx];
          const cellX = rect.x + padding + colIdx * colWidth;
          const cellY = y - rowHeight;

          context.page.drawRectangle({
            x: cellX,
            y: cellY,
            width: colWidth,
            height: rowHeight,
            borderColor: rgb(0.8, 0.82, 0.86),
            borderWidth: 1,
            color: rgb(1, 1, 1),
          });

          const cellRect: PdfRect = {
            x: cellX,
            y: cellY,
            width: colWidth,
            height: rowHeight,
          };
          await drawRichBlocks(
            context,
            cell.children,
            cellRect,
            cellPadding,
            defaultFontSize - 1,
            cellY + rowHeight - cellPadding - (defaultFontSize - 1),
          );
        }

        y -= rowHeight;
      }
      y -= 4;
    }
  }

  return y;
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

/**
 * Register a PDF URI link annotation on the page.
 * Uses the low-level pdf-lib API because the high-level PDFPage API only
 * exposes widget annotations (form fields).
 */
function registerLinkAnnotation(
  doc: PDFDocument,
  link: PendingLinkAnnotation,
): void {
  try {
    const actionDict = doc.context.obj({
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of(link.url),
    });

    const annotRef = doc.context.register(
      doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [link.x, link.y, link.x + link.width, link.y + link.height],
        Border: [0, 0, 0],
        C: [],
        A: actionDict,
      }),
    );

    const pageDict = link.page.node;
    const existing =
      pageDict.lookupMaybe(PDFName.of('Annots'), PDFArray) ??
      doc.context.obj([]);
    existing.push(annotRef);
    pageDict.set(PDFName.of('Annots'), existing);
  } catch {
    // Non-fatal — skip unregisterable annotations rather than failing the export.
  }
}

// TableBox Pro flattening helpers

interface FlattenedTableCellDrawInput {
  rect: PdfRect;
  text: string;
  style: WriterTableCellStyle;
  fallbackPadding: number;
  fallbackFontSize: number;
}

async function drawStyledTableCell(
  context: DrawContext,
  input: FlattenedTableCellDrawInput,
): Promise<void> {
  const cellRect = input.rect;
  const style = input.style;
  const padding = Math.max(0, style.padding ?? input.fallbackPadding);
  const fontSize = Math.max(1, style.fontSize ?? input.fallbackFontSize);

  const backgroundColor = style.backgroundColor
    ? parseCssColor(style.backgroundColor, { r: 1, g: 1, b: 1 })
    : null;

  if (backgroundColor) {
    context.page.drawRectangle({
      x: cellRect.x,
      y: cellRect.y,
      width: cellRect.width,
      height: cellRect.height,
      color: rgb(backgroundColor.r, backgroundColor.g, backgroundColor.b),
    });
  }

  drawFlattenedTableCellBorders(context.page, cellRect, style);

  const font = await getFontForStyle(context, {
    fontFamily: style.fontFamily,
    fontSize,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    strikethrough: style.strikethrough,
    color: style.textColor,
  });

  const textColor = parseCssColor(style.textColor, {
    r: 0.07,
    g: 0.09,
    b: 0.15,
  });

  const maxTextWidth = Math.max(1, cellRect.width - padding * 2);
  const lines = wrapPlainTextForPdf({
    text: input.text,
    font,
    fontSize,
    maxWidth: maxTextWidth,
  });

  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;

  const startY = computeFlattenedTableTextStartY({
    cellRect,
    padding,
    lineHeight,
    totalTextHeight,
    verticalAlign: style.verticalAlign,
  });

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const textWidth = font.widthOfTextAtSize(line, fontSize);

    const x = computeFlattenedTableTextX({
      cellRect,
      padding,
      textWidth,
      alignment: style.alignment,
    });

    const y = startY - lineIndex * lineHeight;

    if (y < cellRect.y + padding - fontSize) {
      break;
    }

    context.page.drawText(line, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(textColor.r, textColor.g, textColor.b),
      maxWidth: maxTextWidth,
    });

    if (style.underline || style.strikethrough) {
      drawFlattenedTableTextDecoration(context.page, {
        x,
        y,
        width: Math.min(textWidth, maxTextWidth),
        fontSize,
        underline: style.underline,
        strikethrough: style.strikethrough,
        color: textColor,
      });
    }
  }
}

function drawFlattenedTableCellBorders(
  page: PDFPage,
  rect: PdfRect,
  style: WriterTableCellStyle,
): void {
  const borders = style.borders ?? defaultWriterTableBorders();

  drawFlattenedTableBorderLine(page, {
    border: borders.top,
    x1: rect.x,
    y1: rect.y + rect.height,
    x2: rect.x + rect.width,
    y2: rect.y + rect.height,
  });

  drawFlattenedTableBorderLine(page, {
    border: borders.right,
    x1: rect.x + rect.width,
    y1: rect.y,
    x2: rect.x + rect.width,
    y2: rect.y + rect.height,
  });

  drawFlattenedTableBorderLine(page, {
    border: borders.bottom,
    x1: rect.x,
    y1: rect.y,
    x2: rect.x + rect.width,
    y2: rect.y,
  });

  drawFlattenedTableBorderLine(page, {
    border: borders.left,
    x1: rect.x,
    y1: rect.y,
    x2: rect.x,
    y2: rect.y + rect.height,
  });
}

function drawFlattenedTableBorderLine(
  page: PDFPage,
  input: {
    border: WriterTableBorder | undefined;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  },
): void {
  const border = input.border;

  if (!border || border.style === 'none' || border.width === 0) {
    return;
  }

  const color = parseCssColor(border.color, {
    r: 0.8,
    g: 0.84,
    b: 0.89,
  });

  const width = Math.max(0.25, border.width ?? 0.5);

  if (border.style === 'dashed' || border.style === 'dotted') {
    drawDashedPdfLine(page, {
      x1: input.x1,
      y1: input.y1,
      x2: input.x2,
      y2: input.y2,
      color,
      width,
      dashLength: border.style === 'dotted' ? width : 4,
      gapLength: border.style === 'dotted' ? width * 2 : 3,
    });
    return;
  }

  if (border.style === 'double') {
    drawDoublePdfLine(page, {
      x1: input.x1,
      y1: input.y1,
      x2: input.x2,
      y2: input.y2,
      color,
      width,
    });
    return;
  }

  page.drawLine({
    start: {
      x: input.x1,
      y: input.y1,
    },
    end: {
      x: input.x2,
      y: input.y2,
    },
    thickness: width,
    color: rgb(color.r, color.g, color.b),
  });
}

function drawDashedPdfLine(
  page: PDFPage,
  input: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: { r: number; g: number; b: number };
    width: number;
    dashLength: number;
    gapLength: number;
  },
): void {
  const dx = input.x2 - input.x1;
  const dy = input.y2 - input.y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length <= 0) return;

  const unitX = dx / length;
  const unitY = dy / length;
  let cursor = 0;

  while (cursor < length) {
    const segmentEnd = Math.min(length, cursor + input.dashLength);

    page.drawLine({
      start: {
        x: input.x1 + unitX * cursor,
        y: input.y1 + unitY * cursor,
      },
      end: {
        x: input.x1 + unitX * segmentEnd,
        y: input.y1 + unitY * segmentEnd,
      },
      thickness: input.width,
      color: rgb(input.color.r, input.color.g, input.color.b),
    });

    cursor += input.dashLength + input.gapLength;
  }
}

function drawDoublePdfLine(
  page: PDFPage,
  input: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: { r: number; g: number; b: number };
    width: number;
  },
): void {
  const dx = input.x2 - input.x1;
  const dy = input.y2 - input.y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length <= 0) return;

  const normalX = -dy / length;
  const normalY = dx / length;
  const offset = Math.max(1, input.width * 1.5);

  for (const direction of [-1, 1]) {
    page.drawLine({
      start: {
        x: input.x1 + normalX * offset * direction,
        y: input.y1 + normalY * offset * direction,
      },
      end: {
        x: input.x2 + normalX * offset * direction,
        y: input.y2 + normalY * offset * direction,
      },
      thickness: Math.max(0.25, input.width / 2),
      color: rgb(input.color.r, input.color.g, input.color.b),
    });
  }
}

function drawFlattenedTableTextDecoration(
  page: PDFPage,
  input: {
    x: number;
    y: number;
    width: number;
    fontSize: number;
    underline?: boolean;
    strikethrough?: boolean;
    color: { r: number; g: number; b: number };
  },
): void {
  if (input.underline) {
    page.drawLine({
      start: {
        x: input.x,
        y: input.y - 1,
      },
      end: {
        x: input.x + input.width,
        y: input.y - 1,
      },
      thickness: Math.max(0.35, input.fontSize / 18),
      color: rgb(input.color.r, input.color.g, input.color.b),
    });
  }

  if (input.strikethrough) {
    page.drawLine({
      start: {
        x: input.x,
        y: input.y + input.fontSize * 0.35,
      },
      end: {
        x: input.x + input.width,
        y: input.y + input.fontSize * 0.35,
      },
      thickness: Math.max(0.35, input.fontSize / 18),
      color: rgb(input.color.r, input.color.g, input.color.b),
    });
  }
}

function resolveFlattenedHeaderCellStyle(
  element: WriterElementV2,
  tableData: WriterTableData,
  column: WriterTableColumn,
): WriterTableCellStyle {
  return mergeFlattenedTableCellStyles(
    elementStyleToTableCellStyle(element),
    tableData.defaultCellStyle,
    column.style,
    {
      bold: true,
      alignment: 'center',
      verticalAlign: 'middle',
      backgroundColor: '#F1F5F9',
      padding: 6,
      borders: defaultWriterTableBorders(),
    },
    tableData.headerCellStyle,
  );
}

function resolveFlattenedBodyCellStyle(
  element: WriterElementV2,
  tableData: WriterTableData,
  column: WriterTableColumn,
  cell: WriterTableCell | undefined,
): WriterTableCellStyle {
  return mergeFlattenedTableCellStyles(
    elementStyleToTableCellStyle(element),
    {
      alignment: 'left',
      verticalAlign: 'top',
      padding: 4,
      borders: defaultWriterTableBorders(),
    },
    tableData.defaultCellStyle,
    column.style,
    cell?.style,
  );
}

function elementStyleToTableCellStyle(
  element: WriterElementV2,
): WriterTableCellStyle {
  return {
    fontFamily: element.style.fontFamily,
    fontSize: element.style.fontSize,
    textColor: element.style.textColor,
  };
}

function mergeFlattenedTableCellStyles(
  ...styles: Array<WriterTableCellStyle | undefined>
): WriterTableCellStyle {
  const result: WriterTableCellStyle = {};

  for (const style of styles) {
    if (!style) continue;

    result.alignment = style.alignment ?? result.alignment;
    result.verticalAlign = style.verticalAlign ?? result.verticalAlign;
    result.fontFamily = style.fontFamily ?? result.fontFamily;
    result.fontSize = style.fontSize ?? result.fontSize;
    result.textColor = style.textColor ?? result.textColor;
    result.bold = style.bold ?? result.bold;
    result.italic = style.italic ?? result.italic;
    result.underline = style.underline ?? result.underline;
    result.strikethrough = style.strikethrough ?? result.strikethrough;
    result.backgroundColor = style.backgroundColor ?? result.backgroundColor;
    result.padding = style.padding ?? result.padding;
    result.borders = mergeFlattenedTableBorders(result.borders, style.borders);
  }

  return result;
}

function mergeFlattenedTableBorders(
  base: WriterTableCellStyle['borders'],
  next: WriterTableCellStyle['borders'],
): WriterTableCellStyle['borders'] {
  if (!base && !next) return undefined;

  return {
    top: next?.top ?? base?.top,
    right: next?.right ?? base?.right,
    bottom: next?.bottom ?? base?.bottom,
    left: next?.left ?? base?.left,
  };
}

function defaultWriterTableBorders(): NonNullable<WriterTableCellStyle['borders']> {
  const border: WriterTableBorder = {
    style: 'single',
    color: '#CBD5E1',
    width: 0.5,
  };

  return {
    top: border,
    right: border,
    bottom: border,
    left: border,
  };
}

function normalizeWriterTableColumnWidths(input: {
  columns: WriterTableColumn[];
  totalWidth: number;
  minColumnWidth: number;
}): number[] {
  const fallbackWidth = input.totalWidth / Math.max(1, input.columns.length);

  const rawWidths = input.columns.map((column) =>
    Math.max(input.minColumnWidth, column.width ?? fallbackWidth),
  );

  const rawTotal = rawWidths.reduce((sum, width) => sum + width, 0);

  if (rawTotal <= 0) {
    return input.columns.map(() => fallbackWidth);
  }

  const scale = input.totalWidth / rawTotal;

  return rawWidths.map((width) =>
    Math.max(input.minColumnWidth, width * scale),
  );
}

function normalizeWriterTableRowHeights(input: {
  tableData: WriterTableData;
  totalHeight: number;
  minRowHeight: number;
}): number[] {
  const fallbackHeight = input.totalHeight / Math.max(1, input.tableData.rows.length);

  const rawHeights = input.tableData.rows.map((row) =>
    Math.max(input.minRowHeight, row.height ?? fallbackHeight),
  );

  const rawTotal = rawHeights.reduce((sum, height) => sum + height, 0);

  if (rawTotal <= 0) {
    return input.tableData.rows.map(() => fallbackHeight);
  }

  const scale = input.totalHeight / rawTotal;

  return rawHeights.map((height) =>
    Math.max(input.minRowHeight, height * scale),
  );
}

function isValidWriterTableData(
  tableData: WriterTableData | undefined,
): tableData is WriterTableData {
  return !!tableData
    && Array.isArray(tableData.columns)
    && tableData.columns.length > 0
    && Array.isArray(tableData.rows);
}

function wrapPlainTextForPdf(input: {
  text: string;
  font: PDFFont;
  fontSize: number;
  maxWidth: number;
}): string[] {
  const paragraphs = input.text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/(\s+)/).filter((part) => part.length > 0);

    let current = '';

    for (const word of words) {
      const candidate = current ? `${current}${word}` : word;
      const candidateWidth = input.font.widthOfTextAtSize(candidate, input.fontSize);

      if (candidateWidth <= input.maxWidth || current.length === 0) {
        current = candidate;
        continue;
      }

      lines.push(current.trimEnd());
      current = word.trimStart();
    }

    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

function computeFlattenedTableTextX(input: {
  cellRect: PdfRect;
  padding: number;
  textWidth: number;
  alignment: WriterTableCellStyle['alignment'];
}): number {
  const left = input.cellRect.x + input.padding;
  const right = input.cellRect.x + input.cellRect.width - input.padding;
  const availableWidth = Math.max(1, right - left);

  if (input.alignment === 'center') {
    return left + Math.max(0, (availableWidth - input.textWidth) / 2);
  }

  if (input.alignment === 'right') {
    return right - Math.min(input.textWidth, availableWidth);
  }

  return left;
}

function computeFlattenedTableTextStartY(input: {
  cellRect: PdfRect;
  padding: number;
  lineHeight: number;
  totalTextHeight: number;
  verticalAlign: WriterTableCellStyle['verticalAlign'];
}): number {
  const topY = input.cellRect.y + input.cellRect.height - input.padding - input.lineHeight * 0.8;
  const bottomY = input.cellRect.y + input.padding;

  if (input.verticalAlign === 'middle') {
    const centerY = input.cellRect.y + input.cellRect.height / 2;
    return centerY + input.totalTextHeight / 2 - input.lineHeight * 0.8;
  }

  if (input.verticalAlign === 'bottom') {
    return bottomY + input.totalTextHeight - input.lineHeight * 0.8;
  }

  return topY;
}

function buildFlattenedTableColumnPositions(input: {
  startX: number;
  columnWidths: number[];
}): number[] {
  const positions: number[] = [];
  let x = input.startX;

  for (const width of input.columnWidths) {
    positions.push(x);
    x += width;
  }

  return positions;
}

function buildFlattenedTableRowBottomPositions(input: {
  bodyTopY: number;
  rowHeights: number[];
}): number[] {
  const positions: number[] = [];
  let topY = input.bodyTopY;

  for (const height of input.rowHeights) {
    const bottomY = topY - height;
    positions.push(bottomY);
    topY = bottomY;
  }

  return positions;
}

function clampFlattenedTableSpan(
  span: number | undefined,
  startIndex: number,
  count: number,
): number {
  const raw = span && span > 1 ? Math.trunc(span) : 1;
  return Math.max(1, Math.min(raw, count - startIndex));
}

function sumFlattenedTableSpan(
  values: number[],
  startIndex: number,
  span: number,
): number {
  let total = 0;

  for (let index = startIndex; index < startIndex + span; index += 1) {
    total += values[index] ?? 0;
  }

  return total;
}
