import { documentBus } from '../events/bus';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { pdfLibMutationEngine } from '@/adapters/pdf-mutation/PdfLibMutationEngine';
import type {
  PdfMutationCommitResult,
  PdfMutationSession,
} from '@/core/pdf-mutation/types';
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
import { reanchorPageLabelRangesAfterGraphChange } from '@/core/pages/pageLabels';
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
import { remapWriterAfterRotate } from '@/core/writer-v2/pageRemapper';
import {
  duplicateWriterElementsByPageGraph,
  normalizeWriterPageAnchors,
  reanchorWriterElementsAfterPageGraphChange,
  rebindWriterElementsByPageIndex,
  removeWriterElementsAnchoredToPageIds,
} from '@/core/writer-v2/writerPageAnchor';
import {
  commitDocumentMutation,
  isDocumentMutationTransactionError,
  type DocumentMutationRevisionMetadata,
  type OcrPageMutationPolicy,
} from './transaction/documentTransaction';
import { planPageLabelCommandMutation } from './pageLabelCommand';
import { prepareHeaderFooterTemplateMutation } from '@/core/header-footer/executeMutation';
import { resolveLegacyPageTextTokens } from '@/core/text/legacyPageTextTokens';
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
    case 'SET_PAGE_LABELS':
      return command.payload.ranges.length === 0
        ? 'Clear logical page labels'
        : 'Set logical page labels';
    case 'APPLY_HEADER_FOOTER_TEMPLATE':
      return command.payload.template.name?.trim() || 'Apply header/footer template';
    case 'DRAW_TEXT_ON_PAGES':
      return 'Draw text on pages';
    case 'DRAW_REDACTION_BOX':
      return 'Draw visual mask';
    case 'APPLY_WORKING_COPY':
      return command.payload.reason ?? command.payload.macro?.recipeName ?? 'Apply working copy';
  }
}

function commandCreatedAtMs(
  command: PdfCommand,
): number {
  const timestamp =
    Date.parse(command.createdAt);
  if (!Number.isFinite(timestamp)) {
    throw new Error(
      `Command ${command.id} has invalid createdAt timestamp ${command.createdAt}.`,
    );
  }
  return timestamp;
}

