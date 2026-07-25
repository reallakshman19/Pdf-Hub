import { documentBus } from '../events/bus';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import {
  consumeAdmittedDonorPdfs,
  inspectAdmittedDonorPdfs,
  isDonorAdmissionBoundaryError,
  DonorAdmissionBoundaryError,
} from '@/core/admission/donorPdf';
import {
  isOperationCancelledError,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';
import {
  remapAfterDelete,
  remapAfterDuplicate,
  remapAfterInsert,
  remapAfterReorder,
  remapAfterRotate,
} from '@/core/annotations/pageRemapper';
import type { PdfAnnotation } from '@/core/annotations/types';
import {
  commitDocumentMutation,
  isDocumentMutationTransactionError,
} from './transaction/documentTransaction';
import type {
  CommandArtifact,
  CommandErrorCode,
  CommandPayload,
  CommandResult,
  CommandSource,
  DocumentCommand,
} from './types';

type ResolvedCommandContext = {
  workingBytes: Uint8Array;
  currentPage: number;
  selectedPages: number[];
  fileName: string;
  documentKey: string | null;
};

function commandError(
  command: DocumentCommand['type'],
  source: CommandSource,
  code: CommandErrorCode,
  message: string,
  details?: string,
): CommandResult {
  return {
    success: false,
    command,
    source,
    mutated: false,
    message,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function commandSuccess(
  command: DocumentCommand['type'],
  source: CommandSource,
  mutated: boolean,
  message: string,
  nextBytes?: Uint8Array,
  nextPageCount?: number,
  artifacts?: CommandArtifact[],
): CommandResult {
  return {
    success: true,
    command,
    source,
    mutated,
    message,
    ...(nextBytes ? { nextBytes } : {}),
    ...(typeof nextPageCount === 'number' ? { nextPageCount } : {}),
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
  };
}

function resolveContext(payload: CommandPayload): ResolvedCommandContext | null {
  const session = useSessionStore.getState();
  const workingBytes = payload.workingBytes ?? session.workingBytes;
  if (!workingBytes) {
    return null;
  }

  return {
    workingBytes,
    currentPage: payload.context?.currentPage ?? session.viewState.currentPage,
    selectedPages: payload.context?.selectedPages ?? session.selectedPages,
    fileName: payload.context?.fileName ?? session.fileName ?? 'document.pdf',
    documentKey: payload.context?.documentKey ?? session.documentKey,
  };
}

function commandLabel(command: DocumentCommand): string {
  switch (command.type) {
    case 'ROTATE_PAGES':
      return `Rotate ${command.pageIndices.length} page(s)`;
    case 'REORDER_PAGES':
      return 'Reorder page';
    case 'REORDER_PAGES_BY_ORDER':
      return 'Reorder pages';
    case 'EXTRACT_PAGES':
      return `Extract ${command.pageIndices.length} page(s)`;
    case 'SPLIT_PAGES':
      return `Split ${command.pageIndices.length} page(s)`;
    case 'DELETE_PAGES':
      return `Delete ${command.pageIndices.length} page(s)`;
    case 'INSERT_PAGES':
      return 'Insert pages';
    case 'INSERT_BLANK_PAGE':
      return 'Insert blank page';
    case 'REPLACE_PAGE':
      return 'Replace page';
    case 'DUPLICATE_PAGES':
      return `Duplicate ${command.pageIndices.length} page(s)`;
    case 'MERGE_PDF':
      return `Merge ${command.donors.length} file(s)`;
    case 'ADD_HEADER_FOOTER_TEXT':
      return 'Add header/footer text';
    case 'DRAW_TEXT_ON_PAGES':
      return 'Draw text on pages';
    case 'DRAW_REDACTION_BOX':
      return 'Draw visual mask';
    case 'REPLACE_WORKING_COPY':
      return command.reason ?? 'Apply macro output';
  }
}

function sanitizePageIndices(pageIndices: number[], pageCount: number): number[] {
  return Array.from(new Set(pageIndices))
    .filter((index) => index >= 0 && index < pageCount)
    .sort((left, right) => left - right);
}

function outputName(prefix: string, pageIndices: number[], fallback?: string): string {
  if (fallback && fallback.trim().length > 0) {
    return fallback;
  }
  const humanPages = pageIndices.map((index) => index + 1).join('-');
  return `${prefix}-${humanPages}.pdf`;
}

function assertDonorCommandCurrent(
  context: ResolvedCommandContext,
  payload: CommandPayload,
  operation: string,
): void {
  throwIfAborted(payload.signal, operation);
  if (!context.documentKey) {
    throw new DonorAdmissionBoundaryError(
      'Donor commands require an active document identity.',
    );
  }
  if (useSessionStore.getState().documentKey !== context.documentKey) {
    throw new DonorAdmissionBoundaryError(
      'The active document changed before the donor command could commit.',
    );
  }
}

async function applyMutation(
  command: DocumentCommand,
  source: CommandSource,
  beforeBytes: Uint8Array,
  afterBytes: Uint8Array,
  nextAnnotations?: PdfAnnotation[],
): Promise<{ nextBytes: Uint8Array; nextPageCount: number }> {
  return commitDocumentMutation({
    command,
    source,
    label: commandLabel(command),
    beforeBytes,
    afterBytes,
    nextAnnotations,
  });
}

export async function dispatchCommand(payload: CommandPayload): Promise<CommandResult> {
  const { command, source } = payload;
  const context = resolveContext(payload);
  if (!context) {
    return commandError(
      command.type,
      source,
      'NO_WORKING_DOCUMENT',
      'No working document is available in the session',
    );
  }

  const pageCount = await PdfEditAdapter.countPages(context.workingBytes);

  try {
    switch (command.type) {
      case 'ROTATE_PAGES': {
        const pageIndices = sanitizePageIndices(command.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No pages selected for rotation');
        }
        // Capture page dimensions BEFORE rotation for annotation coordinate transform
        const rotations = await Promise.all(
          pageIndices.map(async (idx) => {
            const { width, height } = await PdfEditAdapter.getPageSize(context.workingBytes, idx);
            return { pageIndex: idx, angle: command.angle, width, height };
          }),
        );
        const nextAnnotations = remapAfterRotate(useAnnotationStore.getState().annotations, rotations);
        const nextBytes = await PdfEditAdapter.rotatePages(context.workingBytes, pageIndices, command.angle);
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Pages rotated', result.nextBytes, result.nextPageCount);
      }

      case 'REORDER_PAGES': {
        // Build full order array (order[newIndex] = oldIndex) from the single fromIndex→toIndex move
        const order = Array.from({ length: pageCount }, (_, i) => i);
        const [moved] = order.splice(command.fromIndex, 1);
        order.splice(command.toIndex, 0, moved);
        const nextAnnotations = remapAfterReorder(useAnnotationStore.getState().annotations, order);
        const nextBytes = await PdfEditAdapter.movePage(context.workingBytes, command.fromIndex, command.toIndex);
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Page reordered', result.nextBytes, result.nextPageCount);
      }

      case 'REORDER_PAGES_BY_ORDER': {
        const nextAnnotations = remapAfterReorder(useAnnotationStore.getState().annotations, command.order);
        const nextBytes = await PdfEditAdapter.reorderPages(context.workingBytes, command.order);
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Pages reordered', result.nextBytes, result.nextPageCount);
      }

      case 'EXTRACT_PAGES': {
        const pageIndices = sanitizePageIndices(command.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No pages selected for extraction');
        }
        const extractedBytes = await PdfEditAdapter.extractPages(context.workingBytes, pageIndices);
        return commandSuccess(command.type, source, false, 'Pages extracted', undefined, undefined, [
          {
            kind: 'pdf',
            name: outputName('extract-pages', pageIndices, command.outputName),
            bytes: extractedBytes,
          },
        ]);
      }

      case 'SPLIT_PAGES': {
        const pageIndices = sanitizePageIndices(command.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No pages selected for split');
        }
        const extractedBytes = await PdfEditAdapter.extractPages(context.workingBytes, pageIndices);
        const nextAnnotations = remapAfterDelete(useAnnotationStore.getState().annotations, pageIndices);
        const nextBytes = await PdfEditAdapter.removePages(context.workingBytes, pageIndices);
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Pages split into a new file', result.nextBytes, result.nextPageCount, [
          {
            kind: 'pdf',
            name: outputName('split-pages', pageIndices, command.outputName),
            bytes: extractedBytes,
          },
        ]);
      }

      case 'DELETE_PAGES': {
        const pageIndices = sanitizePageIndices(command.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No pages selected for deletion');
        }
        const nextAnnotations = remapAfterDelete(useAnnotationStore.getState().annotations, pageIndices);
        const nextBytes = await PdfEditAdapter.removePages(context.workingBytes, pageIndices);
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Pages deleted', result.nextBytes, result.nextPageCount);
      }

      case 'INSERT_PAGES': {
        assertDonorCommandCurrent(context, payload, 'insert donor pages: before mutation');
        inspectAdmittedDonorPdfs('INSERT_PAGES', [command.donor], context.documentKey);
        const [donor] = consumeAdmittedDonorPdfs(
          'INSERT_PAGES',
          [command.donor],
          context.documentKey,
        );
        const nextAnnotations = remapAfterInsert(
          useAnnotationStore.getState().annotations,
          command.atIndex,
          donor.pageCount,
        );
        const nextBytes = await PdfEditAdapter.insertAt(
          context.workingBytes,
          donor.bytes,
          command.atIndex,
        );
        assertDonorCommandCurrent(context, payload, 'insert donor pages: before commit');
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Pages inserted', result.nextBytes, result.nextPageCount);
      }

      case 'INSERT_BLANK_PAGE': {
        const nextAnnotations = remapAfterInsert(useAnnotationStore.getState().annotations, command.atIndex, 1);
        const nextBytes = await PdfEditAdapter.insertBlankPage(
          context.workingBytes,
          command.atIndex,
          command.size,
        );
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Blank page inserted', result.nextBytes, result.nextPageCount);
      }

      case 'REPLACE_PAGE': {
        assertDonorCommandCurrent(context, payload, 'replace page: before mutation');
        const [inspectedDonor] = inspectAdmittedDonorPdfs(
          'REPLACE_PAGE',
          [command.donor],
          context.documentKey,
        );
        if (
          !Number.isInteger(command.donorPageIndex)
          || command.donorPageIndex < 0
          || command.donorPageIndex >= inspectedDonor.pageCount
        ) {
          return commandError(
            command.type,
            source,
            'VALIDATION_FAILED',
            'The selected donor page is outside the admitted donor page range',
          );
        }
        const [donor] = consumeAdmittedDonorPdfs(
          'REPLACE_PAGE',
          [command.donor],
          context.documentKey,
        );
        // Treat as delete-then-insert: annotations on replaced page are cleared.
        const nextAnnotations = remapAfterInsert(
          remapAfterDelete(useAnnotationStore.getState().annotations, [command.atIndex]),
          command.atIndex,
          1,
        );
        const nextBytes = await PdfEditAdapter.replacePage(
          context.workingBytes,
          command.atIndex,
          donor.bytes,
          command.donorPageIndex,
        );
        assertDonorCommandCurrent(context, payload, 'replace page: before commit');
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Page replaced', result.nextBytes, result.nextPageCount);
      }

      case 'DUPLICATE_PAGES': {
        const pageIndices = sanitizePageIndices(command.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No pages selected for duplication');
        }
        const nextAnnotations = remapAfterDuplicate(useAnnotationStore.getState().annotations, pageIndices);
        const nextBytes = await PdfEditAdapter.duplicatePages(context.workingBytes, pageIndices);
        const result = await applyMutation(command, source, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command.type, source, true, 'Pages duplicated', result.nextBytes, result.nextPageCount);
      }

      case 'MERGE_PDF': {
        if (command.donors.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No donor files provided for merge');
        }
        assertDonorCommandCurrent(context, payload, 'merge donor PDFs: before mutation');
        inspectAdmittedDonorPdfs('MERGE_PDF', command.donors, context.documentKey);
        const donors = consumeAdmittedDonorPdfs(
          'MERGE_PDF',
          command.donors,
          context.documentKey,
        );
        const nextBytes = await PdfEditAdapter.merge(
          context.workingBytes,
          donors.map((donor) => donor.bytes),
        );
        assertDonorCommandCurrent(context, payload, 'merge donor PDFs: before commit');
        const result = await applyMutation(command, source, context.workingBytes, nextBytes);
        return commandSuccess(command.type, source, true, 'Files merged', result.nextBytes, result.nextPageCount);
      }

      case 'ADD_HEADER_FOOTER_TEXT': {
        const selectedIndices = sanitizePageIndices(command.pageIndices, pageCount);
        const pageIndices = selectedIndices.filter((index) => {
          const pageNumber = index + 1;
          if (command.options.excludeFirstPage && pageNumber === 1) return false;
          if (command.options.excludeLastPage && pageNumber === pageCount) return false;
          return true;
        });
        if (pageIndices.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No pages selected for header/footer text');
        }
        const nextBytes = await PdfEditAdapter.addHeaderFooterText(context.workingBytes, {
          pages: pageIndices,
          zone: command.options.zone,
          text: command.options.text,
          align: command.options.align,
          marginX: command.options.marginX,
          marginY: command.options.marginY,
          fontSize: command.options.fontSize,
          color: command.options.color ?? '#374151',
          opacity: command.options.opacity ?? 0.9,
          fileName: context.fileName,
          now: new Date(),
          enablePageNumberToken: command.options.pageNumberToken ?? true,
          enableFileNameToken: command.options.fileNameToken ?? false,
          enableDateToken: command.options.dateToken ?? false,
        });
        const result = await applyMutation(command, source, context.workingBytes, nextBytes);
        return commandSuccess(command.type, source, true, 'Header/footer text applied', result.nextBytes, result.nextPageCount);
      }

      case 'DRAW_TEXT_ON_PAGES': {
        const pageIndices = sanitizePageIndices(command.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No pages selected for drawing text');
        }
        const nextBytes = await PdfEditAdapter.drawTextOnPages(context.workingBytes, {
          pages: pageIndices,
          text: command.options.text,
          x: command.options.x,
          y: command.options.y,
          fontSize: command.options.fontSize,
          color: command.options.color ?? '#111827',
          opacity: command.options.opacity ?? 0.95,
          align: command.options.align ?? 'left',
          rotation: command.options.rotation,
          fileName: context.fileName,
          now: new Date(),
          enablePageNumberToken: command.options.pageNumberToken ?? true,
          enableFileNameToken: command.options.fileNameToken ?? false,
          enableDateToken: command.options.dateToken ?? false,
        });
        const result = await applyMutation(command, source, context.workingBytes, nextBytes);
        return commandSuccess(command.type, source, true, 'Text applied to pages', result.nextBytes, result.nextPageCount);
      }

      case 'DRAW_REDACTION_BOX': {
        const pageIndices = sanitizePageIndices(command.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command.type, source, 'VALIDATION_FAILED', 'No pages selected for visual masking');
        }
        const nextBytes = await PdfEditAdapter.drawRedactionBoxes(context.workingBytes, {
          pages: pageIndices,
          x: command.options.x,
          y: command.options.y,
          width: command.options.width,
          height: command.options.height,
          fillColor: command.options.fillColor ?? '#ffffff',
        });
        const result = await applyMutation(command, source, context.workingBytes, nextBytes);
        return commandSuccess(
          command.type,
          source,
          true,
          'Visual mask applied. Underlying PDF content was not securely removed.',
          result.nextBytes,
          result.nextPageCount,
        );
      }

      case 'REPLACE_WORKING_COPY': {
        const nextBytes = command.nextBytes;
        const resolvedPageCount = typeof command.nextPageCount === 'number'
          ? command.nextPageCount
          : await PdfEditAdapter.countPages(nextBytes);
        const result = await applyMutation(command, source, context.workingBytes, nextBytes);
        documentBus.emit({ type: 'DOCUMENT_REPLACED' });
        return commandSuccess(
          command.type,
          source,
          true,
          command.reason ?? 'Working copy replaced',
          result.nextBytes,
          resolvedPageCount,
        );
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Command execution failed';
    if (isOperationCancelledError(error)) {
      return commandError(command.type, source, 'CANCELLED', message);
    }
    if (isDonorAdmissionBoundaryError(error)) {
      return commandError(command.type, source, 'ADMISSION_REJECTED', message);
    }
    const details = isDocumentMutationTransactionError(error)
      ? `transaction-stage=${error.stage}`
      : undefined;
    return commandError(command.type, source, 'EXECUTION_FAILED', message, details);
  }
}
