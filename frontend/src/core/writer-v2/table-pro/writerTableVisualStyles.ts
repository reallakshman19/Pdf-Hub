import type {
  WriterElementV2,
  WriterTableBorder,
  WriterTableCell,
  WriterTableCellStyle,
  WriterTableColumn,
  WriterTableData,
} from '../types';

export interface WriterTableResolvedCellStyle {
  alignment?: NonNullable<WriterTableCellStyle['alignment']>;
  verticalAlign?: NonNullable<WriterTableCellStyle['verticalAlign']>;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  backgroundColor?: string;
  padding?: number;
  borders?: WriterTableCellStyle['borders'];
}

export interface WriterTableResolvedCell {
  key: string;
  text: string;
  rowIndex: number;
  columnIndex: number;
  isHeader: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  style: WriterTableResolvedCellStyle;
  colSpan?: number;
  rowSpan?: number;
}

export interface WriterTableVisualModel {
  width: number;
  height: number;
  hasHeaderRow: boolean;
  headerHeight: number;
  columnWidths: number[];
  bodyRowHeights: number[];
  headerCells: WriterTableResolvedCell[];
  bodyCells: WriterTableResolvedCell[];
}

export function buildWriterTableVisualModel(input: {
  element: WriterElementV2;
  width: number;
  height: number;
  minColumnWidth?: number;
  minRowHeight?: number;
  defaultHeaderHeight?: number;
}): WriterTableVisualModel | null {
  const tableData = input.element.tableData;

  if (!isValidTableData(tableData)) {
    return null;
  }

  const minColumnWidth = input.minColumnWidth ?? 16;
  const minRowHeight = input.minRowHeight ?? 16;
  const hasHeaderRow = tableData.hasHeaderRow !== false;
  const headerHeight = hasHeaderRow
    ? Math.max(minRowHeight, input.defaultHeaderHeight ?? 24)
    : 0;

  const columnWidths = normalizeColumnWidths({
    columns: tableData.columns,
    totalWidth: input.width,
    minColumnWidth,
  });

  const bodyHeight = Math.max(minRowHeight, input.height - headerHeight);
  const bodyRowHeights = normalizeRowHeights({
    rows: tableData.rows,
    totalHeight: bodyHeight,
    minRowHeight,
  });

  const headerCells: WriterTableResolvedCell[] = [];
  const bodyCells: WriterTableResolvedCell[] = [];

  if (hasHeaderRow) {
    let x = 0;

    tableData.columns.forEach((column, columnIndex) => {
      const width = columnWidths[columnIndex] ?? minColumnWidth;

      headerCells.push({
        key: `header:${column.id}`,
        text: column.label ?? column.id,
        rowIndex: -1,
        columnIndex,
        isHeader: true,
        width,
        height: headerHeight,
        x,
        y: 0,
        style: resolveHeaderCellStyle(tableData, column, input.element),
      });

      x += width;
    });
  }

  let y = headerHeight;

  tableData.rows.forEach((row, rowIndex) => {
    let x = 0;
    const height = bodyRowHeights[rowIndex] ?? minRowHeight;

    tableData.columns.forEach((column, columnIndex) => {
      const cell = row.cells[columnIndex];
      const width = columnWidths[columnIndex] ?? minColumnWidth;

      if (!cell?.mergedInto) {
        const colSpan = cell?.colSpan ?? 1;
        const rowSpan = cell?.rowSpan ?? 1;

        const spannedWidth = sumSpan(columnWidths, columnIndex, colSpan);
        const spannedHeight = sumSpan(bodyRowHeights, rowIndex, rowSpan);

        bodyCells.push({
          key: `body:${row.id}:${column.id}:${cell?.id ?? columnIndex}`,
          text: cell?.text ?? '',
          rowIndex,
          columnIndex,
          isHeader: false,
          width: spannedWidth,
          height: spannedHeight,
          x,
          y,
          style: resolveBodyCellStyle(tableData, column, cell, input.element),
          colSpan: cell?.colSpan,
          rowSpan: cell?.rowSpan,
        });
      }

      x += width;
    });

    y += height;
  });

  return {
    width: input.width,
    height: input.height,
    hasHeaderRow,
    headerHeight,
    columnWidths,
    bodyRowHeights,
    headerCells,
    bodyCells,
  };
}

export function writerTableCellStyleToCss(
  style: WriterTableResolvedCellStyle,
): React.CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    color: style.textColor,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: textDecorationFromStyle(style),
    backgroundColor: style.backgroundColor,
    padding: `${style.padding ?? 4}px`,
    textAlign: style.alignment ?? 'left',
    alignItems: verticalAlignToFlex(style.verticalAlign),
    justifyContent: horizontalAlignToFlex(style.alignment),
    borderTop: borderToCss(style.borders?.top),
    borderRight: borderToCss(style.borders?.right),
    borderBottom: borderToCss(style.borders?.bottom),
    borderLeft: borderToCss(style.borders?.left),
    overflow: 'hidden',
    boxSizing: 'border-box',
    display: 'flex',
  };
}

