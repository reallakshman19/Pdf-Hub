export type QuarterTurn = 0 | 90 | 180 | 270;

export interface HeaderFooterVisualGeometry {
  rawWidth: number;
  rawHeight: number;
  visualWidth: number;
  visualHeight: number;
  rotation: QuarterTurn;
}

export interface PdfPoint {
  x: number;
  y: number;
}

export function createHeaderFooterVisualGeometry(
  rawWidth: number,
  rawHeight: number,
  rotationDegrees: number,
): HeaderFooterVisualGeometry {
  const rotation = normalizeQuarterTurn(rotationDegrees);
  const swap = rotation === 90 || rotation === 270;

  return {
    rawWidth,
    rawHeight,
    visualWidth: swap ? rawHeight : rawWidth,
    visualHeight: swap ? rawWidth : rawHeight,
    rotation,
  };
}

/**
 * Maps a point from the viewer-facing, bottom-left visual coordinate space
 * into the unrotated PDF page coordinate space.
 */
export function visualPointToPdf(
  geometry: HeaderFooterVisualGeometry,
  x: number,
  y: number,
): PdfPoint {
  switch (geometry.rotation) {
    case 0:
      return { x, y };
    case 90:
      return {
        x: geometry.rawWidth - y,
        y: x,
      };
    case 180:
      return {
        x: geometry.rawWidth - x,
        y: geometry.rawHeight - y,
      };
    case 270:
      return {
        x: y,
        y: geometry.rawHeight - x,
      };
  }
}

export function normalizeQuarterTurn(value: number): QuarterTurn {
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  if (
    normalized !== 0
    && normalized !== 90
    && normalized !== 180
    && normalized !== 270
  ) {
    throw new Error(
      `Header/footer page rotation must be a quarter turn; received ${value}.`,
    );
  }
  return normalized;
}
