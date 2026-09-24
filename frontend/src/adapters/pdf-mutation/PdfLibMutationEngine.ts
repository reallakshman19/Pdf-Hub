import {
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { applyPdfLibPageLabels } from './pdfLibPageLabels';
import { applyPdfLibHeaderFooterPlan } from './pdfLibHeaderFooter';
import {
  applySimpleExistingTextReplacementToDocument,
} from '@/adapters/pdf-text/PdfLibExistingTextReplacement';
import type {
  PdfMutationCommitResult,
  PdfMutationEngine,
  PdfMutationEngineOpenInput,
  PdfMutationPageMetrics,
  PdfMutationPageLabelEntry,
  PdfMutationTextDrawOperation,
  PdfMutationVisualMaskOperation,
  PdfMutationHeaderFooterPage,
  PdfMutationHeaderFooterResult,
  PdfMutationSession,
} from '@/core/pdf-mutation/types';

type PdfLibDocument = import('pdf-lib').PDFDocument;
type PdfLibNamespace = Awaited<ReturnType<typeof pdfLib>>;

type SessionState = 'open' | 'committed' | 'disposed';

class PdfLibMutationSession implements PdfMutationSession {
  private state: SessionState = 'open';

  constructor(
    private document: PdfLibDocument,
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


  async reorderPages(
    order: readonly number[],
  ): Promise<void> {
    this.assertOpen('reorder pages');
    const pageCount = this.document.getPageCount();

    if (order.length !== pageCount) {
      throw new Error(
        'Reorder list length does not match page count',
      );
    }

    const sorted = [...order].sort((left, right) => left - right);
    for (let index = 0; index < pageCount; index += 1) {
      throwIfAborted(this.signal, 'reorder pages');
      if (sorted[index] !== index) {
        throw new Error(
          'Reorder list is not a valid page permutation',
        );
      }
    }

    this.document = await this.rebuildFromOrder(
      order,
      'reorder pages',
    );
  }

  async removePages(
    pageIndices: readonly number[],
  ): Promise<void> {
    this.assertOpen('remove pages');
    const toRemove = new Set(normalizePageIndices(pageIndices));
    const keepIndices = this.document
      .getPageIndices()
      .filter((index) => !toRemove.has(index));

    if (keepIndices.length === 0) {
      throw new Error(
        'Cannot remove all pages from the document',
      );
    }

    this.document = await this.rebuildFromOrder(
      keepIndices,
      'remove pages',
    );
  }

  insertBlankPage(
    atIndex: number,
    size: { width: number; height: number },
  ): void {
    this.assertOpen('insert blank page');
    throwIfAborted(this.signal, 'insert blank page');

    const targetIndex = Math.max(
      0,
      Math.min(atIndex, this.document.getPageCount()),
    );
    this.document.insertPage(
      targetIndex,
      [size.width, size.height],
    );
  }

  async duplicatePages(
    pageIndices: readonly number[],
  ): Promise<void> {
    this.assertOpen('duplicate pages');
    const selected = new Set(
      normalizePageIndices(pageIndices),
    );
    const order: number[] = [];

    for (const index of this.document.getPageIndices()) {
      throwIfAborted(this.signal, 'duplicate pages');
      order.push(index);
      if (selected.has(index)) order.push(index);
    }

    this.document = await this.rebuildFromOrder(
      order,
      'duplicate pages',
    );
  }

  private async rebuildFromOrder(
    order: readonly number[],
    operation: string,
  ): Promise<PdfLibDocument> {
    throwIfAborted(this.signal, operation);

    const output = await raceWithAbort(
      this.lib.PDFDocument.create(),
      this.signal,
      `${operation}: create output`,
    );
    const copied = await raceWithAbort(
      output.copyPages(this.document, [...order]),
      this.signal,
      `${operation}: copy pages`,
    );

    for (const page of copied) {
      throwIfAborted(this.signal, `${operation}: add page`);
      output.addPage(page);
    }

    return output;
  }


  async insertPdf(
    atIndex: number,
    donorBytes: Uint8Array,
  ): Promise<void> {
    this.assertOpen('insert donor PDF');
    const donor = await this.loadDonor(
      donorBytes,
      'insert donor PDF',
    );
    const copied = await raceWithAbort(
      this.document.copyPages(
        donor,
        donor.getPageIndices(),
      ),
      this.signal,
      'insert donor PDF: copy pages',
    );

    let targetIndex = Math.max(
      0,
      Math.min(atIndex, this.document.getPageCount()),
    );
    for (const page of copied) {
      throwIfAborted(
        this.signal,
        'insert donor PDF: insert page',
      );
      this.document.insertPage(targetIndex, page);
      targetIndex += 1;
    }
  }

  async replacePage(
    targetIndex: number,
    donorBytes: Uint8Array,
    donorPageIndex: number,
  ): Promise<void> {
    this.assertOpen('replace page from donor PDF');
    this.assertPageIndex(targetIndex);

    const donor = await this.loadDonor(
      donorBytes,
      'replace page from donor PDF',
    );
    if (
      !Number.isInteger(donorPageIndex)
      || donorPageIndex < 0
      || donorPageIndex >= donor.getPageCount()
    ) {
      throw new Error(
        `Donor page index ${donorPageIndex} is outside 0..${Math.max(
          0,
          donor.getPageCount() - 1,
        )}.`,
      );
    }

    const output = await raceWithAbort(
      this.lib.PDFDocument.create(),
      this.signal,
      'replace page: create output',
    );
    const [replacement] = await raceWithAbort(
      output.copyPages(donor, [donorPageIndex]),
      this.signal,
      'replace page: copy donor page',
    );

    for (const index of this.document.getPageIndices()) {
      throwIfAborted(
        this.signal,
        'replace page: rebuild output',
      );

      if (index === targetIndex) {
        output.addPage(replacement);
        continue;
      }

      const [copied] = await raceWithAbort(
        output.copyPages(this.document, [index]),
        this.signal,
        'replace page: copy source page',
      );
      output.addPage(copied);
    }

    this.document = output;
  }

  async appendPdfs(
    donorBytes: readonly Uint8Array[],
  ): Promise<void> {
    this.assertOpen('append donor PDFs');

    for (const [index, bytes] of donorBytes.entries()) {
      throwIfAborted(
        this.signal,
        `append donor PDF ${index}`,
      );
      const donor = await this.loadDonor(
        bytes,
        `append donor PDF ${index}`,
      );
      const copied = await raceWithAbort(
        this.document.copyPages(
          donor,
          donor.getPageIndices(),
        ),
        this.signal,
        `append donor PDF ${index}: copy pages`,
      );
      for (const page of copied) {
        throwIfAborted(
          this.signal,
          `append donor PDF ${index}: add page`,
        );
        this.document.addPage(page);
      }
    }
  }

  private async loadDonor(
    bytes: Uint8Array,
    operation: string,
  ): Promise<PdfLibDocument> {
    throwIfAborted(this.signal, operation);
    return raceWithAbort(
      this.lib.PDFDocument.load(bytes),
      this.signal,
      `${operation}: load donor`,
    );
  }


  setPageLabels(
    entries: readonly PdfMutationPageLabelEntry[],
  ): void {
    this.assertOpen('set PDF PageLabels');
    throwIfAborted(this.signal, 'set PDF PageLabels');
    applyPdfLibPageLabels(
      this.document,
      this.lib,
      entries,
    );
  }


  async drawText(
    operations: readonly PdfMutationTextDrawOperation[],
  ): Promise<void> {
    this.assertOpen('draw text');
    if (operations.length === 0) return;

    const font = await raceWithAbort(
      this.document.embedFont(
        this.lib.StandardFonts.Helvetica,
      ),
      this.signal,
      'draw text: embed font',
    );

    for (const operation of operations) {
      this.assertPageIndex(operation.pageIndex);
      throwIfAborted(this.signal, 'draw text');

      const page = this.document.getPage(
        operation.pageIndex,
      );
      const textWidth = font.widthOfTextAtSize(
        operation.text,
        operation.fontSizePt,
      );
      const x =
        operation.align === 'left'
          ? operation.xPt
          : operation.align === 'center'
            ? (page.getWidth() - textWidth) / 2
            : page.getWidth()
              - operation.xPt
              - textWidth;

      page.drawText(operation.text, {
        x,
        y: operation.yPt,
        font,
        size: operation.fontSizePt,
        color: pdfLibColorFromHex(
          operation.color,
          this.lib,
        ),
        opacity: operation.opacity,
        rotate:
          operation.rotationDegrees !== undefined
            ? this.lib.degrees(
                operation.rotationDegrees,
              )
            : undefined,
      });
    }
  }

  drawVisualMasks(
    operations: readonly PdfMutationVisualMaskOperation[],
  ): void {
    this.assertOpen('draw visual masks');

    for (const operation of operations) {
      this.assertPageIndex(operation.pageIndex);
      throwIfAborted(this.signal, 'draw visual masks');

      const page = this.document.getPage(
        operation.pageIndex,
      );
      const drawY =
        page.getHeight()
        - operation.yFromTopPt
        - operation.heightPt;

      page.drawRectangle({
        x: operation.xPt,
        y: drawY,
        width: operation.widthPt,
        height: operation.heightPt,
        color: pdfLibColorFromHex(
          operation.fillColor,
          this.lib,
        ),
        opacity: 1,
      });
    }
  }


  async applyHeaderFooter(
    pages: readonly PdfMutationHeaderFooterPage[],
    binaryResources: Readonly<Record<string, Uint8Array>>,
  ): Promise<PdfMutationHeaderFooterResult> {
    this.assertOpen('apply header/footer');
    return applyPdfLibHeaderFooterPlan(
      this.document,
      this.lib,
      pages,
      binaryResources,
      this.signal,
    );
  }

  async replaceExistingText(
    input: Parameters<
      PdfMutationSession['replaceExistingText']
    >[0],
  ): ReturnType<
    PdfMutationSession['replaceExistingText']
  > {
    this.assertOpen(
      'replace existing PDF text',
    );
    return applySimpleExistingTextReplacementToDocument(
      this.document,
      this.lib,
      {
        ...input,
        signal: this.signal,
      },
    );
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


function normalizePageIndices(
  pageIndices: readonly number[],
): number[] {
  return Array.from(new Set(pageIndices))
    .filter((pageIndex) => Number.isInteger(pageIndex))
    .sort((left, right) => left - right);
}


function pdfLibColorFromHex(
  hex: string,
  lib: PdfLibNamespace,
): import('pdf-lib').Color {
  const normalized = hex.replace('#', '').trim();
  const safe =
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => character + character)
          .join('')
      : normalized.padEnd(6, '0').slice(0, 6);

  const red = parseInt(safe.slice(0, 2), 16) / 255;
  const green = parseInt(safe.slice(2, 4), 16) / 255;
  const blue = parseInt(safe.slice(4, 6), 16) / 255;

  return lib.rgb(red, green, blue);
}
