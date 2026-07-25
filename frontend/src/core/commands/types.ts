// ── Architecture-level command system (Agent 00 contract) ───────────────────

import type { AnnotationType } from '@/core/annotations/annotationTypes';
import type { AdmittedDonorPdf } from '@/core/admission/donorPdf';


export type PdfCommandSource = 'user' | 'macro' | 'ai' | 'system';

export type PdfCommandRisk =
  | 'safe'
  | 'destructive'
  | 'destructive-preview-required'
  | 'destructive-confirm-required'
  | 'server-only';

export interface PdfCommandBase<TType extends string, TPayload> {
  id: string;
  type: TType;
  source: PdfCommandSource;
  risk: PdfCommandRisk;
  createdAt: string;
  documentKey: string;
  payload: TPayload;
}

export interface PdfCommandResult {
  commandId: string;
  ok: boolean;
  dirty: boolean;
  message?: string;
  inverseCommand?: PdfCommand;
  diagnostics?: Record<string, unknown>;
}

export interface PdfCommandPreview {
  commandId: string;
  title: string;
  summary: string;
  affectedPages: number[];
  warnings: string[];
  before?: unknown;
  after?: unknown;
}

export interface PdfPoint {
  pageNumber: number;
  x: number;
  y: number;
  coordinateSpace: 'pdf-points';
}

export type AddAnnotationCommand = PdfCommandBase<'ANNOTATION_ADD', { annotationType: AnnotationType; pageNumber: number; rect: { x: number; y: number; width: number; height: number }; style: Record<string, unknown>; content?: string }>;
export type UpdateAnnotationCommand = PdfCommandBase<'ANNOTATION_UPDATE', { annotationId: string; patch: Record<string, unknown> }>;
export type DeleteAnnotationCommand = PdfCommandBase<'ANNOTATION_DELETE', { annotationIds: string[] }>;
export type AddWriterOverlayCommand = PdfCommandBase<'WRITER_OVERLAY_ADD', { overlayType: 'textBox' | 'image' | 'table' | 'link'; pageNumber: number; rect: { x: number; y: number; width: number; height: number }; content: unknown; style: Record<string, unknown> }>;
export type UpdateWriterOverlayCommand = PdfCommandBase<'WRITER_OVERLAY_UPDATE', { overlayId: string; patch: Record<string, unknown> }>;
export type DeleteWriterOverlayCommand = PdfCommandBase<'WRITER_OVERLAY_DELETE', { overlayIds: string[] }>;
export type OrganizePagesCommand = PdfCommandBase<'PAGES_ORGANIZE', { operation: 'insertBlank' | 'insertFromFile' | 'delete' | 'duplicate' | 'rotate' | 'replace' | 'reorder' | 'extract' | 'split'; pageNumbers: number[]; targetIndex?: number; rotation?: 90 | 180 | 270; sourceDocumentKey?: string; sourcePageNumbers?: number[] }>;
export type StartOcrCommand = PdfCommandBase<'OCR_START', { pageNumbers: number[]; mode: 'auto' | 'region'; language: string; regions?: Array<{ pageNumber: number; rect: { x: number; y: number; width: number; height: number } }> }>;
export type CommitOcrTextLayerCommand = PdfCommandBase<'OCR_COMMIT_TEXT_LAYER', { jobId: string; pageNumbers: number[]; searchable: boolean }>;
export type AddBookmarkCommand = PdfCommandBase<'BOOKMARK_ADD', { title: string; pageNumber: number; x?: number; y?: number; parentId?: string }>;
export type UpdateBookmarkCommand = PdfCommandBase<'BOOKMARK_UPDATE', { bookmarkId: string; patch: Record<string, unknown> }>;
export type DeleteBookmarkCommand = PdfCommandBase<'BOOKMARK_DELETE', { bookmarkIds: string[] }>;
export type MacroCommand = PdfCommandBase<'MACRO_RUN', { macroId: string; commands: PdfCommand[] }>;
export type AiGeneratedCommand = PdfCommandBase<'AI_GENERATED_COMMAND', { prompt: string; proposedCommands: PdfCommand[]; explanation: string; requiresUserConfirmation: true }>;
export type PreviewRedactionCommand = PdfCommandBase<'REDACTION_PREVIEW', { pageNumber: number; rects: Array<{ x: number; y: number; width: number; height: number }>; reason?: string }>;
export type ApplyRedactionCommand = PdfCommandBase<'REDACTION_APPLY', { redactionPreviewId: string; pageRects: Array<{ pageNumber: number; rects: Array<{ x: number; y: number; width: number; height: number }> }>; removeText: true; removeImages: true; removeAnnotations: true; removeOcrText: true }>;

export type PdfCommand =
  | AddAnnotationCommand
  | UpdateAnnotationCommand
  | DeleteAnnotationCommand
  | AddWriterOverlayCommand
  | UpdateWriterOverlayCommand
  | DeleteWriterOverlayCommand
  | OrganizePagesCommand
  | StartOcrCommand
  | CommitOcrTextLayerCommand
  | AddBookmarkCommand
  | UpdateBookmarkCommand
  | DeleteBookmarkCommand
  | MacroCommand
  | AiGeneratedCommand
  | PreviewRedactionCommand
  | ApplyRedactionCommand;

// ── Dispatch-level command system (existing implementation) ──────────────────

export type CommandSource =
  | 'toolbar'
  | 'thumbnail-menu'
  | 'macro-runner'
  | 'shortcut'
  | 'system';

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

export type DocumentCommand =
  | { type: 'ROTATE_PAGES'; pageIndices: number[]; angle: number }
  | { type: 'REORDER_PAGES'; fromIndex: number; toIndex: number }
  | { type: 'REORDER_PAGES_BY_ORDER'; order: number[] }
  | { type: 'EXTRACT_PAGES'; pageIndices: number[]; outputName?: string }
  | { type: 'SPLIT_PAGES'; pageIndices: number[]; outputName?: string }
  | { type: 'DELETE_PAGES'; pageIndices: number[] }
  | { type: 'INSERT_PAGES'; atIndex: number; donor: AdmittedDonorPdf }
  | { type: 'INSERT_BLANK_PAGE'; atIndex: number; size: { width: number; height: number } }
  | { type: 'REPLACE_PAGE'; atIndex: number; donor: AdmittedDonorPdf; donorPageIndex: number }
  | { type: 'DUPLICATE_PAGES'; pageIndices: number[] }
  | { type: 'MERGE_PDF'; donors: readonly AdmittedDonorPdf[] }
  | { type: 'ADD_HEADER_FOOTER_TEXT'; pageIndices: number[]; options: HeaderFooterCommandOptions }
  | { type: 'DRAW_TEXT_ON_PAGES'; pageIndices: number[]; options: DrawTextCommandOptions }
  | { type: 'DRAW_REDACTION_BOX'; pageIndices: number[]; options: RedactionBoxCommandOptions }
  | { type: 'REPLACE_WORKING_COPY'; nextBytes: Uint8Array; nextPageCount?: number; reason?: string };

export interface CommandContext {
  currentPage: number;
  selectedPages: number[];
  fileName: string;
  documentKey: string;
}

export interface CommandPayload {
  command: DocumentCommand;
  source: CommandSource;
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
  | 'VALIDATION_FAILED'
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
  command: DocumentCommand['type'];
  source: CommandSource;
  mutated: boolean;
  message: string;
  nextBytes?: Uint8Array;
  nextPageCount?: number;
  artifacts?: CommandArtifact[];
  error?: CommandError;
}
