export interface PageRangeParseResult {
  valid: boolean;
  pageIndices?: number[];
  error?: string;
}

/**
 * Parses a 1-based human-readable page range string (e.g. "1-3, 5, 8", "3, 1", or "all")
 * into an array of 0-based page indices bounded by maxPages.
 * Preserves the user-specified sequence and rejects duplicate page numbers.
 */
export function parsePageRangeString(
  input: string,
  maxPages: number,
): PageRangeParseResult {
  if (maxPages <= 0) {
    return { valid: false, error: 'Maximum pages must be greater than zero.' };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: 'Please enter at least one page number or range.' };
  }

  if (trimmed.toLowerCase() === 'all') {
    return {
      valid: true,
      pageIndices: Array.from({ length: maxPages }, (_, index) => index),
    };
  }

  const segments = trimmed.split(',');
  const pageNumbers: number[] = [];
  const seen = new Set<number>();

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) {
      return { valid: false, error: 'Empty range segment between commas.' };
    }

    if (segment.includes('-')) {
      const parts = segment.split('-');
      if (parts.length !== 2) {
        return { valid: false, error: `Invalid range format: "${segment}".` };
      }

      const startStr = parts[0]?.trim() ?? '';
      const endStr = parts[1]?.trim() ?? '';

      if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) {
        return { valid: false, error: `Invalid page numbers in range: "${segment}".` };
      }

      const start = Number.parseInt(startStr, 10);
      const end = Number.parseInt(endStr, 10);

      if (start < 1 || end < 1) {
        return { valid: false, error: 'Page numbers must be 1 or greater.' };
      }

      if (start > end) {
        return {
          valid: false,
          error: `Inverted range "${segment}": start page (${start}) cannot exceed end page (${end}).`,
        };
      }

      if (start > maxPages || end > maxPages) {
        const outOfBounds = Math.max(start, end);
        return {
          valid: false,
          error: `Page number ${outOfBounds} exceeds source document length (${maxPages} pages).`,
        };
      }

      for (let page = start; page <= end; page += 1) {
        if (seen.has(page)) {
          return {
            valid: false,
            error: `Duplicate page number ${page} detected in range.`,
          };
        }
        seen.add(page);
        pageNumbers.push(page);
      }
    } else {
      if (!/^\d+$/.test(segment)) {
        return { valid: false, error: `Invalid page number: "${segment}".` };
      }

      const page = Number.parseInt(segment, 10);
      if (page < 1) {
        return { valid: false, error: 'Page numbers must be 1 or greater.' };
      }

      if (page > maxPages) {
        return {
          valid: false,
          error: `Page number ${page} exceeds source document length (${maxPages} pages).`,
        };
      }

      if (seen.has(page)) {
        return {
          valid: false,
          error: `Duplicate page number ${page} detected in range.`,
        };
      }
      seen.add(page);
      pageNumbers.push(page);
    }
  }

  return {
    valid: true,
    pageIndices: pageNumbers.map((page) => page - 1),
  };
}

export function parsePageRange(
  input: string,
  maxPages: number,
): { ok: boolean; indices: number[]; error?: string } {
  const result = parsePageRangeString(input, maxPages);
  if (!result.valid || !result.pageIndices) {
    return { ok: false, indices: [], error: result.error ?? 'Invalid page range' };
  }
  return { ok: true, indices: result.pageIndices };
}
