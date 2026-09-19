import type { ResolvedHeaderFooterPage } from './resolutionTypes';

export interface HeaderFooterPdfWriteInput {
  baseBytes: Uint8Array;
  pages: readonly ResolvedHeaderFooterPage[];
  binaryResources: Readonly<Record<string, Uint8Array>>;
  signal?: AbortSignal;
}

export interface HeaderFooterPdfWriteResult {
  bytes: Uint8Array;
  warnings: string[];
}

export interface HeaderFooterPdfWriter {
  write(
    input: HeaderFooterPdfWriteInput,
  ): Promise<HeaderFooterPdfWriteResult>;
}