function derivedCommandEntityId(
  commandId: string,
  entityKind:
    | 'annotation-duplicate'
    | 'writer-duplicate',
  ordinal: number,
): string {
  return `${commandId}::${entityKind}::${ordinal + 1}`;
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

function activePdfOverlayWriterElements(): WriterElementV2[] | null {
  const writer = useWriterV2Store.getState();
  if (writer.documentMeta?.mode === 'blankDocument') return null;
  if (
    writer.documentMeta?.mode === 'pdfOverlay'
    || (!writer.documentMeta && Boolean(useSessionStore.getState().pageGraph))
  ) {
    return writer.elements;
  }
  return null;
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

function pageGraphHasLogicalLabelMetadata(
  graph: PageGraph<PageNode>,
): boolean {
  return Boolean(
    (graph.pageLabelRanges && graph.pageLabelRanges.length > 0)
    || graph.pages.some((page) => page.logicalLabel !== undefined),
  );
}

function reconcilePageLabelsAfterStructuralChange(
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
): PageGraph<PageNode> {
  return reanchorPageLabelRangesAfterGraphChange(
    beforeGraph,
    afterGraph,
  );
}

function applyStructuralPageLabelsToMutationSession(
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
  session: PdfMutationSession,
): void {
  if (!pageGraphHasLogicalLabelMetadata(beforeGraph)) {
    return;
  }

  const plan = planPageLabelCommandMutation(
    afterGraph,
    afterGraph.pageLabelRanges ?? [],
  );
  if (!plan.ok) {
    throw new Error(
      `Unable to reconcile PageLabels after structural mutation: ${plan.errors.join('; ')}`,
    );
  }

  session.setPageLabels(plan.entries);
}

async function commitStructuralMutationSession(
  session: PdfMutationSession,
  beforeGraph: PageGraph<PageNode>,
  afterGraph: PageGraph<PageNode>,
): Promise<PdfMutationCommitResult> {
  applyStructuralPageLabelsToMutationSession(
    beforeGraph,
    afterGraph,
    session,
  );
  const committed = await session.commit();
  assertMutationSessionPageCount(
    committed.pageCount,
    afterGraph,
  );
  return committed;
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

interface ApplyMutationOptions {
  ocrPagePolicy?: OcrPageMutationPolicy;
  revisionMetadata?: DocumentMutationRevisionMetadata;
}

async function applyMutation(
  input: CommandExecutionInput,
  beforeBytes: Uint8Array,
  afterBytes: Uint8Array,
  nextAnnotations?: PdfAnnotation[],
  nextWriterElements?: WriterElementV2[],
  nextSelectedPages?: number[],
  nextCurrentPage?: number,
  nextPageGraph?: PageGraph<PageNode> | null,
  options?: ApplyMutationOptions,
): Promise<{ nextBytes: Uint8Array; nextPageCount: number }> {
  const { command } = input;
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
    ocrPagePolicy: options?.ocrPagePolicy,
    revisionMetadata: options?.revisionMetadata,
    executionMode: input.executionMode,
    recoveryRevision:
      input.recoveryRevision,
    signal: input.signal,
  });
}

async function applyCommittedSessionMutation(
  input: CommandExecutionInput,
  beforeBytes: Uint8Array,
  beforePageCount: number,
  committed: PdfMutationCommitResult,
  nextAnnotations?: PdfAnnotation[],
  nextWriterElements?: WriterElementV2[],
  nextSelectedPages?: number[],
  nextCurrentPage?: number,
  nextPageGraph?: PageGraph<PageNode> | null,
  options?: Omit<ApplyMutationOptions, 'revisionMetadata'>,
): Promise<{ nextBytes: Uint8Array; nextPageCount: number }> {
  return applyMutation(
    input,
    beforeBytes,
    committed.bytes,
    nextAnnotations,
    nextWriterElements,
    nextSelectedPages,
    nextCurrentPage,
    nextPageGraph,
    {
      ...options,
      revisionMetadata: {
        beforePageCount,
        afterPageCount: committed.pageCount,
      },
    },
  );
}

async function executeRotatePagesCommand(
  input: CommandExecutionInput,
  context: ResolvedCommandContext,
  sessionPageGraph: PageGraph<PageNode> | null,
): Promise<CommandResult> {
  const { command } = input;
  if (command.type !== 'ROTATE_PAGES') {
    throw new Error('Rotation handler received a non-rotation command.');
  }

  const mutationSession = await pdfLibMutationEngine.open({
    bytes: context.workingBytes,
    signal: input.signal,
  });

  try {
    const pageCount = mutationSession.pageCount;

    if (
      sessionPageGraph
      && sessionPageGraph.pages.length !== pageCount
    ) {
      throw new Error(
        `PageGraph count ${sessionPageGraph.pages.length} does not match mutation-session page count ${pageCount}.`,
      );
    }

    const {
      pageIndices: requested,
      angle,
    } = command.payload;
    const pageIndices = sanitizePageIndices(
      requested,
      pageCount,
    );

    if (pageIndices.length === 0) {
      return commandError(
        command,
        'VALIDATION_FAILED',
        'No pages selected for rotation.',
      );
    }

    const pageGraph = await resolveStructuralPageGraph(
      context,
      input,
      pageCount,
    );
    const rotations = pageIndices.map((pageIndex) => {
      const page = pageGraph.pages[pageIndex];
      if (!page) {
        throw new Error(
          `PageGraph is missing page index ${pageIndex}`,
        );
      }

      const metrics = mutationSession.getPageMetrics(
        pageIndex,
      );

      return {
        pageIndex,
        angle,
        width: metrics.width,
        height: metrics.height,
      };
    });

    const nextPageGraph = rotatePagesInGraph(
      pageGraph,
      pageIdsAtIndices(pageGraph, pageIndices),
      angle,
    );
    const anchoredAnnotations =
      normalizeAnnotationPageAnchors(
        useAnnotationStore.getState().annotations,
        pageGraph,
      );
    const nextAnnotations =
      reanchorAnnotationsAfterPageGraphChange(
        remapAfterRotate(
          anchoredAnnotations,
          rotations,
        ),
        pageGraph,
        nextPageGraph,
      );
    const writerElements =
      activePdfOverlayWriterElements();
    const nextWriterElements = writerElements
      ? reanchorWriterElementsAfterPageGraphChange(
          remapWriterAfterRotate(
            normalizeWriterPageAnchors(
              writerElements,
              pageGraph,
            ),
            rotations,
          ),
          pageGraph,
          nextPageGraph,
        )
      : undefined;

    mutationSession.rotatePages(pageIndices, angle);
    const committed = await mutationSession.commit();

    if (
      committed.pageCount !==
      nextPageGraph.pages.length
    ) {
      throw new Error(
        `Mutation-session page count ${committed.pageCount} does not match target PageGraph count ${nextPageGraph.pages.length}.`,
      );
    }

    const result =
      await applyCommittedSessionMutation(
        input,
        context.workingBytes,
        pageCount,
        committed,
        nextAnnotations,
      nextWriterElements,
      undefined,
      undefined,
      nextPageGraph,
    );

    return commandSuccess(
      command,
      true,
      'Pages rotated',
      result.nextBytes,
      result.nextPageCount,
    );
  } finally {
    mutationSession.dispose();
  }
}

function usesPersistentMutationSession(
  type: PdfCommand['type'],
): boolean {
  return (
    type === 'REORDER_PAGES'
    || type === 'REORDER_PAGES_BY_ORDER'
    || type === 'DELETE_PAGES'
    || type === 'INSERT_BLANK_PAGE'
    || type === 'DUPLICATE_PAGES'
    || type === 'INSERT_PAGES'
    || type === 'REPLACE_PAGE'
    || type === 'MERGE_PDF'
    || type === 'SPLIT_PAGES'
    || type === 'SET_PAGE_LABELS'
    || type === 'DRAW_TEXT_ON_PAGES'
    || type === 'DRAW_REDACTION_BOX'
    || type === 'APPLY_HEADER_FOOTER_TEMPLATE'
  );
}

function requirePersistentMutationSession(
  session: PdfMutationSession | null,
): PdfMutationSession {
  if (!session) {
    throw new Error(
      'Persistent PDF mutation session was not opened for this command.',
    );
  }
  return session;
}

function assertMutationSessionPageCount(
  pageCount: number,
  pageGraph: PageGraph<PageNode>,
): void {
  if (pageCount !== pageGraph.pages.length) {
    throw new Error(
      `Mutation-session page count ${pageCount} does not match target PageGraph count ${pageGraph.pages.length}.`,
    );
  }
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

  let commandMutationSession: PdfMutationSession | null = null;

  try {
    throwIfAborted(input.signal, `command ${command.type}: before execution`);
    const sessionPageGraph =
      useSessionStore.getState().pageGraph;

    if (command.type === 'ROTATE_PAGES') {
      return await executeRotatePagesCommand(
        input,
        context,
        sessionPageGraph,
      );
    }

    if (usesPersistentMutationSession(command.type)) {
      commandMutationSession = await pdfLibMutationEngine.open({
        bytes: context.workingBytes,
        signal: input.signal,
      });

      if (
        sessionPageGraph
        && sessionPageGraph.pages.length
          !== commandMutationSession.pageCount
      ) {
        throw new Error(
          `PageGraph count ${sessionPageGraph.pages.length} does not match mutation-session page count ${commandMutationSession.pageCount}.`,
        );
      }
    }

    const pageCount =
      sessionPageGraph?.pages.length
      ?? commandMutationSession?.pageCount
      ?? await PdfEditAdapter.countPages(
        context.workingBytes,
      );

    switch (command.type) {
      case 'REORDER_PAGES': {
        const { fromIndex, toIndex } = command.payload;
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        if (!pageGraph.pages[fromIndex]) {
          return commandError(command, 'VALIDATION_FAILED', 'The source page index is invalid.');
        }
        const nextPageGraph = reconcilePageLabelsAfterStructuralChange(
          pageGraph,
          movePageGraphBeforeOriginalTarget(
            pageGraph,
            fromIndex,
            toIndex,
          ),
        );
        const order = orderFromGraphs(pageGraph, nextPageGraph);
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? reanchorWriterElementsAfterPageGraphChange(
              writerElements,
              pageGraph,
              nextPageGraph,
            )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        await mutationSession.reorderPages(order);
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
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
        const nextPageGraph = reconcilePageLabelsAfterStructuralChange(
          pageGraph,
          reorderPageGraphByOrder(pageGraph, order),
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? reanchorWriterElementsAfterPageGraphChange(
              writerElements,
              pageGraph,
              nextPageGraph,
            )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        await mutationSession.reorderPages(order);
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
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
        const nextPageGraph = reconcilePageLabelsAfterStructuralChange(
          pageGraph,
          removePagesFromGraph(
            pageGraph,
            pageIdsAtIndices(pageGraph, pageIndices),
          ),
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? reanchorWriterElementsAfterPageGraphChange(
              writerElements,
              pageGraph,
              nextPageGraph,
            )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        await mutationSession.removePages(pageIndices);
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
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
        const nextPageGraph = reconcilePageLabelsAfterStructuralChange(
          pageGraph,
          removePagesFromGraph(
            pageGraph,
            pageIdsAtIndices(pageGraph, pageIndices),
          ),
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? reanchorWriterElementsAfterPageGraphChange(
              writerElements,
              pageGraph,
              nextPageGraph,
            )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        await mutationSession.removePages(pageIndices);
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
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
        const nextPageGraph = reconcilePageLabelsAfterStructuralChange(
          pageGraph,
          insertPagesIntoGraph(
            pageGraph,
            command.payload.atIndex,
            insertedNodes,
          ),
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? reanchorWriterElementsAfterPageGraphChange(
              writerElements,
              pageGraph,
              nextPageGraph,
            )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        await mutationSession.insertPdf(
          command.payload.atIndex,
          resolved.bytes,
        );
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        assertDonorCommandCurrent(context, input, 'insert donor pages: before commit');
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
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
        const nextPageGraph = reconcilePageLabelsAfterStructuralChange(
          pageGraph,
          insertPagesIntoGraph(
            pageGraph,
            atIndex,
            [createBlankPageNode({
              documentKey: context.documentKey,
              commandId: command.id,
              width: size.width,
              height: size.height,
            })],
          ),
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? reanchorWriterElementsAfterPageGraphChange(
              writerElements,
              pageGraph,
              nextPageGraph,
            )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        mutationSession.insertBlankPage(atIndex, size);
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
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
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? targetPageId
            ? removeWriterElementsAnchoredToPageIds(
                writerElements,
                pageGraph,
                nextPageGraph,
                [targetPageId],
              )
            : reanchorWriterElementsAfterPageGraphChange(
                writerElements,
                pageGraph,
                nextPageGraph,
              )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        await mutationSession.replacePage(
          atIndex,
          resolved.bytes,
          donorPageIndex,
        );
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        assertDonorCommandCurrent(context, input, 'replace page: before commit');
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
          targetPageId
            ? {
                ocrPagePolicy: {
                  invalidatePageIds: [targetPageId],
                },
              }
            : undefined,
        );
        return commandSuccess(command, true, 'Page replaced', result.nextBytes, result.nextPageCount);
      }

      case 'DUPLICATE_PAGES': {
        const pageIndices = sanitizePageIndices(command.payload.pageIndices, pageCount);
        if (pageIndices.length === 0) {
          return commandError(command, 'VALIDATION_FAILED', 'No pages selected for duplication.');
        }
        const pageGraph = await resolveStructuralPageGraph(context, input, pageCount);
        const nextPageGraph = reconcilePageLabelsAfterStructuralChange(
          pageGraph,
          duplicatePagesInGraph(
            pageGraph,
            pageIdsAtIndices(pageGraph, pageIndices),
            (_source, ordinal) => createDuplicatePageId(command.id, ordinal),
          ),
        );
        let annotationDuplicateOrdinal = 0;
        const nextAnnotations = duplicateAnnotationsByPageGraph(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
          pageIdsAtIndices(pageGraph, pageIndices),
          {
            createId: () =>
              derivedCommandEntityId(
                command.id,
                'annotation-duplicate',
                annotationDuplicateOrdinal++,
              ),
            now: commandCreatedAtMs(command),
          },
        );
        const writerElements = activePdfOverlayWriterElements();
        let writerDuplicateOrdinal = 0;
        const nextWriterElements = writerElements
          ? duplicateWriterElementsByPageGraph(
              writerElements,
              pageGraph,
              nextPageGraph,
              pageIdsAtIndices(pageGraph, pageIndices),
              {
                createId: () =>
                  derivedCommandEntityId(
                    command.id,
                    'writer-duplicate',
                    writerDuplicateOrdinal++,
                  ),
                now: command.createdAt,
              },
            )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        await mutationSession.duplicatePages(pageIndices);
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
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
        const nextPageGraph = reconcilePageLabelsAfterStructuralChange(
          pageGraph,
          insertPagesIntoGraph(
            pageGraph,
            pageGraph.pages.length,
            importedNodes,
          ),
        );
        const nextAnnotations = reanchorAnnotationsAfterPageGraphChange(
          useAnnotationStore.getState().annotations,
          pageGraph,
          nextPageGraph,
        );
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? reanchorWriterElementsAfterPageGraphChange(
              writerElements,
              pageGraph,
              nextPageGraph,
            )
          : undefined;
        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        await mutationSession.appendPdfs(
          donors.map((donor) => donor.bytes),
        );
        const committed =
          await commitStructuralMutationSession(
            mutationSession,
            pageGraph,
            nextPageGraph,
          );
        assertDonorCommandCurrent(context, input, 'merge donor PDFs: before commit');
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
          nextAnnotations,
          nextWriterElements,
          undefined,
          undefined,
          nextPageGraph,
        );
        return commandSuccess(command, true, 'Files merged', result.nextBytes, result.nextPageCount);
      }

      case 'SET_PAGE_LABELS': {
        const pageGraph = await resolveStructuralPageGraph(
          context,
          input,
          pageCount,
        );
        const plan = planPageLabelCommandMutation(
          pageGraph,
          command.payload.ranges,
        );
        if (!plan.ok) {
          return commandError(
            command,
            'VALIDATION_FAILED',
            'The logical page-label configuration is invalid.',
            plan.errors.join('; '),
          );
        }

        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        mutationSession.setPageLabels(plan.entries);
        const committed = await mutationSession.commit();
        assertMutationSessionPageCount(
          committed.pageCount,
          plan.pageGraph,
        );

        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
          undefined,
          undefined,
          undefined,
          undefined,
          plan.pageGraph,
        );
        return commandSuccess(
          command,
          true,
          command.payload.ranges.length === 0
            ? 'Logical page labels cleared'
            : 'Logical page labels updated',
          result.nextBytes,
          result.nextPageCount,
        );
      }

      case 'APPLY_HEADER_FOOTER_TEMPLATE': {
        const pageGraph =
          sessionPageGraph
          && sessionPageGraph.pages.length === pageCount
            ? sessionPageGraph
            : await buildPageGraphFromPdfBytes(
                context.workingBytes,
                context.documentKey,
                input.signal,
              );
        const prepared =
          prepareHeaderFooterTemplateMutation(
            pageGraph,
            command.payload.template,
            {
              fileName: context.fileName,
              now: new Date(command.createdAt),
            },
            input.resources?.binaries,
          );

        if (!prepared.ok) {
          return commandError(
            command,
            prepared.code,
            prepared.errors[0]
              ?? 'Header/footer template execution failed.',
            prepared.errors.slice(1).join('; ')
              || undefined,
          );
        }

        if (!prepared.mutated) {
          return commandSuccess(
            command,
            false,
            prepared.warnings[0]
              ?? 'Header/footer template matched no pages.',
          );
        }

        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        const rendered =
          await mutationSession.applyHeaderFooter(
            prepared.pages,
            prepared.binaryResources,
          );
        const committed = await mutationSession.commit();
        if (committed.pageCount !== pageCount) {
          throw new Error(
            `Header/footer mutation changed page count from ${pageCount} to ${committed.pageCount}.`,
          );
        }

        const warnings = [
          ...prepared.warnings,
          ...rendered.warnings,
        ];
        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
        );
        return commandSuccess(
          command,
          true,
          warnings.length > 0
            ? `Header/footer template applied with ${warnings.length} warning(s)`
            : 'Header/footer template applied',
          result.nextBytes,
          result.nextPageCount,
        );
      }

      case 'DRAW_TEXT_ON_PAGES': {
        const { options } = command.payload;
        const pageIndices = sanitizePageIndices(
          command.payload.pageIndices,
          pageCount,
        );
        if (pageIndices.length === 0) {
          return commandError(
            command,
            'VALIDATION_FAILED',
            'No pages selected for drawing text.',
          );
        }

        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        const now = new Date(command.createdAt);
        await mutationSession.drawText(
          pageIndices.map((pageIndex) => ({
            pageIndex,
            text: resolveLegacyPageTextTokens(
              options.text,
              {
                page: pageIndex + 1,
                pages: pageCount,
                file: context.fileName,
                date: now.toLocaleDateString(),
                enablePageNumberToken:
                  options.pageNumberToken ?? true,
                enableFileNameToken:
                  options.fileNameToken ?? false,
                enableDateToken:
                  options.dateToken ?? false,
              },
            ),
            xPt: options.x,
            yPt: options.y,
            fontSizePt: options.fontSize,
            color: options.color ?? '#111827',
            opacity: options.opacity ?? 0.95,
            align: options.align ?? 'left',
            rotationDegrees: options.rotation,
          })),
        );
        const committed = await mutationSession.commit();
        if (committed.pageCount !== pageCount) {
          throw new Error(
            `Text mutation changed page count from ${pageCount} to ${committed.pageCount}.`,
          );
        }

        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
        );
        return commandSuccess(
          command,
          true,
          'Text applied to pages',
          result.nextBytes,
          result.nextPageCount,
        );
      }

      case 'DRAW_REDACTION_BOX': {
        const { options } = command.payload;
        const pageIndices = sanitizePageIndices(
          command.payload.pageIndices,
          pageCount,
        );
        if (pageIndices.length === 0) {
          return commandError(
            command,
            'VALIDATION_FAILED',
            'No pages selected for visual masking.',
          );
        }

        const mutationSession =
          requirePersistentMutationSession(
            commandMutationSession,
          );
        mutationSession.drawVisualMasks(
          pageIndices.map((pageIndex) => ({
            pageIndex,
            xPt: options.x,
            yFromTopPt: options.y,
            widthPt: options.width,
            heightPt: options.height,
            fillColor:
              options.fillColor ?? '#ffffff',
          })),
        );
        const committed = await mutationSession.commit();
        if (committed.pageCount !== pageCount) {
          throw new Error(
            `Visual-mask mutation changed page count from ${pageCount} to ${committed.pageCount}.`,
          );
        }

        const result =
          await applyCommittedSessionMutation(
            input,
            context.workingBytes,
            pageCount,
            committed,
        );
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
        const writerElements = activePdfOverlayWriterElements();
        const nextWriterElements = writerElements
          ? rebindWriterElementsByPageIndex(
              writerElements,
              rebuiltPageGraph,
            )
          : undefined;
        const result = await applyMutation(
          input,
          context.workingBytes,
          nextBytes,
          nextAnnotations,
          nextWriterElements,
          command.payload.selectedPages,
          undefined,
          rebuiltPageGraph,
          {
            ocrPagePolicy: {
              rebindByPageIndex: true,
              clearIfPageCountChanged: true,
            },
          },
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
  } finally {
    commandMutationSession?.dispose();
  }
}
