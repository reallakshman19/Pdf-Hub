import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
} from 'pdf-lib';

import { createPageGraph, reorderPageGraph } from './pageGraph';
import {
  applyResolvedPageLabels,
  reanchorPageLabelRangesAfterGraphChange,
  withPageLabelRanges,
} from './pageLabels';
import { readNativePdfPageLabelRanges } from './pdfPageLabelNativeReader';
import { writePdfPageLabels } from './pdfPageLabelWriter';
import type { PageNode } from './types';

const ids = ['cover', 'front-1', 'front-2', 'body-1', 'body-2'];

function graph() {
  const pages: PageNode[] = ids.map((pageId, currentIndex) => ({
    pageId,
    documentKey: 'source-pdf',
    originalPageNumber: currentIndex + 1,
    currentIndex,
    width: 300,
    height: 400,
    rotation: 0,
  }));
  return createPageGraph(pages);
}

async function originalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  ids.forEach(() => doc.addPage([300, 400]));
  doc.catalog.set(
    PDFName.of('OriginalSentinel'),
    PDFHexString.fromText('must-survive'),
  );
  return new Uint8Array(await doc.save());
}

const nativeRules = [
  { startPageId: 'cover', prefix: 'Cover' },
  { startPageId: 'front-1', style: 'roman-lower' as const },
  { startPageId: 'body-1', style: 'decimal' as const, prefix: 'Body-', startNumber: 3 },
];

describe('imported native PageLabels custody', () => {
  it('round-trips real native numbering style, prefix and restart without inference', async () => {
    const original = await originalPdf();
    const labeled = await writePdfPageLabels(original, graph(), nativeRules);
    const imported = await readNativePdfPageLabelRanges(labeled.bytes, ids);
    expect(imported).toEqual(nativeRules);

    const canonical = withPageLabelRanges(graph(), imported!);
    expect(canonical.pages.map((page) => page.logicalLabel)).toEqual([
      'Cover', 'i', 'ii', 'Body-3', 'Body-4',
    ]);

    const reordered = reorderPageGraph(canonical, ['body-1', 'body-2'], 0);
    const after = reanchorPageLabelRangesAfterGraphChange(canonical, reordered);
    expect(after.pages.map((page) => page.logicalLabel)).toEqual([
      'Body-3', 'Body-4', 'Cover', 'i', 'ii',
    ]);

    // Use real native PDF page copies, not just an artificial PageGraph.
    const sourceDoc = await PDFDocument.load(labeled.bytes);
    const destinationDoc = await PDFDocument.create();
    const copied = await destinationDoc.copyPages(sourceDoc, [3, 4, 0, 1, 2]);
    copied.forEach((page) => destinationDoc.addPage(page));
    const pageBytes = new Uint8Array(await destinationDoc.save());
    const rewritten = await writePdfPageLabels(pageBytes, after, after.pageLabelRanges!);
    const reparsed = await readNativePdfPageLabelRanges(
      rewritten.bytes,
      after.pages.map((page) => page.pageId),
    );
    expect(reparsed).toEqual(after.pageLabelRanges);
  });

  it('reads an indirect PDF number-tree /Kids hierarchy', async () => {
    const labeled = await writePdfPageLabels(await originalPdf(), graph(), nativeRules);
    const doc = await PDFDocument.load(labeled.bytes);
    const pageLabels = doc.catalog.lookupMaybe(PDFName.of('PageLabels'), PDFDict)!;
    const nums = pageLabels.lookupMaybe(PDFName.of('Nums'), PDFArray)!;
    const leftNums = doc.context.obj([nums.get(0), nums.get(1), nums.get(2), nums.get(3)]);
    const rightNums = doc.context.obj([nums.get(4), nums.get(5)]);
    const left = doc.context.obj({ Nums: leftNums }) as PDFDict;
    const right = doc.context.obj({ Nums: rightNums }) as PDFDict;
    const kids = doc.context.obj([doc.context.register(left), doc.context.register(right)]);
    const tree = doc.context.obj({ Kids: kids }) as PDFDict;
    doc.catalog.set(PDFName.of('PageLabels'), tree);
    const bytes = new Uint8Array(await doc.save());
    expect(await readNativePdfPageLabelRanges(bytes, ids)).toEqual(nativeRules);
  });

  it('fails closed instead of guessing malformed or unsupported original number trees', async () => {
    const labeled = await writePdfPageLabels(await originalPdf(), graph(), nativeRules);
    const doc = await PDFDocument.load(labeled.bytes);
    const wrongTree = doc.context.obj({
      Nums: doc.context.obj([
        PDFNumber.of(0),
        doc.context.obj({ S: PDFName.of('X') }),
      ]),
    });
    doc.catalog.set(PDFName.of('PageLabels'), wrongTree);
    const bytes = new Uint8Array(await doc.save());
    expect(await readNativePdfPageLabelRanges(bytes, ids)).toBeNull();

    const visibleButUnresolved = applyResolvedPageLabels(
      graph(),
      ['Cover', 'i', 'ii', 'Body-3', 'Body-4'],
    );
    expect(visibleButUnresolved.pageLabelRanges).toBeUndefined();
    expect(() => reanchorPageLabelRangesAfterGraphChange(
      visibleButUnresolved,
      reorderPageGraph(visibleButUnresolved, ['body-1'], 0),
    )).toThrow(/Cannot safely rewrite imported PageLabels/);
    expect(visibleButUnresolved.pages[0]?.logicalLabel).toBe('Cover');
  });

  it('keeps explicit user-cleared labels independent from unresolved third-party labels', () => {
    const unlabeled = createPageGraph(graph().pages, []);
    const after = reanchorPageLabelRangesAfterGraphChange(
      unlabeled, reorderPageGraph(unlabeled, ['body-1'], 0),
    );
    expect(after.pageLabelRanges).toEqual([]);
    expect(after.pages.every((page) => page.logicalLabel === undefined)).toBe(true);
  });
});
