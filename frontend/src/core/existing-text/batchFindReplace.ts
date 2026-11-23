import type {
  BatchFindReplaceOptions,
  BatchFindReplaceScanResult,
  FindReplaceMatch,
} from './batchFindReplaceTypes';
import type { ExistingTextSpan } from './types';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { buildExistingTextPageInspection } from './model';
import { evaluateExistingTextUiCapability } from '@/adapters/pdf-text/PdfLibExistingTextUiEvaluation';
import {
  throwIfAborted,
  raceWithAbort,
} from '@/core/cancellation/operationCancellation';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findMatchesInSpan(
  span: ExistingTextSpan,
  options: BatchFindReplaceOptions,
): FindReplaceMatch[] {
  const query = options.query;
  if (!query || query.length === 0) return [];

  const text = span.text;
  const matches: FindReplaceMatch[] = [];

  let regex: RegExp;
  try {
    let pattern = options.useRegex ? query : escapeRegex(query);
    if (options.matchWholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    const flags = options.caseSensitive ? 'g' : 'gi';
    regex = new RegExp(pattern, flags);
  } catch {
    // Invalid regex
    return [];
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const startIndex = match.index;
    const matchedText = match[0];
    const endIndex = startIndex + matchedText.length;

    if (matchedText.length === 0) {
      regex.lastIndex++;
      continue;
    }

    const replacementSpanText =
      text.slice(0, startIndex) + options.replacement + text.slice(endIndex);

    matches.push({
      matchId: `${span.id}-m${startIndex}`,
      pageIndex: span.pageIndex,
      pageId: span.pageId,
      span,
      matchStartIndex: startIndex,
      matchEndIndex: endIndex,
      originalSpanText: text,
      replacementSpanText,
      matchedSubstring: matchedText,
      selected: true,
    });
  }

  return matches;
}

export async function scanDocumentForFindReplaceMatches(
  pdfBytes: Uint8Array,
  documentKey: string,
  pageGraph: { pages: ReadonlyArray<{ pageId: string; currentIndex: number }> },
  options: BatchFindReplaceOptions,
  evaluateCapabilities: boolean = false,
  signal?: AbortSignal,
): Promise<BatchFindReplaceScanResult> {
  throwIfAborted(signal, 'scan document for find-and-replace');

  const matchesByPage: Record<number, FindReplaceMatch[]> = {};
  const allMatches: FindReplaceMatch[] = [];

  const targetPages = options.pageIndices && options.pageIndices.length > 0
    ? pageGraph.pages.filter((p) => options.pageIndices!.includes(p.currentIndex))
    : pageGraph.pages;

  const lease = await raceWithAbort(
    PdfRendererAdapter.acquireDocument(pdfBytes),
    signal,
    'acquire document for find-and-replace scan',
  );

  try {
    for (const pageNode of targetPages) {
      throwIfAborted(signal, 'scan page for find-and-replace');

      const pageNumber = pageNode.currentIndex + 1;
      const pdfPage = await raceWithAbort(
        lease.doc.getPage(pageNumber),
        signal,
        `load page ${pageNumber} for find-and-replace`,
      );

      try {
        const items = await raceWithAbort(
          PdfRendererAdapter.getPageExistingTextSourceItems(pdfPage),
          signal,
          `get page ${pageNumber} text items`,
        );

        const inspection = buildExistingTextPageInspection(
          {
            revisionId: documentKey,
            pageId: pageNode.pageId,
            pageIndex: pageNode.currentIndex,
          },
          items,
        );

        const pageMatches: FindReplaceMatch[] = [];

        for (const span of inspection.spans) {
          if (span.editability === 'unsupported') continue;

          const spanMatches = findMatchesInSpan(span, options);
          for (const match of spanMatches) {
            if (evaluateCapabilities) {
              try {
                const capability = await evaluateExistingTextUiCapability({
                  pdfBytes,
                  currentRevisionId: documentKey,
                  span,
                  replacementText: match.replacementSpanText,
                  signal,
                });
                match.capability = capability;
              } catch {
                // Ignore capability eval error in scan
              }
            }
            pageMatches.push(match);
            allMatches.push(match);
          }
        }

        if (pageMatches.length > 0) {
          matchesByPage[pageNode.currentIndex] = pageMatches;
        }
      } finally {
        pdfPage.cleanup();
      }
    }
  } finally {
    await lease.release();
  }

  return {
    query: options.query,
    replacement: options.replacement,
    totalMatches: allMatches.length,
    matchesByPage,
    allMatches,
  };
}
