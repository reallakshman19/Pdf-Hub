import type {
  PdfMutationHeaderFooterPage,
} from '@/core/pdf-mutation/types';

export interface HeaderFooterPdfWriteInput {
  baseBytes: Uint8Array;
  pages: readonly PdfMutationHeaderFooterPage[];
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
