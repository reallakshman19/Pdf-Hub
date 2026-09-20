import type {
  PageId,
} from '@/core/pages/types';

import type {
  PageTextItem,
  SearchHit,
  SearchOptions,
} from './types';

function escapeRegExp(
  value: string,
): string {
  return value.replace(
    /[.*+?^$(){}|[\]\\]/g,
    '\\$&',
  );
}

function matcherFor(
  query: string,
  options: SearchOptions,
): RegExp | null {
  if (!query) return null;

  try {
    let pattern =
      options.useRegex
        ? query
        : escapeRegExp(query);

    if (
      options.wholeWord
      && !options.useRegex
    ) {
      pattern =
        '\\b(?:'
        + pattern
        + ')\\b';
    }

    return new RegExp(
      pattern,
      options.caseSensitive
        ? 'g'
        : 'gi',
    );
  } catch {
    return null;
  }
}

export function searchIndexedPageText(
  input: {
    revisionId: string;
    pageId: PageId;
    pageNumber: number;
    items: readonly PageTextItem[];
    query: string;
    options: SearchOptions;
  },
): SearchHit[] {
  const regex = matcherFor(
    input.query,
    input.options,
  );
  if (!regex) return [];

  let fullText = '';
  const spans: Array<{
    start: number;
    end: number;
    item: PageTextItem;
  }> = [];

  for (const item of input.items) {
    const start = fullText.length;
    fullText += item.str;
    const end = fullText.length;
    spans.push({
      start,
      end,
      item,
    });
    fullText += ' ';
  }

  const hits: SearchHit[] = [];
  let match: RegExpExecArray | null;
  let ordinal = 0;

  while (
    (match = regex.exec(fullText))
      !== null
  ) {
    const start = match.index;
    const matchedText = match[0];
    const end =
      start + matchedText.length;
    const matchingItems =
      spans.filter(
        (span) =>
          span.start < end
          && span.end > start,
      );

    const snippetStart =
      Math.max(0, start - 20);
    const snippetEnd =
      Math.min(
        fullText.length,
        end + 20,
      );
    let snippet =
      fullText
        .slice(
          snippetStart,
          snippetEnd,
        )
        .trim();

    if (snippetStart > 0) {
      snippet = '...' + snippet;
    }
    if (
      snippetEnd
        < fullText.length
    ) {
      snippet =
        snippet + '...';
    }

    hits.push({
      id:
        'hit:'
        + input.revisionId
        + ':'
        + input.pageId
        + ':'
        + start
        + ':'
        + ordinal,
      pageNumber:
        input.pageNumber,
      snippet,
      rects:
        matchingItems.map(
          ({ item }) => ({
            ...item.rect,
          }),
        ),
    });
    ordinal += 1;

    if (matchedText.length === 0) {
      regex.lastIndex += 1;
    }
  }

  return hits;
}
