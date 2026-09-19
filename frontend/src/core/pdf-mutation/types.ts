export interface PdfMutationPageMetrics {
  width: number;
  height: number;
  rotation: number;
}

export type PdfMutationPageLabelStyle =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'letters-lower'
  | 'letters-upper';

export interface PdfMutationPageLabelEntry {
  startPageIndex: number;
  style?: PdfMutationPageLabelStyle;
  prefix?: string;
  startNumber?: number;
}

export interface PdfMutationTextDrawOperation {
  pageIndex: number;
  text: string;
  xPt: number;
  yPt: number;
  fontSizePt: number;
  color: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
  rotationDegrees?: number;
}

export interface PdfMutationVisualMaskOperation {
  pageIndex: number;
  xPt: number;
  yFromTopPt: number;
  widthPt: number;
  heightPt: number;
  fillColor: string;
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

  insertPdf(
    atIndex: number,
    donorBytes: Uint8Array,
  ): Promise<void>;

  replacePage(
    targetIndex: number,
    donorBytes: Uint8Array,
    donorPageIndex: number,
  ): Promise<void>;

  appendPdfs(
    donorBytes: readonly Uint8Array[],
  ): Promise<void>;

  setPageLabels(
    entries: readonly PdfMutationPageLabelEntry[],
  ): void;

  drawText(
    operations: readonly PdfMutationTextDrawOperation[],
  ): Promise<void>;

  drawVisualMasks(
    operations: readonly PdfMutationVisualMaskOperation[],
  ): void;

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
