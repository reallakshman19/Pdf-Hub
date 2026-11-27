import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  inspectAdmittedDonorPdfs,
  type AdmittedDonorPdf,
} from '@/core/admission/donorPdf';
import { isOperationCancelledError } from '@/core/cancellation/operationCancellation';
import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type PdfCommandSource,
} from '@/core/commands/types';
import type { Toast } from '@/core/toast/store';
import {
  applyBatesNumbering,
  type BatesNumberingOptions,
} from './pdfBatesNumbering';
import {
  collatePdfDocuments,
  type CollationMode,
} from './pdfCollation';
import {
  calculateContentBoundingBoxFromRgba,
  cropPdfMargins,
  type CropMarginOptions,
  type DetectedBoundingBox,
} from './pdfMarginCropping';
import {
  normalizePdfPageDimensions,
  type NormalizeOptions,
} from './pdfNormalization';

export type AddOrganizeToastFn = (toast: Omit<Toast, 'id'>) => void;

export type OrganizeQuickAction = 'bates' | 'crop' | 'normalize' | 'collate';

let pendingOrganizeAction: OrganizeQuickAction | null = null;

export function queuePendingOrganizeAction(action: OrganizeQuickAction): void {
  pendingOrganizeAction = action;
}

export function peekPendingOrganizeAction(): OrganizeQuickAction | null {
  return pendingOrganizeAction;
}

export function consumePendingOrganizeAction(): OrganizeQuickAction | null {
  const next = pendingOrganizeAction;
  pendingOrganizeAction = null;
  return next;
}

