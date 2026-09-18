import type { AdmittedDonorPdf } from '@/core/admission/donorPdf';

export type PdfCommandSource =
  | 'toolbar'
  | 'thumbnail-menu'
  | 'macro-runner'
  | 'shortcut'
  | 'api'
  | 'ai'
  | 'system';

export type PdfCommandRisk =
  | 'safe'
  | 'preview-required'
  | 'confirm-required';

export interface HeaderFooterCommandOptions {
  zone: 'header' | 'footer';
  text: string;
  align: 'left' | 'center' | 'right';
  marginX: number;
  marginY: number;
  fontSize: number;
  color?: string;
  opacity?: number;
  pageNumberToken?: boolean;
  fileNameToken?: boolean;
  dateToken?: boolean;
  excludeFirstPage?: boolean;
  excludeLastPage?: boolean;
}

export interface DrawTextCommandOptions {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color?: string;
  opacity?: number;
  align?: 'left' | 'center' | 'right';
  rotation?: number;
  pageNumberToken?: boolean;
  fileNameToken?: boolean;
  dateToken?: boolean;
}

export interface RedactionBoxCommandOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
}

export interface MacroCommandMetadata {
  recipeId: string;
  recipeName: string;
  stepCount: number;
}

export interface PdfCommandBase<TType extends string, TPayload> {
  id: string;
  type: TType;
  source: PdfCommandSource;
  risk: PdfCommandRisk;
  createdAt: string;
  documentKey: string;
  payload: TPayload;
  groupId?: string;
}

export type RotatePagesCommand = PdfCommandBase<
  'ROTATE_PAGES',
  { pageIndices: number[]; angle: 90 | 180 | 270 }
>;
export type ReorderPagesCommand = PdfCommandBase<
  'REORDER_PAGES',
  { fromIndex: number; toIndex: number }
>;
export type ReorderPagesByOrderCommand = PdfCommandBase<
  'REORDER_PAGES_BY_ORDER',
  { order: number[] }
>;
export type ExtractPagesCommand = PdfCommandBase<
  'EXTRACT_PAGES',
  { pageIndices: number[]; outputName?: string }
>;
export type SplitPagesCommand = PdfCommandBase<
  'SPLIT_PAGES',
  { pageIndices: number[]; outputName?: string }
>;
export type DeletePagesCommand = PdfCommandBase<
  'DELETE_PAGES',
  { pageIndices: number[] }
>;
export type InsertPagesCommand = PdfCommandBase<
  'INSERT_PAGES',
  { atIndex: number; donorResourceId: string }
>;
export type InsertBlankPageCommand = PdfCommandBase<
  'INSERT_BLANK_PAGE',
  { atIndex: number; size: { width: number; height: number } }
>;
export type ReplacePageCommand = PdfCommandBase<
  'REPLACE_PAGE',
  { atIndex: number; donorResourceId: string; donorPageIndex: number }
>;
export type DuplicatePagesCommand = PdfCommandBase<
  'DUPLICATE_PAGES',
  { pageIndices: number[] }
>;
export type MergePdfCommand = PdfCommandBase<
  'MERGE_PDF',
  { donorResourceIds: string[] }
>;
export type AddHeaderFooterTextCommand = PdfCommandBase<
  'ADD_HEADER_FOOTER_TEXT',
  { pageIndices: number[]; options: HeaderFooterCommandOptions }
>;
export type DrawTextOnPagesCommand = PdfCommandBase<
  'DRAW_TEXT_ON_PAGES',
  { pageIndices: number[]; options: DrawTextCommandOptions }
>;
export type DrawRedactionBoxCommand = PdfCommandBase<
  'DRAW_REDACTION_BOX',
  { pageIndices: number[]; options: RedactionBoxCommandOptions }
>;
export type ApplyWorkingCopyCommand = PdfCommandBase<
  'APPLY_WORKING_COPY',
  {
    binaryResourceId: string;
    nextPageCount?: number;
    reason?: string;
    macro?: MacroCommandMetadata;
    selectedPages?: number[];
  }
>;

