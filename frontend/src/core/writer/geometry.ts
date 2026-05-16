export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  position: number; // The coordinate of the guide line
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

const SNAP_THRESHOLD = 5; // pixels in unscaled PDF space

export function calculateSnaps(
  targetRect: Rect,
  otherRects: Rect[],
  pageDimensions: { width: number; height: number }
): SnapResult {
  let snapX = targetRect.x;
  let snapY = targetRect.y;
  const guides: SnapGuide[] = [];

  // Target edges
  const tLeft = targetRect.x;
  const tRight = targetRect.x + targetRect.width;
  const tCenterX = targetRect.x + targetRect.width / 2;

  const tTop = targetRect.y;
  const tBottom = targetRect.y + targetRect.height;
  const tCenterY = targetRect.y + targetRect.height / 2;

  // Track if we've snapped on an axis already (prevents multiple snaps fighting)
  let snappedX = false;
  let snappedY = false;

  const checkSnapX = (targetEdge: number, otherEdge: number, newX: number) => {
    if (!snappedX && Math.abs(targetEdge - otherEdge) < SNAP_THRESHOLD) {
      snapX = newX;
      guides.push({ axis: 'x', position: otherEdge });
      snappedX = true;
    }
  };

  const checkSnapY = (targetEdge: number, otherEdge: number, newY: number) => {
    if (!snappedY && Math.abs(targetEdge - otherEdge) < SNAP_THRESHOLD) {
      snapY = newY;
      guides.push({ axis: 'y', position: otherEdge });
      snappedY = true;
    }
  };

  // 1. Snap to page center
  const pageCenterX = pageDimensions.width / 2;
  const pageCenterY = pageDimensions.height / 2;

  checkSnapX(tCenterX, pageCenterX, pageCenterX - targetRect.width / 2);
  checkSnapY(tCenterY, pageCenterY, pageCenterY - targetRect.height / 2);

  // 2. Snap to other elements
  for (const other of otherRects) {
    if (snappedX && snappedY) break; // Optimization

    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oCenterX = other.x + other.width / 2;

    const oTop = other.y;
    const oBottom = other.y + other.height;
    const oCenterY = other.y + other.height / 2;

    // X-axis snaps
    checkSnapX(tLeft, oLeft, oLeft);                     // Left to Left
    checkSnapX(tRight, oRight, oRight - targetRect.width); // Right to Right
    checkSnapX(tCenterX, oCenterX, oCenterX - targetRect.width / 2); // Center to Center
    checkSnapX(tLeft, oRight, oRight);                   // Left to Right
    checkSnapX(tRight, oLeft, oLeft - targetRect.width);   // Right to Left

    // Y-axis snaps
    checkSnapY(tTop, oTop, oTop);                        // Top to Top
    checkSnapY(tBottom, oBottom, oBottom - targetRect.height); // Bottom to Bottom
    checkSnapY(tCenterY, oCenterY, oCenterY - targetRect.height / 2); // Center to Center
    checkSnapY(tTop, oBottom, oBottom);                  // Top to Bottom
    checkSnapY(tBottom, oTop, oTop - targetRect.height);   // Bottom to Top
  }

  return { x: snapX, y: snapY, guides };
}
