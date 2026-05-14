import type { PdfRect, WriterTableData } from '@/core/writer-v2/types';

export interface SelectBoxViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectBoxTextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface SelectBoxTextRow {
  y: number;
  height: number;
  items: SelectBoxTextItem[];
  text: string;
}

export interface SelectBoxTableResult {
  confidence: number;
  tableData: WriterTableData;
  html: string;
  tsv: string;
}

export interface SelectBoxCopyResult {
  pageNumber: number;
  pageIndex: number;
  viewportRect: SelectBoxViewportRect;
  pdfRect: PdfRect;
  items: SelectBoxTextItem[];
  rows: SelectBoxTextRow[];
  plainText: string;
  html: string;
  table: SelectBoxTableResult | null;
  imageDataUrl?: string;
}