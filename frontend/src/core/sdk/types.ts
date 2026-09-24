import type {
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
  | 'UNSUPPORTED_COMMAND'
  | 'DONOR_ADMISSION_REJECTED'
  | 'DONOR_ADMISSION_CANCELLED'
  | 'DONOR_ADMISSION_INVALID';

export interface PdfHubSdkCapabilities {
  apiVersion: PdfHubSdkApiVersion;
  sessionBound: true;
  donorAdmission: true;
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
}