export type PdfCommand =
  | RotatePagesCommand
  | ReorderPagesCommand
  | ReorderPagesByOrderCommand
  | ExtractPagesCommand
  | SplitPagesCommand
  | DeletePagesCommand
  | InsertPagesCommand
  | InsertBlankPageCommand
  | ReplacePageCommand
  | DuplicatePagesCommand
  | MergePdfCommand
  | AddHeaderFooterTextCommand
  | DrawTextOnPagesCommand
  | DrawRedactionBoxCommand
  | ApplyWorkingCopyCommand;

export type PdfCommandType = PdfCommand['type'];
export type PdfCommandOfType<TType extends PdfCommandType> = Extract<
  PdfCommand,
  { type: TType }
>;
export type PdfCommandPayload<TType extends PdfCommandType> =
  PdfCommandOfType<TType>['payload'];

export type PdfCommandDraft = {
  [TType in PdfCommandType]: {
    type: TType;
    payload: PdfCommandPayload<TType>;
  };
}[PdfCommandType];

export interface CreatePdfCommandInput<TType extends PdfCommandType> {
  type: TType;
  source: PdfCommandSource;
  documentKey: string;
  payload: PdfCommandPayload<TType>;
  risk?: PdfCommandRisk;
  id?: string;
  createdAt?: string;
  groupId?: string;
}

export interface CommandResources {
  donors?: Readonly<Record<string, AdmittedDonorPdf>>;
  binaries?: Readonly<Record<string, Uint8Array>>;
}

export interface CommandContext {
  currentPage: number;
  selectedPages: number[];
  fileName: string;
  documentKey: string;
}

export interface CommandExecutionInput {
  command: PdfCommand;
  resources?: CommandResources;
  workingBytes?: Uint8Array;
  context?: Partial<CommandContext>;
  signal?: AbortSignal;
}

export interface CommandArtifact {
  kind: 'pdf' | 'json' | 'text';
  name: string;
  bytes: Uint8Array;
}

export type CommandErrorCode =
  | 'NO_WORKING_DOCUMENT'
  | 'STALE_DOCUMENT'
  | 'VALIDATION_FAILED'
  | 'RESOURCE_MISSING'
  | 'ADMISSION_REJECTED'
  | 'CANCELLED'
  | 'EXECUTION_FAILED'
  | 'UNKNOWN_COMMAND';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
  details?: string;
}

export interface CommandResult {
  success: boolean;
  commandId: string;
  commandType: PdfCommandType;
  source: PdfCommandSource;
  mutated: boolean;
  message: string;
  nextBytes?: Uint8Array;
  nextPageCount?: number;
  artifacts?: CommandArtifact[];
  error?: CommandError;
}

const PREVIEW_REQUIRED_TYPES = new Set<PdfCommandType>([
  'DELETE_PAGES',
  'SPLIT_PAGES',
  'REPLACE_PAGE',
  'REORDER_PAGES',
  'REORDER_PAGES_BY_ORDER',
]);

export function defaultRiskForCommand(type: PdfCommandType): PdfCommandRisk {
  return PREVIEW_REQUIRED_TYPES.has(type) ? 'preview-required' : 'safe';
}

export function createPdfCommand<TType extends PdfCommandType>(
  input: CreatePdfCommandInput<TType>,
): PdfCommandOfType<TType> {
  const command = {
    id: input.id ?? createCommandId(),
    type: input.type,
    source: input.source,
    risk: input.risk ?? defaultRiskForCommand(input.type),
    createdAt: input.createdAt ?? new Date().toISOString(),
    documentKey: input.documentKey,
    payload: input.payload,
    ...(input.groupId ? { groupId: input.groupId } : {}),
  };

  return command as PdfCommandOfType<TType>;
}

export function isPdfCommandSerializable(command: PdfCommand): boolean {
  try {
    const json = JSON.stringify(command);
    if (!json) return false;
    const parsed = JSON.parse(json) as unknown;
    return Boolean(parsed && typeof parsed === 'object');
  } catch {
    return false;
  }
}

function createCommandId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
