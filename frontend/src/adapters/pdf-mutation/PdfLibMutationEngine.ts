import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import type {
  PdfMutationCommitResult,
  PdfMutationEngine,
  PdfMutationEngineOpenInput,
  PdfMutationPageMetrics,
  PdfMutationSession,
} from '@/core/pdf-mutation/types';

type PdfLibDocument = import('pdf-lib').PDFDocument;
type PdfLibNamespace = Awaited<ReturnType<typeof pdfLib>>;

type SessionState = 'open' | 'committed' | 'disposed';

class PdfLibMutationSession implements PdfMutationSession {
  private state: SessionState = 'open';

  constructor(
    private readonly document: PdfLibDocument,
    private readonly lib: PdfLibNamespace,
    private readonly signal?: AbortSignal,
  ) {}

  get pageCount(): number {
    this.assertOpen('read page count');
    return this.document.getPageCount();
  }

  getPageMetrics(pageIndex: number): PdfMutationPageMetrics {
    this.assertOpen('read page metrics');
    this.assertPageIndex(pageIndex);
    const page = this.document.getPage(pageIndex);

    return {
      width: page.getWidth(),
      height: page.getHeight(),
      rotation: normalizeDegrees(page.getRotation().angle),
    };
  }

  rotatePages(
    pageIndices: readonly number[],
    deltaDegrees: 90 | 180 | 270,
  ): void {
    this.assertOpen('rotate pages');

    const selected = Array.from(new Set(pageIndices)).sort(
      (left, right) => left - right,
    );

    for (const pageIndex of selected) {
      this.assertPageIndex(pageIndex);
      throwIfAborted(this.signal, 'rotate pages');

      const page = this.document.getPage(pageIndex);
      const nextRotation = normalizeDegrees(
        page.getRotation().angle + deltaDegrees,
      );
      page.setRotation(this.lib.degrees(nextRotation));
    }
  }

  async commit(): Promise<PdfMutationCommitResult> {
    this.assertOpen('commit mutation session');
    throwIfAborted(this.signal, 'commit mutation session');

    const bytes = await raceWithAbort(
      this.document.save(),
      this.signal,
      'commit PDF mutation session',
    );

    this.state = 'committed';

    return {
      bytes: new Uint8Array(bytes),
      pageCount: this.document.getPageCount(),
    };
  }

  dispose(): void {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
  }

  private assertOpen(operation: string): void {
    if (this.state !== 'open') {
      throw new Error(
        `PDF mutation session is ${this.state}; cannot ${operation}.`,
      );
    }
    throwIfAborted(this.signal, operation);
  }

  private assertPageIndex(pageIndex: number): void {
    if (
      !Number.isInteger(pageIndex)
      || pageIndex < 0
      || pageIndex >= this.document.getPageCount()
    ) {
      throw new Error(
        `PDF mutation page index ${pageIndex} is outside 0..${Math.max(
          0,
          this.document.getPageCount() - 1,
        )}.`,
      );
    }
  }
}

export class PdfLibMutationEngine implements PdfMutationEngine {
  async open(
    input: PdfMutationEngineOpenInput,
  ): Promise<PdfMutationSession> {
    throwIfAborted(input.signal, 'open PDF mutation session');

    const lib = await pdfLib();
    throwIfAborted(input.signal, 'open PDF mutation session');

    const document = await raceWithAbort(
      lib.PDFDocument.load(input.bytes),
      input.signal,
      'open PDF mutation session',
    );

    return new PdfLibMutationSession(
      document,
      lib,
      input.signal,
    );
  }
}

export const pdfLibMutationEngine = new PdfLibMutationEngine();

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}
