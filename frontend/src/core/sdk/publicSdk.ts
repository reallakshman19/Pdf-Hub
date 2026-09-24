import { commandBus } from '@/core/commands/bus';
import {
  materializePdfCommand,
  type PdfCommandDraft,
} from '@/core/commands/types';
import { useSessionStore } from '@/core/session/store';
import type {
  PageGraph,
  PageNode,
} from '@/core/pages/types';
import {
  PDF_HUB_SDK_API_VERSION,
  PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES,
  type PdfHubSdk,
  type PdfHubSdkCapabilities,
  type PdfHubSdkCommandDraft,
  type PdfHubSdkCommandExecution,
  type PdfHubSdkErrorCode,
  type PdfHubSdkExecuteOptions,
  type PdfHubSdkSessionListener,
  type PdfHubSdkSessionSnapshot,
  type PdfHubSdkSubscribeOptions,
} from './types';

const supportedCommandTypes = new Set<string>(
  PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES,
);

export class PdfHubSdkError extends Error {
  readonly code: PdfHubSdkErrorCode;

  constructor(
    code: PdfHubSdkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PdfHubSdkError';
    this.code = code;
  }
}

export function createPdfHubSdk(): PdfHubSdk {
  return Object.freeze({
    apiVersion: PDF_HUB_SDK_API_VERSION,

    getCapabilities(): PdfHubSdkCapabilities {
      return {
        apiVersion: PDF_HUB_SDK_API_VERSION,
        sessionBound: true,
        donorAdmission: false,
        legacyHeadlessCompatibility: true,
        commandTypes: [
          ...PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES,
        ],
      };
    },

    inspectSession(): PdfHubSdkSessionSnapshot {
      return snapshotFromSession(
        useSessionStore.getState(),
      );
    },

    getWorkingPdfBytes(): Uint8Array | null {
      const bytes =
        useSessionStore.getState().workingBytes;
      return bytes ? bytes.slice() : null;
    },

    async executeCommand(
      draft: PdfHubSdkCommandDraft,
      options: PdfHubSdkExecuteOptions = {},
    ): Promise<PdfHubSdkCommandExecution> {
      assertSupportedCommand(draft);

      const session = useSessionStore.getState();
      if (!session.documentKey || !session.workingBytes) {
        throw new PdfHubSdkError(
          'NO_ACTIVE_DOCUMENT',
          'PDFHubSDK requires an active PDF document before executing commands.',
        );
      }

      const command = materializePdfCommand(
        draft,
        'api',
        session.documentKey,
        {
          ...(options.commandId
            ? { id: options.commandId }
            : {}),
          ...(options.groupId
            ? { groupId: options.groupId }
            : {}),
          ...(options.createdAt
            ? { createdAt: options.createdAt }
            : {}),
        },
      );

      const binaries =
        cloneBinaryResources(
          options.binaryResources,
        );

      const result = await commandBus.execute({
        command,
        workingBytes: session.workingBytes,
        context: {
          currentPage:
            session.viewState.currentPage,
          selectedPages: [
            ...session.selectedPages,
          ],
          fileName:
            session.fileName ?? 'document.pdf',
          documentKey: session.documentKey,
        },
        ...(binaries
          ? { resources: { binaries } }
          : {}),
        signal: options.abortSignal,
      });

      return {
        result,
        session: snapshotFromSession(
          useSessionStore.getState(),
        ),
      };
    },

    subscribeSession(
      listener: PdfHubSdkSessionListener,
      options: PdfHubSdkSubscribeOptions = {},
    ): () => void {
      if (options.emitCurrent !== false) {
        listener(
          snapshotFromSession(
            useSessionStore.getState(),
          ),
        );
      }

      return useSessionStore.subscribe(
        (state) => {
          listener(snapshotFromSession(state));
        },
      );
    },
  });
}

function assertSupportedCommand(
  draft: PdfCommandDraft,
): asserts draft is PdfHubSdkCommandDraft {
  if (!supportedCommandTypes.has(draft.type)) {
    throw new PdfHubSdkError(
      'UNSUPPORTED_COMMAND',
      `PDFHubSDK does not expose command type ${draft.type} in API version ${PDF_HUB_SDK_API_VERSION}.`,
    );
  }
}

function snapshotFromSession(
  session: ReturnType<
    typeof useSessionStore.getState
  >,
): PdfHubSdkSessionSnapshot {
  return {
    documentKey: session.documentKey,
    fileName: session.fileName,
    pageCount: session.pageCount,
    pageGraph: clonePageGraph(
      session.pageGraph,
    ),
    currentPageId:
      session.viewState.currentPageId,
    currentPage:
      session.viewState.currentPage,
    selectedPageIds: [
      ...session.selectedPageIds,
    ],
    selectedPages: [
      ...session.selectedPages,
    ],
    isDirty: session.isDirty,
    isDocumentDirty:
      session.isDocumentDirty,
    isReviewDirty: session.isReviewDirty,
    isSessionDirty:
      session.isSessionDirty,
  };
}

function clonePageGraph(
  pageGraph: PageGraph<PageNode> | null,
): PageGraph<PageNode> | null {
  if (!pageGraph) return null;

  return {
    pages: pageGraph.pages.map(
      (page) => ({ ...page }),
    ),
    ...(pageGraph.pageLabelRanges
      ? {
          pageLabelRanges:
            pageGraph.pageLabelRanges.map(
              (range) => ({ ...range }),
            ),
        }
      : {}),
  };
}

function cloneBinaryResources(
  resources:
    | Readonly<Record<string, Uint8Array>>
    | undefined,
): Record<string, Uint8Array> | undefined {
  if (!resources) return undefined;

  return Object.fromEntries(
    Object.entries(resources).map(
      ([resourceId, bytes]) => [
        resourceId,
        bytes.slice(),
      ],
    ),
  );
}
