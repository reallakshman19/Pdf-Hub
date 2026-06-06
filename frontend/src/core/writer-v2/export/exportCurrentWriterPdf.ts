import { PDFDocument, rgb } from 'pdf-lib';
import { exportFlattenedWriterPdf } from './flattenedPdfExport';
import { useWriterV2Store } from '../writerV2Store';

export interface ExportCurrentWriterPdfInput {
  pdfBytes?: Uint8Array | null;
}

export async function exportCurrentWriterPdf(
  input: ExportCurrentWriterPdfInput = {},
): Promise<Uint8Array> {
  const state = useWriterV2Store.getState();
  const sourcePdfBytes = input.pdfBytes ?? await createBlankDocumentPdfBytes();

  const result = await exportFlattenedWriterPdf({
    pdfBytes: sourcePdfBytes,
    elements: state.elements,
    assets: state.assetRecords,
  });

  return result.bytes;
}

async function createBlankDocumentPdfBytes(): Promise<Uint8Array> {
  const meta = useWriterV2Store.getState().documentMeta;

  if (meta?.mode !== 'blankDocument') {
    throw new Error('No PDF bytes were provided for flattened Writer PDF export.');
  }

  const doc = await PDFDocument.create();
  const pageCount = Math.max(1, Math.floor(meta.pageCount));
  const background = cssHexToPdfRgb(meta.pageSetup.backgroundColor ?? '#ffffff');

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = doc.addPage([meta.pageSetup.width, meta.pageSetup.height]);

    if (background) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: meta.pageSetup.width,
        height: meta.pageSetup.height,
        color: background,
        borderWidth: 0,
      });
    }
  }

  return await doc.save();
}

export function cssHexToPdfRgb(color: string) {
  const trimmed = color.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(trimmed);

  if (!match) {
    return null;
  }

  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;

  return rgb(red, green, blue);
}
