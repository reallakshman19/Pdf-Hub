import { describe, expect, it } from 'vitest';
import type { PdfAnnotation } from './types';
import {
  clampUnit,
  denormalizeAnnotationGeometry,
  denormalizePath,
  denormalizePoint,
  denormalizeRect,
  migrateAnnotationFromNormalized,
  migrateAnnotationToNormalized,
  normalizeAnnotationGeometry,
  normalizePath,
  normalizePoint,
  normalizeRect,
  rotateNormPath,
  rotateNormPoint,
  rotateNormRect,
  rotateNormalizedAnnotationGeometry,
} from './normalized';

const PAGE = { width: 1000, height: 2000 };

const buildAnnotation = (): PdfAnnotation => ({
  id: 'a1',
  type: 'callout',
  pageNumber: 2,
  rect: { x: 100, y: 200, width: 300, height: 400 },
  data: {
    text: 'hello',
    anchor: { x: 900, y: 1500 },
    knee: { x: 600, y: 1000 },
    points: [100, 200, 300, 400],
    paths: [[10, 20, 30, 40], [500, 600, 700, 800]],
  },
  createdAt: 1,
  updatedAt: 1,
});

describe('normalized annotation geometry', () => {
  it('clamps finite values to [0..1]', () => {
    expect(clampUnit(-10)).toBe(0);
    expect(clampUnit(0.5)).toBe(0.5);
    expect(clampUnit(2)).toBe(1);
    expect(clampUnit(Number.NaN)).toBe(0);
  });

  it('normalizes and denormalizes points', () => {
    const normalized = normalizePoint({ x: 250, y: 1500 }, PAGE);
    expect(normalized).toEqual({ x: 0.25, y: 0.75 });
    expect(denormalizePoint(normalized, PAGE)).toEqual({ x: 250, y: 1500 });
  });

  it('normalizes and denormalizes rects', () => {
    const rect = { x: 100, y: 200, width: 500, height: 1200 };
    const normalized = normalizeRect(rect, PAGE);
    expect(normalized).toEqual({ x: 0.1, y: 0.1, width: 0.5, height: 0.6 });
    expect(denormalizeRect(normalized, PAGE)).toEqual(rect);
  });

  it('normalizes and denormalizes paths', () => {
    const path = [100, 200, 300, 400, 500, 600];
    const normalized = normalizePath(path, PAGE);
    expect(normalized).toEqual([0.1, 0.1, 0.3, 0.2, 0.5, 0.3]);
    expect(denormalizePath(normalized, PAGE)).toEqual(path);
  });

  it('normalizes full annotation geometry', () => {
    const annotation = buildAnnotation();
    const geometry = normalizeAnnotationGeometry(annotation, PAGE);
    expect(geometry.rect).toEqual({ x: 0.1, y: 0.1, width: 0.3, height: 0.2 });
    expect(geometry.anchor).toEqual({ x: 0.9, y: 0.75 });
    expect(geometry.knee).toEqual({ x: 0.6, y: 0.5 });
    expect(geometry.points).toEqual([0.1, 0.1, 0.3, 0.2]);
    expect(geometry.paths).toEqual([[0.01, 0.01, 0.03, 0.02], [0.5, 0.3, 0.7, 0.4]]);
  });

  it('denormalizes annotation geometry back into PDF coordinates', () => {
    const annotation = buildAnnotation();
    const geometry = normalizeAnnotationGeometry(annotation, PAGE);
    const denormalized = denormalizeAnnotationGeometry(annotation, geometry, PAGE);
    expect(denormalized.rect).toEqual(annotation.rect);
    expect(denormalized.data.anchor).toEqual(annotation.data.anchor);
    expect(denormalized.data.knee).toEqual(annotation.data.knee);
    expect(denormalized.data.points).toEqual(annotation.data.points);
    expect(denormalized.data.paths).toEqual(annotation.data.paths);
  });

  it('rotates normalized points by right angles', () => {
    expect(rotateNormPoint({ x: 0.2, y: 0.7 }, 90)).toEqual({ x: 0.30000000000000004, y: 0.2 });
    expect(rotateNormPoint({ x: 0.2, y: 0.7 }, 180)).toEqual({ x: 0.8, y: 0.30000000000000004 });
    expect(rotateNormPoint({ x: 0.2, y: 0.7 }, 270)).toEqual({ x: 0.7, y: 0.8 });
    expect(rotateNormPoint({ x: 0.2, y: 0.7 }, 0)).toEqual({ x: 0.2, y: 0.7 });
  });

  it('rotates normalized rects by right angles', () => {
    const rect = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
    expect(rotateNormRect(rect, 90)).toEqual({ x: 0.5, y: 0.1, width: 0.3, height: 0.4 });
    expect(rotateNormRect(rect, 180)).toEqual({ x: 0.5, y: 0.5, width: 0.4, height: 0.3 });
    expect(rotateNormRect(rect, 270)).toEqual({ x: 0.2, y: 0.5, width: 0.3, height: 0.4 });
  });

  it('rotates normalized path coordinates', () => {
    const path = [0.1, 0.2, 0.3, 0.4];
    expect(rotateNormPath(path, 90)).toEqual([0.8, 0.1, 0.6, 0.3]);
    expect(rotateNormPath(path, 180)).toEqual([0.9, 0.8, 0.7, 0.6]);
  });

  it('rotates all normalized annotation geometry fields together', () => {
    const geometry = normalizeAnnotationGeometry(buildAnnotation(), PAGE);
    const rotated = rotateNormalizedAnnotationGeometry(geometry, 90);
    expect(rotated.rect).toEqual({ x: 0.7, y: 0.1, width: 0.2, height: 0.3 });
    expect(rotated.anchor).toEqual({ x: 0.25, y: 0.9 });
    expect(rotated.knee).toEqual({ x: 0.5, y: 0.6 });
    expect(rotated.points).toEqual([0.9, 0.1, 0.8, 0.3]);
  });

  it('migrates an annotation to normalized geometry metadata', () => {
    const migrated = migrateAnnotationToNormalized(buildAnnotation(), PAGE);
    expect(migrated.data.geometryVersion).toBe(2);
    const normalized = migrated.data.normalizedGeometry as { rect: { x: number } };
    expect(normalized.rect.x).toBe(0.1);
  });

  it('hydrates annotation from normalized geometry metadata', () => {
    const annotation = buildAnnotation();
    const migrated = migrateAnnotationToNormalized(annotation, PAGE);
    migrated.rect = { x: 0, y: 0, width: 1, height: 1 };
    migrated.data.anchor = { x: 0, y: 0 };
    const hydrated = migrateAnnotationFromNormalized(migrated, PAGE);
    expect(hydrated.rect).toEqual(annotation.rect);
    expect(hydrated.data.anchor).toEqual(annotation.data.anchor);
    expect(hydrated.data.knee).toEqual(annotation.data.knee);
  });

  it('no-ops hydration when normalizedGeometry is absent', () => {
    const annotation = buildAnnotation();
    const hydrated = migrateAnnotationFromNormalized(annotation, PAGE);
    expect(hydrated).toEqual(annotation);
  });

  it('clamps out-of-range values produced during normalization', () => {
    const annotation = buildAnnotation();
    annotation.rect = { x: -200, y: -200, width: 2000, height: 3000 };
    annotation.data.anchor = { x: 3000, y: -500 };
    const normalized = normalizeAnnotationGeometry(annotation, PAGE);
    expect(normalized.rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(normalized.anchor).toEqual({ x: 1, y: 0 });
  });
});
