import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '../cancellation/operationCancellation';
import { pdfLib } from '../pdf/lazyPdfLib';
import { physicalIndexForPageId } from './pageGraph';
import {
  sortPageLabelRanges,
  validatePageLabelRanges,
} from './pageLabels';
import type {
  PageGraph,
  PageLabelRange,
  PageLabelStyle,
  PageNode,
} from './types';

type PdfLibModule = typeof import('pdf-lib');

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

  const validation = validatePageLabelRanges(graph, ranges);
  if (!validation.valid) {
    throw new Error(`Invalid PageLabel ranges: ${validation.errors.join('; ')}`);
  }

  const lib = await pdfLib();
  throwIfAborted(signal, 'load PDF for page labels');

  const loadPromise = lib.PDFDocument.load(baseBytes);
  const doc = await raceWithAbort(
    loadPromise,
    signal,
    'load PDF for page labels',
  );

  try {
    if (doc.getPageCount() !== graph.pages.length) {
      throw new Error(
        `PageLabel PageGraph count ${graph.pages.length} does not match PDF page count ${doc.getPageCount()}`,
      );
    }

    const pageLabelsKey = lib.PDFName.of('PageLabels');

    if (ranges.length === 0) {
      doc.catalog.delete(pageLabelsKey);
      throwIfAborted(signal, 'save PDF without page labels');
      const savePromise = doc.save();
      return {
        bytes: new Uint8Array(
          await raceWithAbort(savePromise, signal, 'save PDF without page labels'),
        ),
        rangeCount: 0,
      };
    }

    const nums = doc.context.obj([]) as import('pdf-lib').PDFArray;
    for (const range of sortPageLabelRanges(graph, ranges)) {
      throwIfAborted(signal, 'build PDF PageLabels number tree');
      const startIndex = physicalIndexForPageId(graph, range.startPageId);
      if (startIndex < 0) {
        throw new Error(`PageLabel start PageId is not in PageGraph: ${range.startPageId}`);
      }

      const labelDict = doc.context.obj({}) as import('pdf-lib').PDFDict;
      const style = pdfStyleName(range.style);
      if (style) {
        labelDict.set(lib.PDFName.of('S'), lib.PDFName.of(style));
      }
      if (range.prefix !== undefined) {
        labelDict.set(
          lib.PDFName.of('P'),
          lib.PDFHexString.fromText(range.prefix),
        );
      }
      if (range.startNumber !== undefined && range.startNumber !== 1) {
        labelDict.set(
          lib.PDFName.of('St'),
          lib.PDFNumber.of(range.startNumber),
        );
      }

      nums.push(lib.PDFNumber.of(startIndex));
      nums.push(labelDict);
    }

    const pageLabels = doc.context.obj({}) as import('pdf-lib').PDFDict;
    pageLabels.set(lib.PDFName.of('Nums'), nums);
    doc.catalog.set(pageLabelsKey, pageLabels);

    throwIfAborted(signal, 'save PDF page labels');
    const savePromise = doc.save();
    return {
      bytes: new Uint8Array(
        await raceWithAbort(savePromise, signal, 'save PDF page labels'),
      ),
      rangeCount: ranges.length,
    };
  } catch (error) {
    if (isOperationCancelledError(error)) throw error;
    throw error;
  }
}

function pdfStyleName(style: PageLabelStyle | undefined): string | null {
  switch (style) {
    case 'decimal':
      return 'D';
    case 'roman-lower':
      return 'r';
    case 'roman-upper':
      return 'R';
    case 'letters-lower':
      return 'a';
    case 'letters-upper':
      return 'A';
    default:
      return null;
  }
}

export function decodePageLabelDictionaryForTests(
  dict: import('pdf-lib').PDFDict,
  lib: PdfLibModule,
): {
  style?: string;
  prefix?: string;
  startNumber?: number;
} {
  const style = dict.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.asString();
  const prefix =
    dict.lookupMaybe(lib.PDFName.of('P'), lib.PDFString)?.decodeText()
    ?? dict.lookupMaybe(lib.PDFName.of('P'), lib.PDFHexString)?.decodeText();
  const startNumber =
    dict.lookupMaybe(lib.PDFName.of('St'), lib.PDFNumber)?.asNumber();

  return {
    ...(style ? { style } : {}),
    ...(prefix !== undefined ? { prefix } : {}),
    ...(startNumber !== undefined ? { startNumber } : {}),
  };
}
