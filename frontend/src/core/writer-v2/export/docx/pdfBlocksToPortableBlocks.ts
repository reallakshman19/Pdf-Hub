import type { PdfBlock, PdfInlineText, PdfTextStyle } from '../richTextRenderer';
import type {
  PortableBlockSource,
  PortableExportBlock,
  PortableInlineText,
  PortableTextStyle,
} from './types';

export function pdfBlocksToPortableBlocks(
  blocks: PdfBlock[],
  source: PortableBlockSource = {},
): PortableExportBlock[] {
  return blocks.map((block): PortableExportBlock => {
    if (block.type === 'paragraph') {
      return {
        ...source,
        type: 'paragraph',
        alignment: block.alignment,
        indent: block.indent,
        children: pdfInlineTextToPortableInlineText(block.children),
      };
    }

    if (block.type === 'heading') {
      return {
        ...source,
        type: 'heading',
        tag: block.tag,
        alignment: block.alignment,
        children: pdfInlineTextToPortableInlineText(block.children),
      };
    }

    if (block.type === 'list') {
      return {
        ...source,
        type: 'list',
        listType: block.listType,
        items: block.items.map((item) => ({
          indent: item.indent,
          checked: item.checked,
          children: pdfInlineTextToPortableInlineText(item.children),
        })),
      };
    }

    if (block.type === 'table') {
      return {
        ...source,
        type: 'table',
        rows: block.rows.map((row) => ({
          cells: row.cells.map((cell) => ({
            children: pdfBlocksToPortableBlocks(cell.children, source),
          })),
        })),
      };
    }

    return {
      ...source,
      type: 'image',
      src: block.src,
      altText: block.altText,
      width: block.width,
      height: block.height,
      caption: block.caption,
    };
  });
}

function pdfInlineTextToPortableInlineText(
  children: PdfInlineText[],
): PortableInlineText[] {
  return children.map((child) => ({
    text: child.text,
    style: pdfTextStyleToPortableTextStyle(child.style),
    href: child.href,
  }));
}

function pdfTextStyleToPortableTextStyle(
  style: PdfTextStyle,
): PortableTextStyle {
  return {
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    strikethrough: style.strikethrough,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    color: style.color,
    backgroundColor: style.backgroundColor,
  };
}
