import { createPageGraph } from './pageGraph';
import type { PageGraph, PageNode } from './types';

/**
 * Attaches already-resolved logical PDF labels by current physical position.
 * Resolved labels are presentation metadata, not stable PageId identity.
 */
export function applyResolvedPageLabels<TPage extends PageNode>(
  graph: PageGraph<TPage>,
  labels: readonly string[] | null,
): PageGraph<TPage> {
  if (!labels || labels.length !== graph.pages.length) {
    return clearResolvedPageLabels(graph);
  }

  return createPageGraph(
    graph.pages.map((page, index) => ({
      ...page,
      logicalLabel: labels[index] ?? '',
    })),
  );
}

/**
 * Clears resolved labels when an operation changes physical ordering/page count
 * before the /PageLabels number tree itself has been rewritten.
 *
 * Phase 5F replaces this compatibility rule with PageLabel-aware structural
 * serialization.
 */
export function clearResolvedPageLabels<TPage extends PageNode>(
  graph: PageGraph<TPage>,
): PageGraph<TPage> {
  return createPageGraph(
    graph.pages.map((page) => {
      const next = { ...page };
      delete next.logicalLabel;
      return next;
    }),
  );
}
