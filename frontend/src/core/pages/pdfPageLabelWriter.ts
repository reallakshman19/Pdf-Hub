import {
  raceWithAbort,
  throwIfAborted,
} from '../cancellation/operationCancellation';
import { pdfLib } from '../pdf/lazyPdfLib';
import { applyPdfLibPageLabels } from '@/adapters/pdf-mutation/pdfLibPageLabels';
import { planPdfPageLabelEntries } from './pageLabelMutationPlan';
import type {
  PageGraph,
  PageLabelRange,
  PageNode,
} from './types';

export interface PdfPageLabelWriteResult {
  bytes: Uint8Array;
  rangeCount: number;
}

export async function writePdfPageLabels(
  baseBytes: Uint8Array,
  graph: PageGraph<PageNode>,
  ranges: readonly PageLabelRange[],
  signal?: AbortSignal,
): Promise<PdfPageLabelWriteResult> {
  throwIfAborted(signal, 'write PDF page labels');

  const plan = planPdfPageLabelEntries(
    graph,
    ranges,
  );
  if (!plan.ok) {
    throw new Error(
      `Invalid PageLabel ranges: ${plan.errors.join('; ')}`,
    );
  }

  const lib = await pdfLib();
  throwIfAborted(signal, 'load PDF for page labels');

  const doc = await raceWithAbort(
    lib.PDFDocument.load(baseBytes),
    signal,
    'load PDF for page labels',
  );

  if (doc.getPageCount() !== graph.pages.length) {
    throw new Error(
      `PageLabel PageGraph count ${graph.pages.length} does not match PDF page count ${doc.getPageCount()}`,
    );
  }

  applyPdfLibPageLabels(
    doc,
    lib,
    plan.entries,
  );

  throwIfAborted(signal, 'save PDF page labels');
  const bytes = await raceWithAbort(
    doc.save(),
    signal,
    'save PDF page labels',
  );

  return {
    bytes: new Uint8Array(bytes),
    rangeCount: ranges.length,
  };
}
