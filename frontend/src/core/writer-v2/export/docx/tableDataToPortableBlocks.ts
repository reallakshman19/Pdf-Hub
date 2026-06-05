import type {
  WriterElementV2,
  WriterTableCellStyle,
  WriterTableData,
} from '../../types';
import type {
  PortableExportBlock,
  PortableTableBlock,
  PortableTableCellStyle,
  WriterDocxExportDiagnostic,
} from './types';
import { createWriterDocxDiagnostic } from './diagnostics';

export interface TableDataToPortableBlocksResult {
  block: PortableTableBlock | null;
  diagnostics: WriterDocxExportDiagnostic[];
}

export function tableDataToPortableBlock(
  element: WriterElementV2,
): TableDataToPortableBlocksResult {
  const diagnostics: WriterDocxExportDiagnostic[] = [];
  const tableData = element.tableData;

  if (!isValidWriterTableData(tableData)) {
    diagnostics.push(
      createWriterDocxDiagnostic(
        'warning',
        'INVALID_TABLE_DATA',
        'Table element has missing or invalid tableData. It will be exported as fallback text.',
        element,
      ),
    );

    return {
      block: null,
      diagnostics,
    };
  }

  const rows: PortableTableBlock['rows'] = [];

  if (tableData.hasHeaderRow !== false) {
    rows.push({
      cells: tableData.columns.map((column) => ({
        width: column.width,
        style: mergeCellStyles(
          tableData.defaultCellStyle,
          column.style,
          tableData.headerCellStyle,
          {
            bold: true,
            backgroundColor: tableData.headerCellStyle?.backgroundColor ?? '#F1F5F9',
          },
        ),
        children: [
          createParagraph(column.label ?? column.id, element, {
            ...tableData.defaultCellStyle,
            ...column.style,
            ...tableData.headerCellStyle,
            bold: tableData.headerCellStyle?.bold ?? true,
          }),
        ],
      })),
    });
  }

  for (const row of tableData.rows) {
    rows.push({
      cells: tableData.columns.flatMap((column, columnIndex) => {
        const cell = row.cells[columnIndex];

        if (cell?.mergedInto) {
          return [];
        }

        const mergedStyle = mergeCellStyles(
          tableData.defaultCellStyle,
          column.style,
          cell?.style,
        );

        return [
          {
            width: column.width,
            colSpan: cell?.colSpan,
            rowSpan: cell?.rowSpan,
            style: mergedStyle,
            children: [
              createParagraph(cell?.text ?? '', element, mergedStyle),
            ],
          },
        ];
      }),
    });
  }

  return {
    block: {
      type: 'table',
      elementId: element.id,
      elementType: element.type,
      pageIndex: element.pageIndex,
      rows,
    },
    diagnostics,
  };
}

function isValidWriterTableData(
  tableData: WriterTableData | undefined,
): tableData is WriterTableData {
  return !!tableData
    && Array.isArray(tableData.columns)
    && tableData.columns.length > 0
    && Array.isArray(tableData.rows);
}

function mergeCellStyles(
  ...styles: Array<WriterTableCellStyle | PortableTableCellStyle | undefined>
): PortableTableCellStyle | undefined {
  const merged: PortableTableCellStyle = {};

  for (const style of styles) {
    if (!style) continue;

    Object.assign(merged, {
      alignment: style.alignment ?? merged.alignment,
      verticalAlign: style.verticalAlign ?? merged.verticalAlign,
      fontFamily: style.fontFamily ?? merged.fontFamily,
      fontSize: style.fontSize ?? merged.fontSize,
      textColor: style.textColor ?? merged.textColor,
      bold: style.bold ?? merged.bold,
      italic: style.italic ?? merged.italic,
      underline: style.underline ?? merged.underline,
      strikethrough: style.strikethrough ?? merged.strikethrough,
      backgroundColor: style.backgroundColor ?? merged.backgroundColor,
      padding: style.padding ?? merged.padding,
      borders: mergeBorders(merged.borders, style.borders),
    });
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeBorders(
  base: PortableTableCellStyle['borders'],
  next: WriterTableCellStyle['borders'] | PortableTableCellStyle['borders'] | undefined,
): PortableTableCellStyle['borders'] {
  if (!base && !next) return undefined;

  return {
    top: next?.top ?? base?.top,
    right: next?.right ?? base?.right,
    bottom: next?.bottom ?? base?.bottom,
    left: next?.left ?? base?.left,
  };
}

function createParagraph(
  text: string,
  element: WriterElementV2,
  cellStyle?: PortableTableCellStyle,
): PortableExportBlock {
  return {
    type: 'paragraph',
    elementId: element.id,
    elementType: element.type,
    pageIndex: element.pageIndex,
    alignment: cellStyle?.alignment,
    children: [
      {
        text,
        style: {
          fontFamily: cellStyle?.fontFamily ?? element.style.fontFamily,
          fontSize: cellStyle?.fontSize ?? element.style.fontSize,
          color: cellStyle?.textColor ?? element.style.textColor,
          bold: cellStyle?.bold,
          italic: cellStyle?.italic,
          underline: cellStyle?.underline,
          strikethrough: cellStyle?.strikethrough,
        },
      },
    ],
  };
}
