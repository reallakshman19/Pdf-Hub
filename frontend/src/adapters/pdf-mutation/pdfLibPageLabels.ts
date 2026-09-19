import type {
  PdfMutationPageLabelEntry,
  PdfMutationPageLabelStyle,
} from '@/core/pdf-mutation/types';
import type { pdfLib } from '@/core/pdf/lazyPdfLib';

type PdfLibDocument = import('pdf-lib').PDFDocument;
type PdfLibNamespace = Awaited<ReturnType<typeof pdfLib>>;

export function applyPdfLibPageLabels(
  doc: PdfLibDocument,
  lib: PdfLibNamespace,
  entries: readonly PdfMutationPageLabelEntry[],
): void {
  const pageLabelsKey = lib.PDFName.of('PageLabels');

  if (entries.length === 0) {
    doc.catalog.delete(pageLabelsKey);
    return;
  }

  const nums = doc.context.obj([]) as import('pdf-lib').PDFArray;

  for (const entry of entries) {
    if (
      !Number.isInteger(entry.startPageIndex)
      || entry.startPageIndex < 0
      || entry.startPageIndex >= doc.getPageCount()
    ) {
      throw new Error(
        `PageLabel start index ${entry.startPageIndex} is outside the PDF.`,
      );
    }

    const labelDict = doc.context.obj(
      {},
    ) as import('pdf-lib').PDFDict;
    const style = pdfStyleName(entry.style);
    if (style) {
      labelDict.set(
        lib.PDFName.of('S'),
        lib.PDFName.of(style),
      );
    }
    if (entry.prefix !== undefined) {
      labelDict.set(
        lib.PDFName.of('P'),
        lib.PDFHexString.fromText(entry.prefix),
      );
    }
    if (
      entry.startNumber !== undefined
      && entry.startNumber !== 1
    ) {
      labelDict.set(
        lib.PDFName.of('St'),
        lib.PDFNumber.of(entry.startNumber),
      );
    }

    nums.push(lib.PDFNumber.of(entry.startPageIndex));
    nums.push(labelDict);
  }

  const pageLabels = doc.context.obj(
    {},
  ) as import('pdf-lib').PDFDict;
  pageLabels.set(lib.PDFName.of('Nums'), nums);
  doc.catalog.set(pageLabelsKey, pageLabels);
}

function pdfStyleName(
  style: PdfMutationPageLabelStyle | undefined,
): string | null {
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
