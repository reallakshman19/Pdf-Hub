/*
 * Simple search engine for DocCraft.
 *
 * This module provides a basic search implementation that operates on
 * arrays of text and metadata.  It is not optimized for very large
 * documents but serves as a functional placeholder until a more robust
 * indexing solution is implemented.
 */

import type { SearchQuery, SearchResult, SearchScope } from './types';

/**
 * Performs a basic search against provided scopes.
 *
 * @param query The search query to execute.
 * @param providers An object mapping search scopes to provider
 *   functions.  Each provider returns an array of candidate results for
 *   its scope given the search query.
 * @returns A flattened array of search results.
 */
export function runSearch(
  query: SearchQuery,
  providers: Partial<
    Record<
      SearchScope,
      (query: SearchQuery) => Array<Omit<SearchResult, 'id' | 'scope'>>
    >
  >
): SearchResult[] {
  const results: SearchResult[] = [];
  const text = query.caseSensitive ? query.text : query.text.toLowerCase();

  const match = (candidate: string): boolean => {
    const haystack = query.caseSensitive ? candidate : candidate.toLowerCase();
    if (query.regex) {
      try {
        const reg = new RegExp(query.text, query.caseSensitive ? undefined : 'i');
        return reg.test(candidate);
      } catch {
        return false;
      }
    }
    if (query.exactPhrase) {
      return haystack === text;
    }
    return haystack.includes(text);
  };

  for (const scope of query.scopes) {
    const provider = providers[scope];
    if (!provider) {
      continue;
    }
    const rawResults = provider(query);
    rawResults.forEach((r, index) => {
      if (match(r.snippet)) {
        results.push({
          id: `${scope}-${index}-${results.length}`,
          scope,
          pageNumber: r.pageNumber,
          snippet: r.snippet,
          rects: r.rects,
          deepLink: r.deepLink,
        });
      }
    });
  }

  return results;
}