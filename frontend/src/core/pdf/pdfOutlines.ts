type PDFDict = import('pdf-lib').PDFDict;
type PDFRef = import('pdf-lib').PDFRef;

import type { AppBookmark } from '@/core/bookmarks/types';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

const MAX_EXISTING_OUTLINE_NODES = 4096;

interface PreparedOutlineBookmark {
  title: string;
  pageIndex: number;
}

/**
 * Resolves the top-level key `"title@@pageIndex"` for an existing PDF outline
 * node when its /Dest directly references a page in `pageRefToIndex`.
 */
function resolveOutlineItemKey(
  lib: Awaited<ReturnType<typeof pdfLib>>,
  dict: PDFDict,
  pageRefToIndex: Map<string, number>,
): string | null {
  const rawTitle = dict.get(lib.PDFName.of('Title'));
  let title = '';
  if (rawTitle instanceof lib.PDFString || rawTitle instanceof lib.PDFHexString) {
    title = rawTitle.decodeText().trim();
  }
  if (!title) return null;

  const rawDest = dict.lookup(lib.PDFName.of('Dest'));
  if (!(rawDest instanceof lib.PDFArray) || rawDest.size() === 0) {
    return null;
  }
  const firstRef = rawDest.get(0);
  if (!(firstRef instanceof lib.PDFRef)) return null;
  const pageIndex = pageRefToIndex.get(firstRef.toString());
  if (pageIndex === undefined) return null;

  return `${title.toLowerCase()}@@${pageIndex}`;
}

/**
 * Appends custom user bookmarks into the PDF catalog's native `/Outlines`
 * tree (ISO 32000-1 §12.3.3), preserving any pre-existing native outline
 * entries and avoiding duplicate top-level `(title, page)` items on re-save.
 */