async function commitWorkingCopyBytes(input: {
  workingBytes: Uint8Array;
  documentKey: string;
  binaryResourceId: string;
  nextBytes: Uint8Array;
  nextPageCount: number;
  reason: string;
  sourceTag: PdfCommandSource;
  signal?: AbortSignal;
}) {
  return commandBus.execute({
    workingBytes: input.workingBytes,
    command: materializePdfCommand(
      {
        type: 'APPLY_WORKING_COPY',
        payload: {
          binaryResourceId: input.binaryResourceId,
          nextPageCount: input.nextPageCount,
          reason: input.reason,
        },
      },
      input.sourceTag,
      input.documentKey,
    ),
    resources: {
      binaries: {
        [input.binaryResourceId]: input.nextBytes,
      },
    },
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

export async function executeNormalizePageDimensions(input: {
  workingBytes: Uint8Array;
  documentKey: string;
  pageCount: number;
  options: NormalizeOptions;
  addToast: AddOrganizeToastFn;
  sourceTag?: PdfCommandSource;
}): Promise<boolean> {
  try {
    const result = await normalizePdfPageDimensions(input.workingBytes, input.options);
    const cmdResult = await commitWorkingCopyBytes({
      workingBytes: input.workingBytes,
      documentKey: input.documentKey,
      binaryResourceId: 'binary:normalized',
      nextBytes: result.normalizedBytes,
      nextPageCount: input.pageCount,
      reason: `Normalize page dimensions (${input.options.preset})`,
      sourceTag: input.sourceTag ?? 'toolbar',
    });

    if (!cmdResult.success) {
      if (cmdResult.error?.code === 'CANCELLED') return false;
      input.addToast({
        type: 'error',
        title: 'Normalization Failed',
        message: cmdResult.error?.message ?? cmdResult.message,
      });
      return false;
    }

    input.addToast({
      type: 'success',
      title: 'Normalization Complete',
      message: `Normalized ${result.modifiedPageCount} page(s) to ${input.options.preset}.`,
    });
    return true;
  } catch (err) {
    input.addToast({
      type: 'error',
      title: 'Normalization Failed',
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function executeBatesNumbering(input: {
  workingBytes: Uint8Array;
  documentKey: string;
  pageCount: number;
  options: BatesNumberingOptions;
  addToast: AddOrganizeToastFn;
  sourceTag?: PdfCommandSource;
}): Promise<boolean> {
  try {
    const result = await applyBatesNumbering(input.workingBytes, input.options);
    const cmdResult = await commitWorkingCopyBytes({
      workingBytes: input.workingBytes,
      documentKey: input.documentKey,
      binaryResourceId: 'binary:bates',
      nextBytes: result.modifiedBytes,
      nextPageCount: input.pageCount,
      reason: `Bates numbering (${result.sampleFirstStamp})`,
      sourceTag: input.sourceTag ?? 'toolbar',
    });

    if (!cmdResult.success) {
      if (cmdResult.error?.code === 'CANCELLED') return false;
      input.addToast({
        type: 'error',
        title: 'Bates Numbering Failed',
        message: cmdResult.error?.message ?? cmdResult.message,
      });
      return false;
    }

    input.addToast({
      type: 'success',
      title: 'Bates Numbering Complete',
      message: `Stamped ${result.stampedPageCount} page(s) (e.g. ${result.sampleFirstStamp}).`,
    });
    return true;
  } catch (err) {
    input.addToast({
      type: 'error',
      title: 'Bates Numbering Error',
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function executeCropPdfMargins(input: {
  workingBytes: Uint8Array;
  documentKey: string;
  pageCount: number;
  options: CropMarginOptions;
  addToast: AddOrganizeToastFn;
  sourceTag?: PdfCommandSource;
}): Promise<boolean> {
  try {
    let detectedBoxes: Record<number, DetectedBoundingBox> | undefined;

    if (input.options.mode === 'auto') {
      try {
        const lease = await PdfRendererAdapter.acquireDocument(input.workingBytes);
        try {
          detectedBoxes = {};
          const indices =
            input.options.pageIndices
            ?? Array.from({ length: input.pageCount }, (_, i) => i);
          for (const idx of indices) {
            try {
              const pageProxy = await lease.doc.getPage(idx + 1);
              const viewport = pageProxy.getViewport({ scale: 1.0 });
              const canvas = document.createElement('canvas');
              await PdfRendererAdapter.renderPage(pageProxy, canvas, viewport).completed;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx && canvas.width > 0 && canvas.height > 0) {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const cropOffset = pageProxy.view
                  ? { x: pageProxy.view[0], y: pageProxy.view[1] }
                  : { x: 0, y: 0 };
                detectedBoxes[idx] = calculateContentBoundingBoxFromRgba(
                  imgData.data,
                  canvas.width,
                  canvas.height,
                  viewport.width,
                  viewport.height,
                  input.options.autoPaddingPt ?? 14,
                  pageProxy.rotate ?? 0,
                  cropOffset,
                );
              }
              canvas.width = 0;
              canvas.height = 0;
            } catch {
              // Fallback to conservative trim inside cropPdfMargins
            }
          }
        } finally {
          await lease.release();
        }
      } catch {
        // Fallback to conservative trim if auto detection fails
      }
    }

    const result = await cropPdfMargins(input.workingBytes, {
      ...input.options,
      detectedBoxes,
    });
    const cmdResult = await commitWorkingCopyBytes({
      workingBytes: input.workingBytes,
      documentKey: input.documentKey,
      binaryResourceId: 'binary:cropped',
      nextBytes: result.modifiedBytes,
      nextPageCount: input.pageCount,
      reason: `Crop margins (${input.options.mode})`,
      sourceTag: input.sourceTag ?? 'toolbar',
    });

    if (!cmdResult.success) {
      if (cmdResult.error?.code === 'CANCELLED') return false;
      input.addToast({
        type: 'error',
        title: 'Crop Margins Failed',
        message: cmdResult.error?.message ?? cmdResult.message,
      });
      return false;
    }

    input.addToast({
      type: 'success',
      title: 'Crop Margins Complete',
      message: `Cropped margins on ${result.croppedPageCount} page(s).`,
    });
    return true;
  } catch (err) {
    input.addToast({
      type: 'error',
      title: 'Crop Margins Error',
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function executeCollateWithDonor(input: {
  workingBytes: Uint8Array;
  documentKey: string;
  donor: AdmittedDonorPdf;
  donorDocumentKey: string;
  config: {
    mode: CollationMode;
    donorPageIndices?: number[];
  };
  signal?: AbortSignal;
  addToast: AddOrganizeToastFn;
  sourceTag?: PdfCommandSource;
}): Promise<boolean> {
  try {
    const resolved = inspectAdmittedDonorPdfs(
      'INSERT_PAGES',
      [input.donor],
      input.donorDocumentKey,
    );
    const collatedBytes = await collatePdfDocuments(
      input.workingBytes,
      resolved[0]!.bytes,
      {
        mode: input.config.mode,
        donorPageIndices: input.config.donorPageIndices,
        signal: input.signal,
      },
    );
    const nextPageCount = await PdfEditAdapter.countPages(collatedBytes);
    const modeLabel = input.config.mode === 'reverse-duplex' ? 'Reverse Duplex' : 'Forward';
    const cmdResult = await commitWorkingCopyBytes({
      workingBytes: input.workingBytes,
      documentKey: input.documentKey,
      binaryResourceId: 'binary:collated',
      nextBytes: collatedBytes,
      nextPageCount,
      reason: `Collate with ${input.donor.fileName} (${modeLabel})`,
      sourceTag: input.sourceTag ?? 'toolbar',
      signal: input.signal,
    });

    if (!cmdResult.success) {
      if (cmdResult.error?.code === 'CANCELLED') return false;
      input.addToast({
        type: 'error',
        title: 'Collation Failed',
        message: cmdResult.error?.message ?? cmdResult.message,
      });
      return false;
    }

    input.addToast({
      type: 'success',
      title: 'Collation Complete',
      message: `Collated with ${input.donor.fileName} (${modeLabel}). Total pages: ${nextPageCount}.`,
    });
    return true;
  } catch (err) {
    if (!isOperationCancelledError(err)) {
      input.addToast({
        type: 'error',
        title: 'Collation Failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return false;
  }
}
