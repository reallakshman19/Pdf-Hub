// src/core/annotation-core/page-scene.ts
// ⚠️ INVARIANT: PageScene is constructed once from PDF analysis. Never mutate obstacles[] after construction (AD-04).

export type ObstacleKind =
  | 'text'
  | 'dimension-text'
  | 'dimension-line'
  | 'pipe-line'
  | 'symbol'
  | 'equipment-tag'
  | 'title-block'
  | 'revision-block'
  | 'image-content'
  | 'existing-annotation'
  | 'generated-callout'
  | 'generated-leader';

export interface PageObstacle {
  id: string;
  kind: ObstacleKind;
  /** Bounding rect in PDF coordinate space */
  bounds: { x: number; y: number; width: number; height: number };
  /** Optional penalty weight (0–1000). Hard obstacles use Infinity. */
  penaltyWeight?: number;
}

export interface OccupancyGrid {
  /** Grid resolution in points */
  cellSize: number;
  pageWidth: number;
  pageHeight: number;
  /** Flat density array: index = row * cols + col, value = 0.0–1.0 */
  density: Float32Array;
}

export interface ProtectedRegion {
  id: string;
  kind: ObstacleKind;
  bounds: { x: number; y: number; width: number; height: number };
  reason: string;
}

export interface PageScene {
  pageNumber: number;
  pageBounds: { x: number; y: number; width: number; height: number };
  obstacles: readonly PageObstacle[];
  occupancyGrid?: OccupancyGrid;
  protectedRegions: readonly ProtectedRegion[];
}
