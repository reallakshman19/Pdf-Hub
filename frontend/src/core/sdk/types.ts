import type {
  CommandErrorCode,
  CommandResult,
  PdfCommandDraft,
  PdfCommandType,
} from '@/core/commands/types';
import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';

export const PDF_HUB_SDK_API_VERSION = '1' as const;

export const PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES = [
  'ROTATE_PAGES',
  'REORDER_PAGES',
  'REORDER_PAGES_BY_ORDER',
  'EXTRACT_PAGES',
  'SPLIT_PAGES',
  'DELETE_PAGES',
  'INSERT_PAGES',
  'INSERT_BLANK_PAGE',
  'REPLACE_PAGE',
  'DUPLICATE_PAGES',
  'MERGE_PDF',
  'SET_PAGE_LABELS',
  'APPLY_HEADER_FOOTER_TEMPLATE',
  'DRAW_TEXT_ON_PAGES',
  'DRAW_REDACTION_BOX',
  'REPLACE_EXISTING_TEXT',
] as const satisfies readonly PdfCommandType[];

export type PdfHubSdkApiVersion =
  typeof PDF_HUB_SDK_API_VERSION;

export type PdfHubSdkSupportedCommandType =
  typeof PDF_HUB_SDK_SUPPORTED_COMMAND_TYPES[number];

export type PdfHubSdkCommandDraft = Extract<
  PdfCommandDraft,
  { type: PdfHubSdkSupportedCommandType }
>;

export type PdfHubSdkDonorCommandTarget =
  Extract<
    PdfHubSdkSupportedCommandType,
    'INSERT_PAGES' | 'REPLACE_PAGE' | 'MERGE_PDF'
  >;

export type PdfHubSdkErrorCode =
  | 'NO_ACTIVE_DOCUMENT'
  | 'INVALID_ARGUMENT'
  | 'UNSUPPORTED_COMMAND'
  | 'DONOR_ADMISSION_REJECTED'
  | 'DONOR_ADMISSION_CANCELLED'
  | 'DONOR_ADMISSION_INVALID';

export interface PdfHubSdkCapabilities {
  apiVersion: PdfHubSdkApiVersion;
  sessionBound: true;
  donorAdmission: true;
  runtimeValidation: true;
  events: true;
  moduleEntry: true;
  legacyHeadlessCompatibility: true;
  commandTypes: readonly PdfHubSdkSupportedCommandType[];
}

export interface PdfHubSdkSessionSnapshot {
  documentKey: string | null;
  fileName: string | null;
  pageCount: number;
  pageGraph: PageGraph<PageNode> | null;
  currentPageId: PageId | null;
  currentPage: number;
  selectedPageIds: PageId[];
  selectedPages: number[];
  isDirty: boolean;
  isDocumentDirty: boolean;
  isReviewDirty: boolean;
  isSessionDirty: boolean;
}

export interface PdfHubSdkExecuteOptions {
  abortSignal?: AbortSignal;
  binaryResources?: Readonly<Record<string, Uint8Array>>;
  commandId?: string;
  groupId?: string;
  createdAt?: string;
}

export interface PdfHubSdkCommandExecution {
  result: CommandResult;
  session: PdfHubSdkSessionSnapshot;
}

export interface PdfHubSdkSubscribeOptions {
  emitCurrent?: boolean;
}

export type PdfHubSdkSessionListener = (
  snapshot: PdfHubSdkSessionSnapshot,
) => void;

export interface PdfHubSdkDonorInput {
  fileName: string;
  bytes: Uint8Array;
}

export interface PdfHubSdkDonorAdmissionRequest {
  commandTarget: PdfHubSdkDonorCommandTarget;
  donors: readonly PdfHubSdkDonorInput[];
  abortSignal?: AbortSignal;
}

export interface PdfHubSdkDonorResource {
  resourceId: string;
  fileName: string;
  sourceBytes: number;
  pageCount: number;
}

export interface PdfHubSdkDonorAdmission {
  admissionId: string;
  commandTarget: PdfHubSdkDonorCommandTarget;
  documentKey: string;
  donors: PdfHubSdkDonorResource[];
}

export type PdfHubSdkDonorReleaseReason =
  | 'explicit'
  | 'document-changed'
  | 'command-attempt';

export type PdfHubSdkEvent =
  | {
      type: 'session-changed';
      session: PdfHubSdkSessionSnapshot;
    }
  | {
      type: 'command-started';
      commandId: string;
      commandType: PdfHubSdkSupportedCommandType;
      documentKey: string;
    }
  | {
      type: 'command-finished';
      commandId: string;
      commandType: PdfHubSdkSupportedCommandType;
      documentKey: string;
      success: boolean;
      mutated: boolean;
      errorCode?: CommandErrorCode;
      exception?: true;
      failureMessage?: string;
      session: PdfHubSdkSessionSnapshot;
    }
  | {
      type: 'donor-admitted';
      admission: PdfHubSdkDonorAdmission;
    }
  | {
      type: 'donor-released';
      admissionId: string;
      commandTarget: PdfHubSdkDonorCommandTarget;
      documentKey: string;
      reason: PdfHubSdkDonorReleaseReason;
    };

export type PdfHubSdkEventListener = (
  event: PdfHubSdkEvent,
) => void;

export interface PdfHubSdkEventSubscribeOptions {
  emitCurrentSession?: boolean;
}

export interface PdfHubSdk {
  readonly apiVersion: PdfHubSdkApiVersion;
  getCapabilities(): PdfHubSdkCapabilities;
  inspectSession(): PdfHubSdkSessionSnapshot;
  getWorkingPdfBytes(): Uint8Array | null;
  admitDonors(
    request: PdfHubSdkDonorAdmissionRequest,
  ): Promise<PdfHubSdkDonorAdmission>;
  releaseDonorAdmission(
    admissionId: string,
  ): boolean;
  executeCommand(
    draft: PdfHubSdkCommandDraft,
    options?: PdfHubSdkExecuteOptions,
  ): Promise<PdfHubSdkCommandExecution>;
  subscribeSession(
    listener: PdfHubSdkSessionListener,
    options?: PdfHubSdkSubscribeOptions,
  ): () => void;
  subscribeEvents(
    listener: PdfHubSdkEventListener,
    options?: PdfHubSdkEventSubscribeOptions,
  ): () => void;
}
