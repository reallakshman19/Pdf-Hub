import { describe, expect, it, vi } from 'vitest';

import {
  applyResolvedPageLabels,
  clearResolvedPageLabels,
} from './pageLabels';
import { createPageGraph } from './pageGraph';
import { readResolvedPdfPageLabels } from './pdfPageLabels';

function graph() {
  return createPageGraph([
    {
      pageId: 'cover',
      documentKey: 'doc',
      originalPageNumber: 1,
      currentIndex: 0,
      width: 595,
      height: 842,
      rotation: 0 as const,
    },
    {
      pageId: 'front-1',
      documentKey: 'doc',
      originalPageNumber: 2,
      currentIndex: 1,
      width: 595,
      height: 842,
      rotation: 0 as const,
    },
    {
      pageId: 'body-1',
      documentKey: 'doc',
      originalPageNumber: 3,
      currentIndex: 2,
      width: 595,
      height: 842,
      rotation: 0 as const,
    },
  ]);
}

describe('PDF PageLabels reader', () => {
  it('returns resolved labels from PDF.js without reinterpreting them', async () => {
    const labels = [
      'Cover',
      'i',
      'ii',
      'III',
      'a',
      'B',
      'APP-7',
    ];
    const getPageLabels = vi.fn().mockResolvedValue(labels);

    await expect(readResolvedPdfPageLabels({
      numPages: labels.length,
      getPageLabels,
    })).resolves.toEqual(labels);

    expect(getPageLabels).toHaveBeenCalledTimes(1);
  });

  it('returns null when the PDF has no /PageLabels entry', async () => {
    await expect(readResolvedPdfPageLabels({
      numPages: 2,
      getPageLabels: vi.fn().mockResolvedValue(null),
    })).resolves.toBeNull();
  });

  it('fails soft for an inconsistent resolved-label count', async () => {
    await expect(readResolvedPdfPageLabels({
      numPages: 3,
      getPageLabels: vi.fn().mockResolvedValue(['i', 'ii']),
    })).resolves.toBeNull();
  });

  it('fails soft when PDF.js rejects a malformed PageLabels tree', async () => {
    await expect(readResolvedPdfPageLabels({
      numPages: 1,
      getPageLabels: vi.fn().mockRejectedValue(new Error('bad number tree')),
    })).resolves.toBeNull();
  });

  it('attaches logical labels by physical position without changing PageId', () => {
    const next = applyResolvedPageLabels(graph(), ['Cover', 'i', '1']);

    expect(next.pages.map((page) => ({
      pageId: page.pageId,
      label: page.logicalLabel,
    }))).toEqual([
      { pageId: 'cover', label: 'Cover' },
      { pageId: 'front-1', label: 'i' },
      { pageId: 'body-1', label: '1' },
    ]);
  });

  it('clears resolved labels without changing identity or order', () => {
    const labeled = applyResolvedPageLabels(graph(), ['Cover', 'i', '1']);
    const cleared = clearResolvedPageLabels(labeled);

    expect(cleared.pages.map((page) => page.pageId)).toEqual([
      'cover',
      'front-1',
      'body-1',
    ]);
    expect(cleared.pages.every((page) => page.logicalLabel === undefined)).toBe(true);
  });
});
