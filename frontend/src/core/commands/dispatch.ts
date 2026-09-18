import { documentBus } from '../events/bus';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import {
  consumeAdmittedDonorPdfs,
  inspectAdmittedDonorPdfs,
  isDonorAdmissionBoundaryError,
  DonorAdmissionBoundaryError,
  type AdmittedDonorPdf,
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
  CommandExecutionInput,
  CommandResult,
  PdfCommand,
} from './types';

type ResolvedCommandContext = {
  workingBytes: Uint8Array;
  currentPage: number;
  selectedPages: number[];
  fileName: string;
  documentKey: string;
};

function commandError(
  command: PdfCommand,
  code: CommandErrorCode,
  message: string,
  details?: string,
): CommandResult {
  return {
    success: false,
    commandId: command.id,
    commandType: command.type,
    source: command.source,
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
  command: PdfCommand,
  mutated: boolean,
  message: string,
  nextBytes?: Uint8Array,
  nextPageCount?: number,
  artifacts?: CommandArtifact[],
): CommandResult {
  return {
    success: true,
    commandId: command.id,
    commandType: command.type,
    source: command.source,
    mutated,
    message,
    ...(nextBytes ? { nextBytes } : {}),
    ...(typeof nextPageCount === 'number' ? { nextPageCount } : {}),
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
  };
}

function resolveContext(input: CommandExecutionInput): ResolvedCommandContext | null {
  const session = useSessionStore.getState();
  const workingBytes = input.workingBytes ?? session.workingBytes;
  if (!workingBytes) return null;

  return {
    workingBytes,
    currentPage: input.context?.currentPage ?? session.viewState.currentPage,
    selectedPages: input.context?.selectedPages ?? session.selectedPages,
    fileName: input.context?.fileName ?? session.fileName ?? 'document.pdf',
    documentKey: input.command.documentKey,
  };
}

function commandLabel(command: PdfCommand): string {
  switch (command.type) {
    case 'ROTATE_PAGES':
      return `Rotate ${command.payload.pageIndices.length} page(s)`;
    case 'REORDER_PAGES':
      return 'Reorder page';
    case 'REORDER_PAGES_BY_ORDER':
      return 'Reorder pages';
    case 'EXTRACT_PAGES':
      return `Extract ${command.payload.pageIndices.length} page(s)`;
    case 'SPLIT_PAGES':
      return `Split ${command.payload.pageIndices.length} page(s)`;
    case 'DELETE_PAGES':
      return `Delete ${command.payload.pageIndices.length} page(s)`;
    case 'INSERT_PAGES':
      return 'Insert pages';
    case 'INSERT_BLANK_PAGE':
      return 'Insert blank page';
    case 'REPLACE_PAGE':
      return 'Replace page';
    case 'DUPLICATE_PAGES':
      return `Duplicate ${command.payload.pageIndices.length} page(s)`;
    case 'MERGE_PDF':
      return `Merge ${command.payload.donorResourceIds.length} file(s)`;
    case 'ADD_HEADER_FOOTER_TEXT':
      return 'Add header/footer text';
    case 'DRAW_TEXT_ON_PAGES':
      return 'Draw text on pages';
    case 'DRAW_REDACTION_BOX':
      return 'Draw visual mask';
    case 'APPLY_WORKING_COPY':
      return command.payload.reason ?? command.payload.macro?.recipeName ?? 'Apply working copy';
  }
}

function sanitizePageIndices(pageIndices: number[], pageCount: number): number[] {
  return Array.from(new Set(pageIndices))
    .filter((index) => index >= 0 && index < pageCount)
    .sort((left, right) => left - right);
}

function outputName(prefix: string, pageIndices: number[], fallback?: string): string {
  if (fallback && fallback.trim().length > 0) return fallback;
  const humanPages = pageIndices.map((index) => index + 1).join('-');
  return `${prefix}-${humanPages}.pdf`;
}

function activeDocumentKey(input: CommandExecutionInput): string | null {
  return input.context?.documentKey ?? useSessionStore.getState().documentKey;
}

function assertCommandDocumentCurrent(input: CommandExecutionInput): CommandResult | null {
  const activeKey = activeDocumentKey(input);
  if (!activeKey || activeKey === input.command.documentKey) return null;
  return commandError(
    input.command,
    'STALE_DOCUMENT',
    'The active document changed before this command could execute.',
  );
}

function assertDonorCommandCurrent(
  context: ResolvedCommandContext,
  input: CommandExecutionInput,
  operation: string,
): void {
  throwIfAborted(input.signal, operation);
  if (useSessionStore.getState().documentKey !== context.documentKey) {
    throw new DonorAdmissionBoundaryError(
      'The active document changed before the donor command could commit.',
    );
  }
}

function resolveDonor(
  input: CommandExecutionInput,
  resourceId: string,
): AdmittedDonorPdf | null {
  return input.resources?.donors?.[resourceId] ?? null;
}

function resolveDonors(
  input: CommandExecutionInput,
  resourceIds: readonly string[],
): AdmittedDonorPdf[] | null {
  const donors: AdmittedDonorPdf[] = [];
  for (const resourceId of resourceIds) {
    const donor = resolveDonor(input, resourceId);
    if (!donor) return null;
    donors.push(donor);
  }
  return donors;
}

async function applyMutation(
  command: PdfCommand,
  beforeBytes: Uint8Array,
  afterBytes: Uint8Array,
  nextAnnotations?: PdfAnnotation[],
): Promise<{ nextBytes: Uint8Array; nextPageCount: number }> {
  return commitDocumentMutation({
    command,
    label: commandLabel(command),
    beforeBytes,
    afterBytes,
    nextAnnotations,
  });
}

export async function dispatchPdfCommand(
  input: CommandExecutionInput,
): Promise<CommandResult> {
  const { command } = input;

  const stale = assertCommandDocumentCurrent(input);
  if (stale) return stale;

  const context = resolveContext(input);
  if (!context) {
    return commandError(
      command,
      'NO_WORKING_DOCUMENT',
      'No working document is available in the session.',
    );
  }

  try {
    throwIfAborted(input.signal, `command ${command.type}: before execution`);
    const pageCount = await PdfEditAdapter.countPages(context.workingBytes);

    switch (command.type) {
      case 'ROTATE_PAGES': {
        const { pageIndices: requested, angle } = command.payload;
        const pageIndices = sanitizePageIndices(requested, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for rotation.');
        }
        const rotations = await Promise.all(
          pageIndices.map(async (idx) => {
            const { width, height } = await PdfEditAdapter.getPageSize(context.workingBytes, idx);
            return { pageIndex: idx, angle, width, height };
          }),
        );
        const nextAnnotations = remapAfterRotate(useAnnotationStore.getState().annotations, rotations);
        const nextBytes = await PdfEditAdapter.rotatePages(context.workingBytes, pageIndices, angle);
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Pages rotated', result.nextBytes, result.nextPageCount);
      }

      case 'REORDER_PAGES': {
        const { fromIndex, toIndex } = command.payload;
        const order = Array.from({ length: pageCount }, (_, i) => i);
        const moved = order.splice(fromIndex, 1)[0];
        if (moved === undefined) {
          return commandError(command, 'VALIDATION_FAILED', 'The source page index is invalid.');
        }
        order.splice(toIndex, 0, moved);
        const nextAnnotations = remapAfterReorder(useAnnotationStore.getState().annotations, order);
        const nextBytes = await PdfEditAdapter.movePage(context.workingBytes, fromIndex, toIndex);
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Page reordered', result.nextBytes, result.nextPageCount);
      }

      case 'REORDER_PAGES_BY_ORDER': {
        const { order } = command.payload;
        if (order.length !== pageCount) {
          return commandError(command, 'VALIDATION_FAILED', 'Reorder list must include every page exactly once.');
        }
        const nextAnnotations = remapAfterReorder(useAnnotationStore.getState().annotations, order);
        const nextBytes = await PdfEditAdapter.reorderPages(context.workingBytes, order);
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Pages reordered', result.nextBytes, result.nextPageCount);
      }

      case 'EXTRACT_PAGES': {
        const pageIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for extraction.');
        }
        const extractedBytes = await PdfEditAdapter.extractPages(context.workingBytes, pageIndices);
        return commandSuccess(command, false, 'Pages extracted', undefined, undefined, [
          {
            kind: 'pdf',
            name: outputName('extract-pages', pageIndices, command.payload.outputName),
            bytes: extractedBytes,
          },
        ]);
      }

      case 'SPLIT_PAGES': {
        const pageIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for split.');
        }
        const extractedBytes = await PdfEditAdapter.extractPages(context.workingBytes, pageIndices);
        const nextAnnotations = remapAfterDelete(useAnnotationStore.getState().annotations, pageIndices);
        const nextBytes = await PdfEditAdapter.removePages(context.workingBytes, pageIndices);
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Pages split into a new file', result.nextBytes, result.nextPageCount, [
          {
            kind: 'pdf',
            name: outputName('split-pages', pageIndices, command.payload.outputName),
            bytes: extractedBytes,
          },
        ]);
      }

      case 'DELETE_PAGES': {
        const pageIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for deletion.');
        }
        if (pageIndices.length >= pageCount) {
          return commandError(command, 'VALIDATION_FAILED', 'Cannot delete every page in the document.');
        }
        const nextAnnotations = remapAfterDelete(useAnnotationStore.getState().annotations, pageIndices);
        const nextBytes = await PdfEditAdapter.removePages(context.workingBytes, pageIndices);
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Pages deleted', result.nextBytes, result.nextPageCount);
      }

      case 'INSERT_PAGES': {
        const donor = resolveDonor(input, command.payload.donorResourceId);
        if (!donor) {
          return commandError(command, 'RESOURCE_MISSING', 'The admitted donor resource is unavailable.');
        }
        assertDonorCommandCurrent(context, input, 'insert donor pages: before mutation');
        inspectAdmittedDonorPdfs('INSERT_PAGES', [donor], context.documentKey);
        const [resolved] = consumeAdmittedDonorPdfs('INSERT_PAGES', [donor], context.documentKey);
        const nextAnnotations = remapAfterInsert(
          useAnnotationStore.getState().annotations,
          command.payload.atIndex,
          resolved.pageCount,
        );
        const nextBytes = await PdfEditAdapter.insertAt(
          context.workingBytes,
          resolved.bytes,
          command.payload.atIndex,
        );
        assertDonorCommandCurrent(context, input, 'insert donor pages: before commit');
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Pages inserted', result.nextBytes, result.nextPageCount);
      }

      case 'INSERT_BLANK_PAGE': {
        const { atIndex, size } = command.payload;
        const nextAnnotations = remapAfterInsert(useAnnotationStore.getState().annotations, atIndex, 1);
        const nextBytes = await PdfEditAdapter.insertBlankPage(context.workingBytes, atIndex, size);
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Blank page inserted', result.nextBytes, result.nextPageCount);
      }

      case 'REPLACE_PAGE': {
        const { atIndex, donorResourceId, donorPageIndex } = command.payload;
        const donor = resolveDonor(input, donorResourceId);
        if (!donor) {
          return commandError(command, 'RESOURCE_MISSING', 'The admitted donor resource is unavailable.');
        }
        assertDonorCommandCurrent(context, input, 'replace page: before mutation');
        const [inspected] = inspectAdmittedDonorPdfs('REPLACE_PAGE', [donor], context.documentKey);
        if (
          !Number.isInteger(donorPageIndex)
          || donorPageIndex < 0
          || donorPageIndex >= inspected.pageCount
        ) {
          return commandError(
            command,
            'VALIDATION_FAILED',
            'The selected donor page is outside the admitted donor page range.',
          );
        }
        const [resolved] = consumeAdmittedDonorPdfs('REPLACE_PAGE', [donor], context.documentKey);
        const nextAnnotations = remapAfterInsert(
          remapAfterDelete(useAnnotationStore.getState().annotations, [atIndex]),
          atIndex,
          1,
        );
        const nextBytes = await PdfEditAdapter.replacePage(
          context.workingBytes,
          atIndex,
          resolved.bytes,
          donorPageIndex,
        );
        assertDonorCommandCurrent(context, input, 'replace page: before commit');
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Page replaced', result.nextBytes, result.nextPageCount);
      }

      case 'DUPLICATE_PAGES': {
        const pageIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for duplication.');
        }
        const nextAnnotations = remapAfterDuplicate(useAnnotationStore.getState().annotations, pageIndices);
        const nextBytes = await PdfEditAdapter.duplicatePages(context.workingBytes, pageIndices);
        const result = await applyMutation(command, context.workingBytes, nextBytes, nextAnnotations);
        return commandSuccess(command, true, 'Pages duplicated', result.nextBytes, result.nextPageCount);
      }

      case 'MERGE_PDF': {
        const donorRefs = resolveDonors(input, command.payload.donorResourceIds);
        if (!donorRefs || donorRefs.length === 0) {
          return commandError(command, 'RESOURCE_MISSING', 'No admitted donor resources were provided for merge.');
        }
        assertDonorCommandCurrent(context, input, 'merge donor PDFs: before mutation');
        inspectAdmittedDonorPdfs('MERGE_PDF', donorRefs, context.documentKey);
        const donors = consumeAdmittedDonorPdfs('MERGE_PDF', donorRefs, context.documentKey);
        const nextBytes = await PdfEditAdapter.merge(
          context.workingBytes,
          donors.map((donor) => donor.bytes),
        );
        assertDonorCommandCurrent(context, input, 'merge donor PDFs: before commit');
        const result = await applyMutation(command, context.workingBytes, nextBytes);
        return commandSuccess(command, true, 'Files merged', result.nextBytes, result.nextPageCount);
      }

      case 'ADD_HEADER_FOOTER_TEXT': {
        const { options } = command.payload;
        const selectedIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        const pageIndices = selectedIndices.filter((index) => {
          const pageNumber = index + 1;
          if (options.excludeFirstPage && pageNumber === 1) return false;
          if (options.excludeLastPage && pageNumber === pageCount) return false;
          return true;
        });
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for header/footer text.');
        }
        const nextBytes = await PdfEditAdapter.addHeaderFooterText(context.workingBytes, {
          pages: pageIndices,
          zone: options.zone,
          text: options.text,
          align: options.align,
          marginX: options.marginX,
          marginY: options.marginY,
          fontSize: options.fontSize,
          color: options.color ?? '#374151',
          opacity: options.opacity ?? 0.9,
          fileName: context.fileName,
          now: new Date(command.createdAt),
          enablePageNumberToken: options.pageNumberToken ?? true,
          enableFileNameToken: options.fileNameToken ?? false,
          enableDateToken: options.dateToken ?? false,
        });
        const result = await applyMutation(command, context.workingBytes, nextBytes);
        return commandSuccess(command, true, 'Header/footer text applied', result.nextBytes, result.nextPageCount);
      }

      case 'DRAW_TEXT_ON_PAGES': {
        const { options } = command.payload;
        const pageIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for drawing text.');
        }
        const nextBytes = await PdfEditAdapter.drawTextOnPages(context.workingBytes, {
          pages: pageIndices,
          text: options.text,
          x: options.x,
          y: options.y,
          fontSize: options.fontSize,
          color: options.color ?? '#111827',
          opacity: options.opacity ?? 0.95,
          align: options.align ?? 'left',
          rotation: options.rotation,
          fileName: context.fileName,
          now: new Date(command.createdAt),
          enablePageNumberToken: options.pageNumberToken ?? true,
          enableFileNameToken: options.fileNameToken ?? false,
          enableDateToken: options.dateToken ?? false,
        });
        const result = await applyMutation(command, context.workingBytes, nextBytes);
        return commandSuccess(command, true, 'Text applied to pages', result.nextBytes, result.nextPageCount);
      }

      case 'DRAW_REDACTION_BOX': {
        const { options } = command.payload;
        const pageIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for visual masking.');
        }
        const nextBytes = await PdfEditAdapter.drawRedactionBoxes(context.workingBytes, {
          pages: pageIndices,
          x: options.x,
          y: options.y,
          width: options.width,
          height: options.height,
          fillColor: options.fillColor ?? '#ffffff',
        });
        const result = await applyMutation(command, context.workingBytes, nextBytes);
        return commandSuccess(
          command,
          true,
          'Visual mask applied. Underlying PDF content was not securely removed.',
          result.nextBytes,
          result.nextPageCount,
        );
      }

      case 'APPLY_WORKING_COPY': {
        const nextBytes = input.resources?.binaries?.[command.payload.binaryResourceId];
        if (!nextBytes) {
          return commandError(command, 'RESOURCE_MISSING', 'The working-copy binary resource is unavailable.');
        }
        const result = await applyMutation(command, context.workingBytes, nextBytes);
        if (command.payload.selectedPages) {
          useSessionStore.getState().setSelectedPages(command.payload.selectedPages);
        }
        documentBus.emit({ type: 'DOCUMENT_REPLACED' });
        return commandSuccess(
          command,
          true,
          command.payload.reason ?? command.payload.macro?.recipeName ?? 'Working copy applied',
          result.nextBytes,
          result.nextPageCount,
        );
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Command execution failed';
    if (isOperationCancelledError(error)) {
      return commandError(command, 'CANCELLED', message);
    }
    if (isDonorAdmissionBoundaryError(error)) {
      return commandError(command, 'ADMISSION_REJECTED', message);
    }
    const details = isDocumentMutationTransactionError(error)
      ? `transaction-stage=${error.stage}`
      : undefined;
    return commandError(command, 'EXECUTION_FAILED', message, details);
  }
}