export async function writeCustomBookmarksToPdfOutlines(
  pdfBytes: Uint8Array,
  bookmarks: readonly AppBookmark[],
): Promise<Uint8Array> {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return pdfBytes;
  }

  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(pdfBytes, { updateMetadata: false });
  const pageCount = doc.getPageCount();
  if (pageCount <= 0) {
    return pdfBytes;
  }

  const candidateItems: PreparedOutlineBookmark[] = [];
  const candidateSeen = new Set<string>();
  for (const bookmark of bookmarks) {
    const title = bookmark.title.trim();
    const pageIndex = bookmark.pageNumber - 1;
    if (!title || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
      continue;
    }
    const key = `${title.toLowerCase()}@@${pageIndex}`;
    if (candidateSeen.has(key)) continue;
    candidateSeen.add(key);
    candidateItems.push({ title, pageIndex });
  }

  if (candidateItems.length === 0) {
    return pdfBytes;
  }

  const pages = doc.getPages();
  const pageRefToIndex = new Map<string, number>();
  pages.forEach((page, index) => {
    pageRefToIndex.set(page.ref.toString(), index);
  });

  const outlinesName = lib.PDFName.of('Outlines');
  const firstName = lib.PDFName.of('First');
  const lastName = lib.PDFName.of('Last');
  const prevName = lib.PDFName.of('Prev');
  const nextName = lib.PDFName.of('Next');
  const parentName = lib.PDFName.of('Parent');
  const countName = lib.PDFName.of('Count');
  const titleName = lib.PDFName.of('Title');
  const destName = lib.PDFName.of('Dest');

  let rootRef: PDFRef;
  let rootDict: PDFDict;
  let existingLastRef: PDFRef | null = null;
  let existingCountValue: number | null = null;
  const existingKeys = new Set<string>();

  const existingRaw = doc.catalog.get(outlinesName);
  const existingResolved = doc.catalog.lookupMaybe(outlinesName, lib.PDFDict);

  if (existingResolved) {
    rootDict = existingResolved;
    if (existingRaw instanceof lib.PDFRef) {
      rootRef = existingRaw;
    } else {
      rootRef = doc.context.register(rootDict);
      doc.catalog.set(outlinesName, rootRef);
    }

    const existingCountObj = rootDict.lookupMaybe(countName, lib.PDFNumber);
    if (existingCountObj) {
      existingCountValue = existingCountObj.asNumber();
    }

    let cursorRef: PDFRef | undefined =
      rootDict.get(firstName) instanceof lib.PDFRef
        ? (rootDict.get(firstName) as PDFRef)
        : undefined;
    const visited = new Set<string>();
    let steps = 0;

    while (cursorRef && steps < MAX_EXISTING_OUTLINE_NODES) {
      const refId = cursorRef.toString();
      if (visited.has(refId)) break;
      visited.add(refId);
      steps += 1;

      const itemDict = doc.context.lookupMaybe(cursorRef, lib.PDFDict);
      if (!itemDict) break;

      const key = resolveOutlineItemKey(lib, itemDict, pageRefToIndex);
      if (key) existingKeys.add(key);

      existingLastRef = cursorRef;
      const nextVal = itemDict.get(nextName);
      cursorRef = nextVal instanceof lib.PDFRef ? nextVal : undefined;
    }
  } else {
    rootDict = doc.context.obj({
      Type: 'Outlines',
      Count: lib.PDFNumber.of(0),
    });
    rootRef = doc.context.register(rootDict);
    doc.catalog.set(outlinesName, rootRef);
    if (!doc.catalog.has(lib.PDFName.of('PageMode'))) {
      doc.catalog.set(lib.PDFName.of('PageMode'), lib.PDFName.of('UseOutlines'));
    }
  }

  const itemsToInsert = candidateItems.filter(
    (item) => !existingKeys.has(`${item.title.toLowerCase()}@@${item.pageIndex}`),
  );
  if (itemsToInsert.length === 0) {
    return pdfBytes;
  }

  const newRefs: PDFRef[] = [];
  const newDicts: PDFDict[] = [];
  for (const item of itemsToInsert) {
    const pageRef = pages[item.pageIndex]!.ref;
    const destArray = doc.context.obj([
      pageRef,
      lib.PDFName.of('XYZ'),
      lib.PDFNull,
      lib.PDFNull,
      lib.PDFNull,
    ]);
    const itemDict = doc.context.obj({});
    itemDict.set(titleName, lib.PDFHexString.fromText(item.title));
    itemDict.set(parentName, rootRef);
    itemDict.set(destName, destArray);
    const itemRef = doc.context.register(itemDict);
    newRefs.push(itemRef);
    newDicts.push(itemDict);
  }

  for (let index = 0; index < newDicts.length; index += 1) {
    if (index > 0) {
      newDicts[index]!.set(prevName, newRefs[index - 1]!);
    }
    if (index + 1 < newDicts.length) {
      newDicts[index]!.set(nextName, newRefs[index + 1]!);
    }
  }

  if (existingLastRef) {
    const existingLastDict = doc.context.lookupMaybe(existingLastRef, lib.PDFDict);
    if (existingLastDict) {
      existingLastDict.set(nextName, newRefs[0]!);
      newDicts[0]!.set(prevName, existingLastRef);
    }
    rootDict.set(lastName, newRefs[newRefs.length - 1]!);
    if (!rootDict.has(firstName)) {
      rootDict.set(firstName, newRefs[0]!);
    }
    const baseCount = existingCountValue ?? 0;
    const nextCount =
      baseCount < 0 ? baseCount - newRefs.length : baseCount + newRefs.length;
    rootDict.set(countName, lib.PDFNumber.of(nextCount));
  } else {
    rootDict.set(firstName, newRefs[0]!);
    rootDict.set(lastName, newRefs[newRefs.length - 1]!);
    rootDict.set(countName, lib.PDFNumber.of(newRefs.length));
  }

  return doc.save({ useObjectStreams: false });
}
