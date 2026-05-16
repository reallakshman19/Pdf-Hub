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
  pageNumberToken?: boolean;
  fileNameToken?: boolean;
  dateToken?: boolean;
}

export type DocumentCommand =
  | { type: 'ROTATE_PAGES'; pageIndices: number[]; angle: number }
  | { type: 'REORDER_PAGES'; fromIndex: number; toIndex: number }
  | { type: 'REORDER_PAGES_BY_ORDER'; order: number[] }
  | { type: 'EXTRACT_PAGES'; pageIndices: number[]; outputName?: string }
  | { type: 'SPLIT_PAGES'; pageIndices: number[]; outputName?: string }
  | { type: 'DELETE_PAGES'; pageIndices: number[] }
  | { type: 'INSERT_PAGES'; atIndex: number; newBytes: Uint8Array }
  | { type: 'INSERT_BLANK_PAGE'; atIndex: number; size: { width: number; height: number } }
  | { type: 'REPLACE_PAGE'; atIndex: number; donorBytes: Uint8Array; donorPageIndex: number }
  | { type: 'DUPLICATE_PAGES'; pageIndices: number[] }
  | { type: 'MERGE_PDF'; additionalBytes: Uint8Array[] }
  | { type: 'ADD_HEADER_FOOTER_TEXT'; pageIndices: number[]; options: HeaderFooterCommandOptions }
  | { type: 'DRAW_TEXT_ON_PAGES'; pageIndices: number[]; options: DrawTextCommandOptions }
  | { type: 'REPLACE_WORKING_COPY'; nextBytes: Uint8Array; nextPageCount?: number; reason?: string };

export interface CommandContext {
  currentPage: number;
  selectedPages: number[];
  fileName: string;
}

export interface CommandPayload {
  command: DocumentCommand;
  source: CommandSource;
  workingBytes?: Uint8Array;
  context?: Partial<CommandContext>;
}

export interface CommandArtifact {
  kind: 'pdf' | 'json' | 'text';
  name: string;
  bytes: Uint8Array;
}

export type CommandErrorCode =
  | 'NO_WORKING_DOCUMENT'
  | 'VALIDATION_FAILED'
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
