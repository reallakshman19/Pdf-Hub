export interface PdfMutationPageMetrics {
  width: number;
  height: number;
  rotation: number;
}

export interface PdfMutationCommitResult {
  bytes: Uint8Array;
  pageCount: number;
}

export interface PdfMutationSession {
  readonly pageCount: number;

  getPageMetrics(pageIndex: number): PdfMutationPageMetrics;

  rotatePages(
    pageIndices: readonly number[],
    deltaDegrees: 90 | 180 | 270,
  ): void;

  reorderPages(order: readonly number[]): Promise<void>;

  removePages(pageIndices: readonly number[]): Promise<void>;

  insertBlankPage(
    atIndex: number,
    size: { width: number; height: number },
  ): void;

  duplicatePages(pageIndices: readonly number[]): Promise<void>;

  commit(): Promise<PdfMutationCommitResult>;

  dispose(): void;
}

export interface PdfMutationEngineOpenInput {
  bytes: Uint8Array;
  signal?: AbortSignal;
}

export interface PdfMutationEngine {
  open(input: PdfMutationEngineOpenInput): Promise<PdfMutationSession>;
}
