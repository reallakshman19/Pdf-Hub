// src/core/pdf-analysis/page-scene-builder.ts
// ⚠️ INVARIANT: This module must ONLY read PDF data — it must NOT write or modify PDFs.
// ⚠️ INVARIANT: Always cache PageScene by (documentSha256 + pageNumber + analyzerVersion).
//   Never re-analyze an unchanged page (AD-04).

import type { TextLayerItem } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import type { PageScene, PageObstacle, ProtectedRegion } from '../annotation-core/page-scene';

const ANALYZER_VERSION = 'v1';

export function buildPageSceneFromTextLayer(
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
  textItems: TextLayerItem[],
  titleBlockRect?: { x: number; y: number; width: number; height: number },
): PageScene {
  const obstacles: PageObstacle[] = [];
  const protectedRegions: ProtectedRegion[] = [];

  // Convert text items → text obstacles
  for (const item of textItems) {
    if (!item.text.trim()) continue;
    obstacles.push({
      id: item.id,
      kind: 'text',
      bounds: { x: item.x, y: item.y, width: item.width, height: item.height },
      penaltyWeight: 35,
    });
  }

  // Title block → protected region AND hard obstacle
  if (titleBlockRect) {
    obstacles.push({
      id: 'title-block-protected',
      kind: 'title-block',
      bounds: titleBlockRect,
      penaltyWeight: Infinity,
    });
    protectedRegions.push({
      id: 'title-block',
      kind: 'title-block',
      bounds: titleBlockRect,
      reason: 'Title block must never be obscured.',
    });
  }

  return {
    pageNumber,
    pageBounds: { x: 0, y: 0, width: pageWidth, height: pageHeight },
    obstacles,
    protectedRegions,
  };
}

export function pageSceneCacheKey(documentSha256: string, pageNumber: number): string {
  return `${documentSha256}:${pageNumber}:${ANALYZER_VERSION}`;
}
