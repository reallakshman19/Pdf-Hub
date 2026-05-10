import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import { macroRegistry } from '../registry';
import type {
  MacroMutableState,
  SideEffect,
  StepResult,
} from '../registry';
import type {
  MacroExecutionContext,
  MacroStep,
} from '../types';
import {
  buildContentPagePdf,
  buildImageHeaderPagePdf,
} from '../layout/LayoutEngine';

function success(
  message: string,
  sideEffects: SideEffect[],
): StepResult {
  return {
    status: 'success',
    message,
    sideEffects: [
      ...sideEffects,
      {
        type: 'log',
        message,
      },
    ],
  };
}

function failure(err: unknown): StepResult {
  return {
    status: 'error',
    message: err instanceof Error ? err.message : String(err),
    sideEffects: [],
  };
}

function bytesEffect(bytes: Uint8Array): SideEffect {
  return {
    type: 'bytes_updated',
    bytes,
  };
}

function pageCountEffect(newCount: number): SideEffect {
  return {
    type: 'page_count_changed',
    newCount,
  };
}

function resolveInsertIndexForPosition(
  position: Extract<MacroStep, { op: 'add_content_page' }>['position'],
  pageCount: number,
): number {
  if (position.mode === 'start') return 0;
  if (position.mode === 'end') return pageCount;
  if (position.mode === 'before') return Math.max(0, Math.min(position.page - 1, pageCount));
  if (position.mode === 'after') return Math.max(0, Math.min(position.page, pageCount));

  return pageCount;
}

type MergeFilesStep = Extract<MacroStep, { op: 'merge_files' }>;

async function executeMergeFiles(
  step: MergeFilesStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const donorBytes = step.donorFileIds.map((donorFileId) => {
      const bytes = ctx.donorFiles?.[donorFileId];

      if (!bytes) {
        throw new Error(`merge_files failed: donor file "${donorFileId}" was not provided.`);
      }

      return bytes;
    });

    const updatedBytes = await PdfEditAdapter.merge(state.workingBytes, donorBytes);
    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);

    return success(
      `Merged ${donorBytes.length} donor file(s).`,
      [
        bytesEffect(updatedBytes),
        pageCountEffect(newPageCount),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('merge_files', executeMergeFiles);

type InsertPdfStep = Extract<MacroStep, { op: 'insert_pdf' }>;

async function executeInsertPdf(
  step: InsertPdfStep,
  ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const donorBytes = ctx.donorFiles?.[step.donorFileId];

    if (!donorBytes) {
      return {
        status: 'error',
        message: `insert_pdf failed: donor file "${step.donorFileId}" was not provided.`,
        sideEffects: [],
      };
    }

    const updatedBytes = await PdfEditAdapter.insertAt(
      state.workingBytes,
      donorBytes,
      step.atIndex,
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);

    return success(
      `Inserted donor file "${step.donorFileId}" at index ${step.atIndex}.`,
      [
        bytesEffect(updatedBytes),
        pageCountEffect(newPageCount),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('insert_pdf', executeInsertPdf);

type AddContentPageStep = Extract<MacroStep, { op: 'add_content_page' }>;

async function executeAddContentPage(
  step: AddContentPageStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pagePdf = await buildContentPagePdf({
      size: step.size,
      background: step.background,
      blocks: step.blocks,
    });

    const insertIndex = resolveInsertIndexForPosition(step.position, state.pageCount);
    const updatedBytes = await PdfEditAdapter.insertAt(
      state.workingBytes,
      pagePdf,
      insertIndex,
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);

    return success(
      `Added content page at index ${insertIndex}.`,
      [
        bytesEffect(updatedBytes),
        pageCountEffect(newPageCount),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('add_content_page', executeAddContentPage);

type AddImageHeaderPageStep = Extract<MacroStep, { op: 'add_image_header_page' }>;

async function executeAddImageHeaderPage(
  step: AddImageHeaderPageStep,
  _ctx: MacroExecutionContext,
  state: MacroMutableState,
): Promise<StepResult> {
  try {
    const pagePdf = await buildImageHeaderPagePdf({
      size: step.size,
      imageSrc: step.imageSrc,
      headerHeight: step.headerHeight,
      title: step.title,
      subtitle: step.subtitle,
      bodyMarkdown: step.bodyMarkdown,
    });

    const insertIndex = resolveInsertIndexForPosition(step.position, state.pageCount);
    const updatedBytes = await PdfEditAdapter.insertAt(
      state.workingBytes,
      pagePdf,
      insertIndex,
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes);

    return success(
      `Added image header page at index ${insertIndex}.`,
      [
        bytesEffect(updatedBytes),
        pageCountEffect(newPageCount),
      ],
    );
  } catch (err) {
    return failure(err);
  }
}

macroRegistry.register('add_image_header_page', executeAddImageHeaderPage);