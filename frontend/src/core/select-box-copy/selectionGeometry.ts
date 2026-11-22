import type { SelectBoxViewportRect } from './types';

export function normalizeViewportRect(rect: SelectBoxViewportRect): SelectBoxViewportRect {
  const x1 = Math.min(rect.x, rect.x + rect.width);
  const x2 = Math.max(rect.x, rect.x + rect.width);
  const y1 = Math.min(rect.y, rect.y + rect.height);
  const y2 = Math.max(rect.y, rect.y + rect.height);

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

export function rectIntersects(
  a: SelectBoxViewportRect,
  b: SelectBoxViewportRect,
): boolean {
  const aa = normalizeViewportRect(a);
  const bb = normalizeViewportRect(b);

  return (
    aa.x < bb.x + bb.width &&
    aa.x + aa.width > bb.x &&
    aa.y < bb.y + bb.height &&
    aa.y + aa.height > bb.y
  );
}

export function itemToRect(item: {
  x: number;
  y: number;
  width: number;
  height: number;
}): SelectBoxViewportRect {
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  };
}

/** Clip to the visible page, never fabricate a region beyond its edges. */
export function clipViewportRect(rect: SelectBoxViewportRect, width: number, height: number): SelectBoxViewportRect {
  if (![rect.x, rect.y, rect.width, rect.height, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Invalid Select Box Copy geometry.');
  }
  const r = normalizeViewportRect(rect);
  const x = Math.max(0, Math.min(width, r.x));
  const y = Math.max(0, Math.min(height, r.y));
  return { x, y, width: Math.max(0, Math.min(width, r.x + r.width) - x), height: Math.max(0, Math.min(height, r.y + r.height) - y) };
}

export function rectContains(outer: SelectBoxViewportRect, inner: SelectBoxViewportRect): boolean {
  const a = normalizeViewportRect(outer), b = normalizeViewportRect(inner);
  return b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
}