export function defaultTableBorderCss(): string {
  return '1px solid #CBD5E1';
}

function resolveHeaderCellStyle(
  tableData: WriterTableData,
  column: WriterTableColumn,
  element: WriterElementV2,
): WriterTableResolvedCellStyle {
  return mergeResolvedStyles(
    elementStyleToCellStyle(element),
    tableData.defaultCellStyle,
    column.style,
    {
      bold: true,
      alignment: 'center',
      verticalAlign: 'middle',
      backgroundColor: '#F1F5F9',
      padding: 6,
      borders: defaultBorders(),
    },
    tableData.headerCellStyle,
  );
}

function resolveBodyCellStyle(
  tableData: WriterTableData,
  column: WriterTableColumn,
  cell: WriterTableCell | undefined,
  element: WriterElementV2,
): WriterTableResolvedCellStyle {
  return mergeResolvedStyles(
    elementStyleToCellStyle(element),
    {
      padding: 4,
      alignment: 'left',
      verticalAlign: 'top',
      borders: defaultBorders(),
    },
    tableData.defaultCellStyle,
    column.style,
    cell?.style,
  );
}

function elementStyleToCellStyle(
  element: WriterElementV2,
): WriterTableCellStyle {
  return {
    fontFamily: element.style.fontFamily,
    fontSize: element.style.fontSize,
    textColor: element.style.textColor,
  };
}

function mergeResolvedStyles(
  ...styles: Array<WriterTableCellStyle | undefined>
): WriterTableResolvedCellStyle {
  const result: WriterTableResolvedCellStyle = {};

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
    result.borders = mergeBorders(result.borders, style.borders);
  }

  return result;
}

function normalizeColumnWidths(input: {
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

function normalizeRowHeights(input: {
  rows: Array<{ height?: number }>;
  totalHeight: number;
  minRowHeight: number;
}): number[] {
  const fallbackHeight = input.totalHeight / Math.max(1, input.rows.length);

  const rawHeights = input.rows.map((row) =>
    Math.max(input.minRowHeight, row.height ?? fallbackHeight),
  );

  const rawTotal = rawHeights.reduce((sum, height) => sum + height, 0);

  if (rawTotal <= 0) {
    return input.rows.map(() => fallbackHeight);
  }

  const scale = input.totalHeight / rawTotal;

  return rawHeights.map((height) =>
    Math.max(input.minRowHeight, height * scale),
  );
}

function mergeBorders(
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

function defaultBorders(): WriterTableCellStyle['borders'] {
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

function borderToCss(border: WriterTableBorder | undefined): string {
  if (!border) return defaultTableBorderCss();

  if (border.style === 'none' || border.width === 0) {
    return '0 solid transparent';
  }

  const cssStyle = borderStyleToCss(border.style);
  const width = Math.max(0, border.width ?? 0.5);
  const color = border.color ?? '#CBD5E1';

  return `${width}px ${cssStyle} ${color}`;
}

function borderStyleToCss(
  style: WriterTableBorder['style'],
): 'solid' | 'dashed' | 'dotted' | 'double' {
  if (style === 'dashed') return 'dashed';
  if (style === 'dotted') return 'dotted';
  if (style === 'double') return 'double';
  return 'solid';
}

function horizontalAlignToFlex(
  alignment: WriterTableCellStyle['alignment'],
): React.CSSProperties['justifyContent'] {
  if (alignment === 'center') return 'center';
  if (alignment === 'right') return 'flex-end';
  return 'flex-start';
}

function verticalAlignToFlex(
  verticalAlign: WriterTableCellStyle['verticalAlign'],
): React.CSSProperties['alignItems'] {
  if (verticalAlign === 'middle') return 'center';
  if (verticalAlign === 'bottom') return 'flex-end';
  return 'flex-start';
}

function textDecorationFromStyle(
  style: WriterTableResolvedCellStyle,
): string | undefined {
  const values: string[] = [];

  if (style.underline) values.push('underline');
  if (style.strikethrough) values.push('line-through');

  return values.length > 0 ? values.join(' ') : undefined;
}

function isValidTableData(
  tableData: WriterTableData | undefined,
): tableData is WriterTableData {
  return !!tableData
    && Array.isArray(tableData.columns)
    && tableData.columns.length > 0
    && Array.isArray(tableData.rows);
}

function sumSpan(
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
