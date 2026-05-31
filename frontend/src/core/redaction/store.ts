/**
 * Simple in‑memory store for redaction preview data. This store follows the
 * pattern used by other core stores in the project (such as annotations and
 * pages). It does not persist data to any back‑end and is intended solely
 * for previewing potential redactions. Persisting and applying redactions
 * requires server support and is therefore deferred. See
 * `docs/REMAINING_BACKEND_DEFERRED_REGISTER.md` for details.
 */

import type { RedactionState, RedactionRegion, PdfRect } from './types';

type Listener = () => void;

const state: RedactionState = {
  regions: [],
  nextId: 1,
};

const listeners: Listener[] = [];

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

export function getState(): RedactionState {
  return {
    regions: state.regions.slice(),
    nextId: state.nextId,
  };
}

export function addRegion(pageNumber: number, rect: PdfRect, reason?: string): RedactionRegion {
  const id = `r${state.nextId++}`;
  const region: RedactionRegion = {
    id,
    pageNumber,
    rect: { ...rect },
    reason,
    status: 'preview',
  };
  state.regions.push(region);
  notify();
  return region;
}

export function updateRegion(
  regionId: string,
  patch: Partial<{ rect: PdfRect; reason: string }>
): RedactionRegion | undefined {
  const region = state.regions.find((r) => r.id === regionId);
  if (!region) return undefined;
  if (patch.rect) {
    region.rect = { ...patch.rect };
  }
  if (patch.reason !== undefined) {
    region.reason = patch.reason;
  }
  notify();
  return region;
}

export function deleteRegions(regionIds: string[]): number {
  let removed = 0;
  for (const id of regionIds) {
    const index = state.regions.findIndex((r) => r.id === id);
    if (index >= 0) {
      state.regions.splice(index, 1);
      removed++;
    }
  }
  if (removed > 0) notify();
  return removed;
}

export function clearRegions(): void {
  if (state.regions.length > 0) {
    state.regions.length = 0;
    notify();
  }
}

export function exportPlan(): {
  documentKey: string;
  pages: Array<{ pageNumber: number; rects: PdfRect[] }>;
} {
  const pagesMap: Record<number, PdfRect[]> = {};
  for (const region of state.regions) {
    if (!pagesMap[region.pageNumber]) {
      pagesMap[region.pageNumber] = [];
    }
    pagesMap[region.pageNumber].push({ ...region.rect });
  }
  return {
    documentKey: '',
    pages: Object.keys(pagesMap).map((numStr) => {
      const pageNumber = parseInt(numStr, 10);
      return { pageNumber, rects: pagesMap[pageNumber].slice() };
    }),
  };
}
