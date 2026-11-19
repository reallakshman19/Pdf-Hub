import type { PDFArray, PDFDict, PDFNumber } from 'pdf-lib';

import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '../cancellation/operationCancellation';
import { warn } from '../logger/service';
import { pdfLib } from '../pdf/lazyPdfLib';
import type { PageId, PageLabelRange, PageLabelStyle } from './types';

const MAX_PAGE_LABEL_TREE_DEPTH = 32;
const MAX_PAGE_LABEL_TREE_NODES = 4096;

const styles: Record<string, PageLabelStyle> = {
  '/D': 'decimal',
  '/r': 'roman-lower',
  '/R': 'roman-upper',
  '/a': 'letters-lower',
  '/A': 'letters-upper',
};

/**
 * Read the actual native /PageLabels number tree. PDF.js getPageLabels()
 * returns formatted strings only; those cannot distinguish numbering rules,
 * prefixes and restarts for subsequent page insertions/reordering.
 *
 * No unsupported/malformed tree is coerced into a plausible inferred rule.
 * Returning null leaves the resolved labels visible but bars destructive
 * structural rewrites until the user explicitly replaces them.
 */
export async function readNativePdfPageLabelRanges(
  bytes: Uint8Array,
  pageIds: readonly PageId[],
  signal?: AbortSignal,
): Promise<PageLabelRange[] | null> {
  if (pageIds.length === 0) return null;
  try {
    throwIfAborted(signal, 'load native PDF page labels');
    const lib = await pdfLib();
    const doc = await raceWithAbort(
      lib.PDFDocument.load(bytes),
      signal,
      'read native PDF page labels',
    );
    throwIfAborted(signal, 'parse native PDF page labels');
    if (doc.getPageCount() !== pageIds.length) return null;
    const root = doc.catalog.lookupMaybe(lib.PDFName.of('PageLabels'), lib.PDFDict);
    if (!root) return null;

    const seen = new Set<PDFDict>();
    const entries: Array<{ index: number; range: PageLabelRange }> = [];

    function visit(dict: PDFDict, depth: number): void {
      if (depth > MAX_PAGE_LABEL_TREE_DEPTH
        || seen.size >= MAX_PAGE_LABEL_TREE_NODES
        || seen.has(dict)) {
        throw new Error('PageLabels number tree exceeds safe bounds or contains a cycle');
      }
      seen.add(dict);
      const nums = dict.lookupMaybe(lib.PDFName.of('Nums'), lib.PDFArray);
      const kids = dict.lookupMaybe(lib.PDFName.of('Kids'), lib.PDFArray);
      if (Boolean(nums) === Boolean(kids)) {
        throw new Error('PageLabels node must have exactly one of /Nums or /Kids');
      }

      if (kids) {
        if (kids.size() === 0) throw new Error('Empty PageLabels /Kids tree');
        for (let i = 0; i < kids.size(); i += 1) {
          const child = kids.lookupMaybe(i, lib.PDFDict);
          if (!child) throw new Error('Invalid PageLabels tree child');
          visit(child, depth + 1);
        }
        return;
      }

      if (!nums || nums.size() === 0 || nums.size() % 2 !== 0) {
        throw new Error('Malformed PageLabels /Nums array');
      }
      for (let i = 0; i < nums.size(); i += 2) {
        const indexValue = nums.lookupMaybe(i, lib.PDFNumber);
        const value = nums.lookupMaybe(i + 1, lib.PDFDict);
        if (!indexValue || !value) throw new Error('Invalid PageLabels number tree pair');
        const index = indexValue.asNumber();
        if (!Number.isInteger(index) || index < 0 || index >= pageIds.length) {
          throw new Error('PageLabels start is outside PDF pages');
        }
        const styleObject = value.lookupMaybe(lib.PDFName.of('S'), lib.PDFName);
        const styleName = styleObject?.asString();
        const style = styleName ? styles[styleName] : undefined;
        if (styleName && !style) throw new Error('Unsupported PageLabels numbering style');

        const prefixValue = value.lookup(lib.PDFName.of('P'));
        let prefix: string | undefined;
        if (prefixValue !== undefined) {
          if (!(prefixValue instanceof lib.PDFString)
            && !(prefixValue instanceof lib.PDFHexString)) {
            throw new Error('PageLabels prefix must be a PDF text string');
          }
          prefix = prefixValue.decodeText();
        }

        const numberObject = value.lookupMaybe(lib.PDFName.of('St'), lib.PDFNumber);
        const startNumber = numberObject?.asNumber();
        if (startNumber !== undefined
          && (!Number.isInteger(startNumber) || startNumber < 1 || !style)) {
          throw new Error('Invalid PageLabels start number');
        }
        if (!style && (!prefix || prefix.length === 0)) {
          throw new Error('PageLabels range lacks numbering style or prefix');
        }

        const range: PageLabelRange = {
          startPageId: pageIds[index]!,
          ...(style !== undefined ? { style } : {}),
          ...(prefix !== undefined ? { prefix } : {}),
          ...(startNumber !== undefined ? { startNumber } : {}),
        };
        entries.push({ index, range });
      }
    }

    visit(root, 0);
    entries.sort((a, b) => a.index - b.index);
    if (entries[0]?.index !== 0) throw new Error('PageLabels tree has no page-zero range');
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index]!.index === entries[index - 1]!.index) {
        throw new Error('Duplicate PageLabels start index');
      }
    }
    throwIfAborted(signal, 'validate native PDF page labels');
    return entries.map(({ range }) => range);
  } catch (error) {
    if (isOperationCancelledError(error)) throw error;
    warn('pdf-renderer', 'Native PageLabels rules could not be recovered; preserving resolved-only labels', {
      error: String(error),
    });
    return null;
  }
}
