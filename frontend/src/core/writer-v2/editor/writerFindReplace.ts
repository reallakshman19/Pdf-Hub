/** Literal non-overlapping matches, with offsets in the original UTF-16 string.
 * Unicode simple case folding avoids length-changing lowercasing (e.g. U+0130).
 * Matches never span separate Lexical TextNodes. */
export function findWriterLiteralMatches(text: string, query: string, caseSensitive: boolean): Array<{ startOffset: number; length: number }> {
  if (!query) return [];
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(literal, caseSensitive ? 'gu' : 'giu');
  return Array.from(text.matchAll(pattern), match => ({ startOffset: match.index!, length: match[0].length }));
}
