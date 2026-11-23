import { assertWriterOutputSnapshotCurrent, materializeWriterOutputSource, type WriterOutputSnapshot } from './writerOutputSnapshot';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  exportFlattenedWriterPdf,
  type FlattenWriterExportInput,
  type FlattenWriterExportResult,
} from './flattenedPdfExport';
import { useWriterV2Store } from '../writerV2Store';
import type { WriterDocumentMetaV2, WriterPageSetupV2, WriterPageTemplateOptions } from '../types';
import {
  calculateCornellLayout,
  calculateDotGridPoints,
  calculateGridLines,
  calculateMusicStaffs,
  calculateRuledLines,
  resolvePageTemplate,
} from '../templates/pageTemplates';
import {
  createDefaultExportWorkerClient,
  type ExportWorkerClient,
} from '@/core/export/exportWorkerClient';

export interface ExportCurrentWriterPdfInput {
  snapshot?: WriterOutputSnapshot;
  pdfBytes?: Uint8Array | null;
  /**
   * Force main-thread (false) or worker (true) execution. Defaults to
   * `typeof Worker !== 'undefined'` — real browsers offload to the export
   * worker automatically; environments without a Worker implementation
   * (e.g. this test suite's jsdom environment) fall back to the direct
   * main-thread path with no behavior change.
   */
  useWorker?: boolean;
  workerClient?: Pick<ExportWorkerClient, 'flattenPdf'>;
}

export async function exportCurrentWriterPdf(
  input: ExportCurrentWriterPdfInput = {},
): Promise<Uint8Array> {
  const snapshot = input.snapshot;
  const state = snapshot?.owner.writer ?? useWriterV2Store.getState();
  if (snapshot) assertWriterOutputSnapshotCurrent(snapshot);
  const source = snapshot ? await materializeWriterOutputSource(snapshot) : input.pdfBytes;
  const sourcePdfBytes = source ?? await createBlankDocumentPdfBytes();

  const flattenInput: FlattenWriterExportInput = {
    pdfBytes: sourcePdfBytes,
    elements: snapshot?.elements ?? state.elements,
    assets: state.assetRecords,
  };

  const shouldUseWorker = input.useWorker ?? typeof Worker !== 'undefined';

  const result = shouldUseWorker
    ? await runFlattenPdfViaWorker(flattenInput, input.workerClient)
    : await exportFlattenedWriterPdf(flattenInput);

  if (snapshot) assertWriterOutputSnapshotCurrent(snapshot);
  return result.bytes;
}

async function runFlattenPdfViaWorker(
  payload: FlattenWriterExportInput,
  injectedClient: Pick<ExportWorkerClient, 'flattenPdf'> | undefined,
): Promise<FlattenWriterExportResult> {
  if (injectedClient) {
    return injectedClient.flattenPdf(payload);
  }

  const client = createDefaultExportWorkerClient();
  try {
    return await client.flattenPdf(payload);
  } finally {
    client.dispose();
  }
}

export async function createBlankDocumentPdfBytes(
  customMeta?: WriterDocumentMetaV2 | null,
): Promise<Uint8Array> {
  const meta = customMeta ?? useWriterV2Store.getState().documentMeta;

  if (meta?.mode !== 'blankDocument') {
    throw new Error('No PDF bytes were provided for flattened Writer PDF export.');
  }

  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  const pageCount = Math.max(1, Math.floor(meta.pageCount));
  const background = await cssHexToPdfRgb(meta.pageSetup.backgroundColor ?? '#ffffff');

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

    const template = resolvePageTemplate(meta.pageSetup, pageIndex);
    if (template.kind !== 'blank') {
      await drawTemplateToPdfPage(page, meta.pageSetup, template);
    }
  }

  return await doc.save();
}

type PDFPageT = import('pdf-lib').PDFPage;

