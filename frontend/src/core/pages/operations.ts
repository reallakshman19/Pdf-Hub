/*
 * Page operations for DocCraft.
 *
 * These helper functions perform non‑destructive transformations on the
 * page list.  Each function returns a new array of PageDescriptors with
 * updated indices rather than mutating the input array.  They can be
 * integrated into command execution to build preview and apply logic.
 */

import { createPageGraph, reorderPageGraph, rotatePagesInGraph } from './pageGraph';
import type { PageDescriptor } from './types';

/**
 * Reorders pages by moving a set of pages to a target index.
 *
 * @param pages The current list of pages.
 * @param movingIds The identifiers of pages to move (in the order they currently appear).
 * @param targetIndex The index in the resulting array where the pages should be inserted.
 * @returns A new array of pages with updated currentIndex values.
 */
export function reorderPages(
  pages: PageDescriptor[],
  movingIds: string[],
  targetIndex: number,
): PageDescriptor[] {
  return reorderPageGraph(
    createPageGraph(pages),
    movingIds,
    targetIndex,
  ).pages;
}

/**
 * Rotates selected pages by a given angle.  Returns a new array of
 * pages with updated rotation values.
 *
 * @param pages The current list of pages.
 * @param pageIds Identifiers of pages to rotate.
 * @param angle Angle in degrees.  Must be a multiple of 90.
 * @returns A new array of pages.
 */
export function rotatePages(
  pages: PageDescriptor[],
  pageIds: string[],
  angle: number,
): PageDescriptor[] {
  return rotatePagesInGraph(
    createPageGraph(pages),
    pageIds,
    angle,
  ).pages;
}

/**
 * Creates a plan for extracting selected pages.  This function does not
 * modify the page list; instead it returns the identifiers of pages to
 * extract in their current order.  Higher‑level code can then handle
 * splitting or exporting the selected pages.
 *
 * @param pages The current list of pages.
 * @param pageIds Identifiers of pages to extract.
 * @returns An array of pages in the order they appear in the original list.
 */
export function extractPagesPlan(pages: PageDescriptor[], pageIds: string[]): PageDescriptor[] {
  return pages.filter((p) => pageIds.includes(p.pageId)).map((p) => ({ ...p }));
}

/**
 * Creates a plan for splitting the document at given page indices.  The
 * plan consists of ranges (start inclusive, end exclusive) representing
 * where the splits should occur.  Caller should ensure the indices
 * array is sorted.
 *
 * @param pageCount The total number of pages.
 * @param splitIndices The zero‑based indices where splits should occur.
 * @returns An array of ranges [start, end) representing the segments.
 */
export function splitDocumentPlan(pageCount: number, splitIndices: number[]): Array<{ start: number; end: number }> {
  const indices = [...splitIndices].filter((i) => i > 0 && i < pageCount).sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (const index of indices) {
    ranges.push({ start, end: index });
    start = index;
  }
  ranges.push({ start, end: pageCount });
  return ranges;
}