import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';
import type { PdfEditOperationOptions } from '../../../adapters/pdf-edit/PdfEditAdapter';
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

function operationArgs(
  signal: AbortSignal | undefined,
): [] | [PdfEditOperationOptions] {
  return signal ? [{ signal }] : [];
}

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

function skipped(message: string): StepResult {
  return {
    status: 'warning',
    message,
    sideEffects: [
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
    const missingDonorIds = step.donorFileIds.filter((donorFileId) => {
      return !ctx.donorFiles?.[donorFileId];
    });

    if (missingDonorIds.length > 0) {
      return skipped(
        `Skipped merge_files: missing donor file(s): ${missingDonorIds.join(', ')}.`,
      );
    }

    const donorBytes = step.donorFileIds.map((donorFileId) => {
      return ctx.donorFiles?.[donorFileId] as Uint8Array;
    });

    const updatedBytes = await PdfEditAdapter.merge(state.workingBytes, donorBytes, ...operationArgs(ctx.options?.abortSignal));
    const newPageCount = await PdfEditAdapter.countPages(updatedBytes, ...operationArgs(ctx.options?.abortSignal));

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
      ...operationArgs(ctx.options?.abortSignal),
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes, ...operationArgs(ctx.options?.abortSignal));

    return success(
      `Inserted PDF at index ${step.atIndex} from donor file "${step.donorFileId}".`,
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
  ctx: MacroExecutionContext,
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
      ...operationArgs(ctx.options?.abortSignal),
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes, ...operationArgs(ctx.options?.abortSignal));

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
  ctx: MacroExecutionContext,
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
      ...operationArgs(ctx.options?.abortSignal),
    );

    const newPageCount = await PdfEditAdapter.countPages(updatedBytes, ...operationArgs(ctx.options?.abortSignal));

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