async function drawTemplateToPdfPage(
  page: PDFPageT,
  pageSetup: WriterPageSetupV2,
  template: WriterPageTemplateOptions,
) {
  if (template.kind === 'blank') {
    return;
  }

  const { width, height, marginTop, marginBottom, marginLeft, marginRight } = pageSetup;
  const strokeColor = await cssHexToPdfRgb(template.lineColor ?? '#cbd5e1');
  const marginColor = template.marginLineColor ? await cssHexToPdfRgb(template.marginLineColor) : strokeColor;
  const thickness = template.lineWidth ?? 0.75;

  const toPdfY = (topDownY: number) => height - topDownY;

  switch (template.kind) {
    case 'ruled': {
      const geometry = calculateRuledLines(width, height, marginTop, marginBottom, marginLeft, marginRight, template);
      if (strokeColor) {
        for (const line of geometry.lines) {
          page.drawLine({
            start: { x: line.x1, y: toPdfY(line.y1) },
            end: { x: line.x2, y: toPdfY(line.y2) },
            thickness,
            color: strokeColor,
          });
        }
      }
      if (geometry.marginLine && marginColor) {
        page.drawLine({
          start: { x: geometry.marginLine.x1, y: toPdfY(geometry.marginLine.y1) },
          end: { x: geometry.marginLine.x2, y: toPdfY(geometry.marginLine.y2) },
          thickness: 1,
          color: marginColor,
        });
      }
      break;
    }

    case 'grid': {
      const geometry = calculateGridLines(width, height, marginTop, marginBottom, marginLeft, marginRight, template, true);
      if (strokeColor) {
        for (const line of geometry.horizontalLines) {
          page.drawLine({
            start: { x: line.x1, y: toPdfY(line.y1) },
            end: { x: line.x2, y: toPdfY(line.y2) },
            thickness,
            color: strokeColor,
          });
        }
        for (const line of geometry.verticalLines) {
          page.drawLine({
            start: { x: line.x1, y: toPdfY(line.y1) },
            end: { x: line.x2, y: toPdfY(line.y2) },
            thickness,
            color: strokeColor,
          });
        }
      }
      break;
    }

    case 'dot-grid': {
      const points = calculateDotGridPoints(width, height, marginTop, marginBottom, marginLeft, marginRight, template, true);
      const dotRadius = Math.max(0.5, (template.dotSize ?? 1.5) / 2);
      if (strokeColor) {
        for (const pt of points) {
          page.drawCircle({
            x: pt.x,
            y: toPdfY(pt.y),
            size: dotRadius,
            color: strokeColor,
          });
        }
      }
      break;
    }

    case 'cornell': {
      const geometry = calculateCornellLayout(width, height, marginTop, marginBottom, marginLeft, marginRight, template);
      const dividerColor = marginColor ?? strokeColor;
      if (dividerColor) {
        page.drawLine({
          start: { x: geometry.headerLine.x1, y: toPdfY(geometry.headerLine.y1) },
          end: { x: geometry.headerLine.x2, y: toPdfY(geometry.headerLine.y2) },
          thickness: 1.25,
          color: dividerColor,
        });
        page.drawLine({
          start: { x: geometry.summaryLine.x1, y: toPdfY(geometry.summaryLine.y1) },
          end: { x: geometry.summaryLine.x2, y: toPdfY(geometry.summaryLine.y2) },
          thickness: 1.25,
          color: dividerColor,
        });
        page.drawLine({
          start: { x: geometry.cueDividerLine.x1, y: toPdfY(geometry.cueDividerLine.y1) },
          end: { x: geometry.cueDividerLine.x2, y: toPdfY(geometry.cueDividerLine.y2) },
          thickness: 1.25,
          color: dividerColor,
        });
      }
      if (strokeColor) {
        for (const line of geometry.ruledLines) {
          page.drawLine({
            start: { x: line.x1, y: toPdfY(line.y1) },
            end: { x: line.x2, y: toPdfY(line.y2) },
            thickness,
            color: strokeColor,
          });
        }
      }
      break;
    }

    case 'music-staff': {
      const staffs = calculateMusicStaffs(width, height, marginTop, marginBottom, marginLeft, marginRight, template);
      if (strokeColor) {
        for (const staff of staffs) {
          for (const line of staff.lines) {
            page.drawLine({
              start: { x: line.x1, y: toPdfY(line.y1) },
              end: { x: line.x2, y: toPdfY(line.y2) },
              thickness,
              color: strokeColor,
            });
          }
        }
      }
      break;
    }
  }
}

export async function cssHexToPdfRgb(color: string) {
  const trimmed = color.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(trimmed);

  if (!match) {
    return null;
  }

  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;

  const { rgb } = await pdfLib();
  return rgb(red, green, blue);
}
