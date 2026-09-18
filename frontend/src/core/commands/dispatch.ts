import { documentBus } from '../events/bus';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import {
  consumeAdmittedDonorPdfs,
  inspectAdmittedDonorPdfs,
  isDonorAdmissionBoundaryError,
  DonorAdmissionBoundaryError,
  type AdmittedDonorPdf,
  type ResolvedAdmittedDonorPdf,
} from '@/core/admission/donorPdf';
import {
  isOperationCancelledError,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { useSessionStore } from '@/core/session/store';
import { buildPageGraphFromPdfBytes } from '@/core/pages/pageGraphAdmission';
import {
  duplicatePagesInGraph,
  insertPagesIntoGraph,
  removePagesFromGraph,
  rotatePagesInGraph,
} from '@/core/pages/pageGraph';
import {
  createBlankPageNode,
  createDuplicatePageId,
  importedPageNodes,
  movePageGraphBeforeOriginalTarget,
  pageIdsAtIndices,
  reorderPageGraphByOrder,
  replacePageGraphContent,
} from '@/core/pages/structuralPageGraph';
import type { PageGraph, PageNode } from '@/core/pages/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { remapAfterRotate } from '@/core/annotations/pageRemapper';
import {
  duplicateAnnotationsByPageGraph,
  normalizeAnnotationPageAnchors,
  reanchorAnnotationsAfterPageGraphChange,
  rebindAnnotationsByPageNumber,
  removeAnnotationsAnchoredToPageIds,
} from '@/core/annotations/pageAnchor';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import {
  remapWriterAfterDelete,
  remapWriterAfterDuplicate,
  remapWriterAfterInsert,
  remapWriterAfterReorder,
  remapWriterAfterRotate,
} from '@/core/writer-v2/pageRemapper';
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

async function resolveStructuralPageGraph(
  context: ResolvedCommandContext,
  input: CommandExecutionInput,
  pageCount: number,
): Promise<PageGraph<PageNode>> {
  const current = useSessionStore.getState().pageGraph;
  if (current && current.pages.length === pageCount) {
    return current;
  }

  return buildPageGraphFromPdfBytes(
    context.workingBytes,
    context.documentKey,
    input.signal,
  );
}

function orderFromGraphs(
  before: PageGraph<PageNode>,
  after: PageGraph<PageNode>,
): number[] {
  const oldIndex = new Map(
    before.pages.map((page, index) => [page.pageId, index] as const),
  );
  return after.pages.map((page) => {
    const index = oldIndex.get(page.pageId);
    if (index === undefined) {
      throw new Error(`PageGraph reorder introduced unknown PageId ${page.pageId}`);
    }
    return index;
  });
}

async function buildImportedDonorNodes(
  donor: ResolvedAdmittedDonorPdf,
  context: ResolvedCommandContext,
  command: PdfCommand,
  kind: 'insert' | 'merge',
  ordinalOffset: number,
  signal?: AbortSignal,
): Promise<PageNode[]> {
  const donorGraph = await buildPageGraphFromPdfBytes(
    donor.bytes,
    `${context.documentKey}::donor::${command.id}::${donor.inputIndex}`,
    signal,
  );

  if (donorGraph.pages.length !== donor.pageCount) {
    throw new Error(
      `Donor PageGraph count ${donorGraph.pages.length} does not match admitted page count ${donor.pageCount}`,
    );
  }

  return importedPageNodes(donorGraph.pages, {
    documentKey: context.documentKey,
    commandId: command.id,
    kind,
    ordinalOffset,
  });
}

async function applyMutation(
  command: PdfCommand,
  beforeBytes: Uint8Array,
  afterBytes: Uint8Array,
  nextAnnotations?: PdfAnnotation[],
  nextWriterElements?: WriterElementV2[],
  nextSelectedPages?: number[],
  nextCurrentPage?: number,
  nextPageGraph?: PageGraph<PageNode> | null,
): Promise<{ nextBytes: Uint8Array; nextPageCount: number }> {
  return commitDocumentMutation({
    command,
    label: commandLabel(command),
    beforeBytes,
    afterBytes,
    nextAnnotations,
    nextWriterElements,
    nextSelectedPages,
    nextCurrentPage,
    nextPageGraph,
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
    const sessionPageGraph = useSessionStore.getState().pageGraph;
    const pageCount =
      sessionPageGraph?.pages.length
      ?? await PdfEditAdapter.countPages(context.workingBytes);

    switch (command.type) {
      case 'ROTATE_PAGES': {
        const { pageIndices: requested, angle } = command.payload;
        const pageIndices = sanitizePageIndices(requested, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for rotation.');
        }
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const rotations = pageIndices.map((idx) => {
          const page = pageGraph.pages[idx];
          if (!page) throw new Error(`PageGraph is missing page index ${idx}`);
          return { pageIndex: idx, angle, width: page.width, height: page.height };
        });
        const nextPageGraph = rotatePagesInGraph(
          pageGraph,
          pageIdsAtIndices(pageGraph, pageIndices),
          angle,
        );
        const anchoredAnnotations = normalizeAnnotationPageAnchors(
          useAnnotationStore.getState().annotations,
          pageGraph,
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          remapAfterRotate(anchoredAnnotations, rotations),
          pageGraph,
          nextPageGraph,
        );
        const nextWriterElements = remapWriterAfterRotate(
          useWriterV2Store.getState().elements,
          rotations,
        );
        const nextBytes = await PdfEditAdapter.rotatePages(context.workingBytes, pageIndices, angle);
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
        return commandSuccess(command, true, 'Pages rotated', result.nextBytes, result.nextPageCount);
      }

      case 'REORDER_PAGES': {
        const { fromIndex, toIndex } = command.payload;
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        if (!pageGraph.pages[fromIndex]) {
          return commandError(command, 'VALIDATION_FAILED', 'The source page index is invalid.');
        }
        const nextPageGraph = movePageGraphBeforeOriginalTarget(
          pageGraph,
          fromIndex,
          toIndex,
        );
        const order = orderFromGraphs(pageGraph, nextPageGraph);
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const nextWriterElements = remapWriterAfterReorder(
          useWriterV2Store.getState().elements,
          order,
        );
        const nextBytes = await PdfEditAdapter.reorderPages(context.workingBytes, order);
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
        return commandSuccess(command, true, 'Page reordered', result.nextBytes, result.nextPageCount);
      }

      case 'REORDER_PAGES_BY_ORDER': {
        const { order } = command.payload;
        if (order.length !== pageCount) {
          return commandError(command, 'VALIDATION_FAILED', 'Reorder list must include every page exactly once.');
        }
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const nextPageGraph = reorderPageGraphByOrder(pageGraph, order);
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const nextWriterElements = remapWriterAfterReorder(
          useWriterV2Store.getState().elements,
          order,
        );
        const nextBytes = await PdfEditAdapter.reorderPages(context.workingBytes, order);
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
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
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const nextPageGraph = removePagesFromGraph(
          pageGraph,
          pageIdsAtIndices(pageGraph, pageIndices),
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const nextWriterElements = remapWriterAfterDelete(
          useWriterV2Store.getState().elements,
          pageIndices,
        );
        const nextBytes = await PdfEditAdapter.removePages(context.workingBytes, pageIndices);
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
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
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const nextPageGraph = removePagesFromGraph(
          pageGraph,
          pageIdsAtIndices(pageGraph, pageIndices),
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const nextWriterElements = remapWriterAfterDelete(
          useWriterV2Store.getState().elements,
          pageIndices,
        );
        const nextBytes = await PdfEditAdapter.removePages(context.workingBytes, pageIndices);
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
        return commandSuccess(command, true, 'Pages deleted', result.nextBytes, result.nextPageCount);
      }

      case 'INSERT_PAGES': {
        const donor = resolveDonor(input, command.payload.donorResourceId);
        if (!donor) {
          return commandError(command, 'RESOURCE_MISSING', 'The admitted donor resource is unavailable.');
        }
        assertDonorCommandCurrent(context, input, 'insert donor pages: before mutation');
        const [inspected] = inspectAdmittedDonorPdfs(
          'INSERT_PAGES',
          [donor],
          context.documentKey,
        );
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const insertedNodes = await buildImportedDonorNodes(
          inspected,
          context,
          command,
          'insert',
          0,
          input.signal,
        );
        const [resolved] = consumeAdmittedDonorPdfs(
          'INSERT_PAGES',
          [donor],
          context.documentKey,
        );
        const nextPageGraph = insertPagesIntoGraph(
          pageGraph,
          command.payload.atIndex,
          insertedNodes,
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const nextWriterElements = remapWriterAfterInsert(
          useWriterV2Store.getState().elements,
          command.payload.atIndex,
          resolved.pageCount,
        );
        const nextBytes = await PdfEditAdapter.insertAt(
          context.workingBytes,
          resolved.bytes,
          command.payload.atIndex,
        );
        assertDonorCommandCurrent(context, input, 'insert donor pages: before commit');
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
        return commandSuccess(command, true, 'Pages inserted', result.nextBytes, result.nextPageCount);
      }

      case 'INSERT_BLANK_PAGE': {
        const { atIndex, size } = command.payload;
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const nextPageGraph = insertPagesIntoGraph(
          pageGraph,
          atIndex,
          [createBlankPageNode({
            documentKey: context.documentKey,
            commandId: command.id,
            width: size.width,
            height: size.height,
          })],
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const nextWriterElements = remapWriterAfterInsert(
          useWriterV2Store.getState().elements,
          atIndex,
          1,
        );
        const nextBytes = await PdfEditAdapter.insertBlankPage(context.workingBytes, atIndex, size);
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
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
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const donorGraph = await buildPageGraphFromPdfBytes(
          inspected.bytes,
          `${context.documentKey}::donor::${command.id}::${inspected.inputIndex}`,
          input.signal,
        );
        if (donorGraph.pages.length !== inspected.pageCount) {
          throw new Error(
            `Donor PageGraph count ${donorGraph.pages.length} does not match admitted page count ${inspected.pageCount}`,
          );
        }
        const replacementNode = donorGraph.pages[donorPageIndex];
        if (!replacementNode) {
          return commandError(command, 'VALIDATION_FAILED', 'The donor PageGraph does not contain the selected page.');
        }
        const [resolved] = consumeAdmittedDonorPdfs(
          'REPLACE_PAGE',
          [donor],
          context.documentKey,
        );
        const nextPageGraph = replacePageGraphContent(
          pageGraph,
          atIndex,
          replacementNode,
        );
        const targetPageId = pageGraph.pages[atIndex]?.pageId;
        const nextAnnotations = targetPageId
          ? removeAnnotationsAnchoredToPageIds(
              useAnnotationStore.getState().annotations,
              pageGraph,
              nextPageGraph,
              [targetPageId],
            )
          : reanchorAnnotationsAfterPageGraphChange(
              useAnnotationStore.getState().annotations,
              pageGraph,
              nextPageGraph,
            );
        const nextWriterElements = remapWriterAfterInsert(
          remapWriterAfterDelete(
            useWriterV2Store.getState().elements,
            [atIndex],
          ),
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
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
        return commandSuccess(command, true, 'Page replaced', result.nextBytes, result.nextPageCount);
      }

      case 'DUPLICATE_PAGES': {
        const pageIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for duplication.');
        }
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const nextPageGraph = duplicatePagesInGraph(
          pageGraph,
          pageIdsAtIndices(pageGraph, pageIndices),
          (_source, ordinal) => createDuplicatePageId(command.id, ordinal),
        );
        const nextAnnotations = duplicateAnnotationsByPageGraph(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
          pageIdsAtIndices(pageGraph, pageIndices),
        );
        const nextWriterElements = remapWriterAfterDuplicate(
          useWriterV2Store.getState().elements,
          pageIndices,
        );
        const nextBytes = await PdfEditAdapter.duplicatePages(context.workingBytes, pageIndices);
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
        return commandSuccess(command, true, 'Pages duplicated', result.nextBytes, result.nextPageCount);
      }

      case 'MERGE_PDF': {
        const donorRefs = resolveDonors(input, command.payload.donorResourceIds);
        if (!donorRefs || donorRefs.length === 0) {
          return commandError(command, 'RESOURCE_MISSING', 'No admitted donor resources were provided for merge.');
        }
        assertDonorCommandCurrent(context, input, 'merge donor PDFs: before mutation');
        const inspectedDonors = inspectAdmittedDonorPdfs(
          'MERGE_PDF',
          donorRefs,
          context.documentKey,
        );
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const importedNodes: PageNode[] = [];
        for (const donor of inspectedDonors) {
          const nodes = await buildImportedDonorNodes(
            donor,
            context,
            command,
            'merge',
            importedNodes.length,
            input.signal,
          );
          importedNodes.push(...nodes);
        }
        const donors = consumeAdmittedDonorPdfs(
          'MERGE_PDF',
          donorRefs,
          context.documentKey,
        );
        const nextPageGraph = insertPagesIntoGraph(
          pageGraph,
          pageGraph.pages.length,
          importedNodes,
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const nextBytes = await PdfEditAdapter.merge(
          context.workingBytes,
          donors.map((donor) => donor.bytes),
        );
        assertDonorCommandCurrent(context, input, 'merge donor PDFs: before commit');
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          undefined,
          undefined,
          undefined,
          nextPageGraph,
        );
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

      case 'ANNOTATION_CHANGE':
      case 'WRITER_CHANGE':
        return commandError(
          command,
          'VALIDATION_FAILED',
          `${command.type} is recorded by its state store and is not executable as a PDF byte command.`,
        );

      case 'APPLY_WORKING_COPY': {
        const nextBytes = input.resources?.binaries?.[command.payload.binaryResourceId];
        if (!nextBytes) {
          return commandError(command, 'RESOURCE_MISSING', 'The working-copy binary resource is unavailable.');
        }
        const rebuiltPageGraph = await buildPageGraphFromPdfBytes(
          nextBytes,
          `${context.documentKey}::working-copy::${command.id}`,
          input.signal,
        );
        const nextAnnotations = rebindAnnotationsByPageNumber(
          useAnnotationStore.getState().annotations,
          rebuiltPageGraph,
        );
        const result = await applyMutation(
          command,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          undefined,
          command.payload.selectedPages,
          undefined,
          rebuiltPageGraph,
        );
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
