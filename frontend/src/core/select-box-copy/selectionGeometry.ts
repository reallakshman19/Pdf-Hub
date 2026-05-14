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