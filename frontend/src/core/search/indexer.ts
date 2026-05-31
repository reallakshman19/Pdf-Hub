import type { BBoxHit, SearchOptions, PageTextItem } from './types';

// Simple in-memory cache keyed by documentKey
const documentTextCache = new Map<string, Record<number, PageTextItem[]>>();

export class SearchIndexer {
  static getCache(documentKey: string): Record<number, PageTextItem[]> | undefined {
    return documentTextCache.get(documentKey);
  }

  static setCache(documentKey: string, pagesText: Record<number, PageTextItem[]>) {
    documentTextCache.set(documentKey, pagesText);
  }

  static clearCache(documentKey: string) {
    documentTextCache.delete(documentKey);
  }

  static search(
    pagesText: Record<number, PageTextItem[]>,
    query: string,
    options: SearchOptions
  ): BBoxHit[] {
    if (!query) return [];

    const hits: BBoxHit[] = [];
    
    let regex: RegExp;
    try {
      let pattern = options.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (options.wholeWord && !options.useRegex) {
        pattern = `\\b${pattern}\\b`;
      }
      const flags = options.caseSensitive ? 'g' : 'gi';
      regex = new RegExp(pattern, flags);
    } catch {
      return []; // invalid regex
    }

    for (const [pageStr, items] of Object.entries(pagesText)) {
      const pageNumber = Number(pageStr);
      for (const item of items) {
        // Reset regex state for global matches
        regex.lastIndex = 0;
        
        let match;
        while ((match = regex.exec(item.str)) !== null) {
          hits.push({
            pageNumber,
            text: match[0],
            rect: item.rect // In a real implementation, you'd calculate sub-rect bounds based on char widths
          });
          
          if (!regex.global) break;
        }
      }
    }

    return hits;
  }
}
