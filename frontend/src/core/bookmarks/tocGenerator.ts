/*
 * Table of contents generator for DocCraft.
 *
 * This utility generates a basic TOC from an array of strings or
 * heading candidates.  It is intentionally simplistic: it treats each
 * line as a heading and assigns a page number sequentially.  This serves
 * as a placeholder until a more sophisticated heading detection
 * algorithm based on font metrics and structure is available.
 */

import type { BookmarkNode } from './types';

/**
 * Generates a flat list of bookmarks from headings and page numbers.
 *
 * @param headings Array of heading strings.
 * @param startPage The starting page number for the first heading.
 * @returns An array of BookmarkNodes without children.
 */
export function generateToc(headings: string[], startPage = 1): BookmarkNode[] {
  return headings.map((title, index) => ({
    id: `toc-${index}`,
    title,
    pageNumber: startPage + index,
    children: [],
    source: 'generated' as const,
  }));
}