import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';

export type CollationMode = 'forward' | 'reverse-duplex';

export interface CollationItem {
  source: 'primary' | 'donor';
  sourcePageIndex: number; // 0-based
  label: string;
}

export interface CollationPlan {
  mode: CollationMode;
  sequence: CollationItem[];
  primaryPageCount: number;
  donorPageCount: number;
  totalPageCount: number;
}

/**
 * Computes an interleaved collation plan between a primary document and a donor document.
 * 
 * - 'forward': 1A, 1B, 2A, 2B, 3A, 3B...
 * - 'reverse-duplex': 1A, NB, 2A, (N-1)B... (standard duplex scanning where back pages are scanned in reverse).
 */
export function planCollation(
  primaryPageCount: number,
  donorPageCount: number,
  mode: CollationMode,
  donorPageIndices?: readonly number[],
): CollationPlan {
  if (primaryPageCount < 0) {
    throw new Error(`Invalid primary page count: ${primaryPageCount}`);
  }
  if (donorPageCount < 0) {
    throw new Error(`Invalid donor page count: ${donorPageCount}`);
  }

  const activeDonorIndices = donorPageIndices && donorPageIndices.length > 0
    ? donorPageIndices.slice()
    : Array.from({ length: donorPageCount }, (_, i) => i);

  for (const idx of activeDonorIndices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= donorPageCount) {
      throw new Error(`Donor page index ${idx} is outside bounds [0..${donorPageCount - 1}].`);
    }
  }

  const orderedDonorIndices = mode === 'reverse-duplex'
    ? [...activeDonorIndices].reverse()
    : activeDonorIndices;

  const sequence: CollationItem[] = [];
  const maxPairs = Math.max(primaryPageCount, orderedDonorIndices.length);

  for (let i = 0; i < maxPairs; i += 1) {
    if (i < primaryPageCount) {
      sequence.push({
        source: 'primary',
        sourcePageIndex: i,
        label: `Doc 1: Page ${i + 1}`,
      });
    }
    if (i < orderedDonorIndices.length) {
      const donorIdx = orderedDonorIndices[i];
      sequence.push({
        source: 'donor',
        sourcePageIndex: donorIdx,
        label: `Doc 2: Page ${donorIdx + 1}`,
      });
    }
  }

  return {
    mode,
    sequence,
    primaryPageCount,
    donorPageCount: activeDonorIndices.length,
    totalPageCount: sequence.length,
  };
}

/**
 * Collates two PDF documents into a single interleaved PDF document.
 */
export async function collatePdfDocuments(
  primaryBytes: Uint8Array,
  donorBytes: Uint8Array,
  options: {
    mode: CollationMode;
    donorPageIndices?: readonly number[];
    signal?: AbortSignal;
  },
): Promise<Uint8Array> {
  const lib = await pdfLib();
  const primaryDoc = await lib.PDFDocument.load(primaryBytes);
  const donorDoc = await lib.PDFDocument.load(donorBytes);

  const plan = planCollation(
    primaryDoc.getPageCount(),
    donorDoc.getPageCount(),
    options.mode,
    options.donorPageIndices,
  );

  const outDoc = await lib.PDFDocument.create();

  const primaryIndicesNeeded = plan.sequence
    .filter((item) => item.source === 'primary')
    .map((item) => item.sourcePageIndex);
  const donorIndicesNeeded = plan.sequence
    .filter((item) => item.source === 'donor')
    .map((item) => item.sourcePageIndex);

  const copiedPrimary = primaryIndicesNeeded.length > 0
    ? await outDoc.copyPages(primaryDoc, primaryIndicesNeeded)
    : [];
  const copiedDonor = donorIndicesNeeded.length > 0
    ? await outDoc.copyPages(donorDoc, donorIndicesNeeded)
    : [];

  let pPtr = 0;
  let dPtr = 0;

  for (const item of plan.sequence) {
    throwIfAborted(options.signal, 'collate pdf');
    if (item.source === 'primary') {
      const page = copiedPrimary[pPtr];
      pPtr += 1;
      if (page) {
        outDoc.addPage(page);
      }
    } else {
      const page = copiedDonor[dPtr];
      dPtr += 1;
      if (page) {
        outDoc.addPage(page);
      }
    }
  }

  return await outDoc.save();
}
