import {
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  VerticalAlign,
  WidthType,
} from 'docx';
import type {
  ITableCellBorders,
  ITableCellOptions,
  TableVerticalAlign,
} from 'docx';
import type {
  PortableExportBlock,
  PortableTableBlock,
  PortableTableBorder,
  PortableTableCellStyle,
} from './types';
import { renderPortableBlockChildren } from './renderPortableBlockChildren';
import {
  cssColorToDocxHex,
  ptToDocxBorderSize,
  ptToTwip,
} from './docxUnits';

export function renderTableBlock(block: PortableTableBlock): Table {
  const columnTotalWidth = estimateTableWidth(block);

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: block.rows.map((row) =>
      new TableRow({
        children: row.cells.map((cell) =>
          new TableCell({
            columnSpan: cell.colSpan,
            rowSpan: cell.rowSpan,
            width: cell.width
              ? {
                  size: widthToPct(cell.width, columnTotalWidth),
                  type: WidthType.PERCENTAGE,
                }
              : undefined,
            verticalAlign: toDocxVerticalAlign(cell.style?.verticalAlign),
            shading: cell.style?.backgroundColor
              ? {
                  type: ShadingType.CLEAR,
                  fill: cssColorToDocxHex(cell.style.backgroundColor) ?? 'FFFFFF',
                  color: 'auto',
                }
              : undefined,
            margins: toDocxCellMargins(cell.style),
            borders: toDocxCellBorders(cell.style),
            children: cellChildrenToDocxParagraphs(cell.children),
          }),
        ),
      }),
    ),
  });
}

function cellChildrenToDocxParagraphs(
  blocks: PortableExportBlock[],
): Paragraph[] {
  const rendered = renderPortableBlockChildren(blocks).filter(
    (child): child is Paragraph => child instanceof Paragraph,
  );

  if (rendered.length > 0) {
    return rendered;
  }

  return [
    new Paragraph(''),
  ];
}

function estimateTableWidth(block: PortableTableBlock): number | undefined {
  const firstRow = block.rows[0];

  if (!firstRow) {
    return undefined;
  }

  const total = firstRow.cells.reduce((sum, cell) => {
    return sum + (cell.width ?? 0);
  }, 0);

  return total > 0 ? total : undefined;
}

function widthToPct(
  width: number,
  totalWidth: number | undefined,
): number {
  if (!totalWidth || totalWidth <= 0) {
    return Math.max(1, Math.min(100, Math.round(width)));
  }

  return Math.max(1, Math.min(100, Math.round((width / totalWidth) * 100)));
}

function toDocxVerticalAlign(
  value: PortableTableCellStyle['verticalAlign'],
): TableVerticalAlign | undefined {
  if (value === 'middle') return VerticalAlign.CENTER;
  if (value === 'bottom') return VerticalAlign.BOTTOM;
  if (value === 'top') return VerticalAlign.TOP;
  return undefined;
}

function toDocxCellMargins(
  style: PortableTableCellStyle | undefined,
): ITableCellOptions['margins'] | undefined {
  const padding = style?.padding;

  if (padding === undefined) {
    return {
      top: 120,
      bottom: 120,
      left: 120,
      right: 120,
    };
  }

  const value = ptToTwip(padding);

  return {
    top: value,
    bottom: value,
    left: value,
    right: value,
  };
}

function toDocxCellBorders(
  style: PortableTableCellStyle | undefined,
): ITableCellBorders | undefined {
  const borders = style?.borders;

  if (!borders) {
    return {
      top: defaultBorder(),
      right: defaultBorder(),
      bottom: defaultBorder(),
      left: defaultBorder(),
    };
  }

  return {
    top: toDocxBorder(borders.top),
    right: toDocxBorder(borders.right),
    bottom: toDocxBorder(borders.bottom),
    left: toDocxBorder(borders.left),
  };
}

function defaultBorder() {
  return {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'CBD5E1',
  };
}

function toDocxBorder(border: PortableTableBorder | undefined) {
  if (!border || border.style === 'none' || border.width === 0) {
    return {
      style: BorderStyle.NONE,
      size: 0,
      color: 'FFFFFF',
    };
  }

  return {
    style: toDocxBorderStyle(border.style),
    size: ptToDocxBorderSize(border.width ?? 0.5),
    color: cssColorToDocxHex(border.color) ?? 'CBD5E1',
  };
}

function toDocxBorderStyle(
  style: PortableTableBorder['style'],
): (typeof BorderStyle)[keyof typeof BorderStyle] {
  if (style === 'dashed') return BorderStyle.DASHED;
  if (style === 'dotted') return BorderStyle.DOTTED;
  if (style === 'double') return BorderStyle.DOUBLE;
  return BorderStyle.SINGLE;
}
