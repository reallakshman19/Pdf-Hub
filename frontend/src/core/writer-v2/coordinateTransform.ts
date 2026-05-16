import type {
  PdfPoint,
  PdfRect,
  ViewportPoint,
  ViewportRect,
  WriterPageViewport,
} from './types';

export function getViewportSize(viewport: WriterPageViewport): {
  width: number;
  height: number;
} {
  const normalized = normalizeViewport(viewport);

  if (normalized.rotation === 90 || normalized.rotation === 270) {
    return {
      width: normalized.pdfHeight * normalized.scale,
      height: normalized.pdfWidth * normalized.scale,
    };
  }

  return {
    width: normalized.pdfWidth * normalized.scale,
    height: normalized.pdfHeight * normalized.scale,
  };
}

export function pdfToViewportPoint(
  point: PdfPoint,
  viewport: WriterPageViewport,
): ViewportPoint {
  const { pdfWidth, pdfHeight, scale, rotation } = normalizeViewport(viewport);

  switch (rotation) {
    case 0:
      return {
        x: point.x * scale,
        y: (pdfHeight - point.y) * scale,
      };

    case 90:
      return {
        x: (pdfHeight - point.y) * scale,
        y: (pdfWidth - point.x) * scale,
      };

    case 180:
      return {
        x: (pdfWidth - point.x) * scale,
        y: point.y * scale,
      };

    case 270:
      return {
        x: point.y * scale,
        y: point.x * scale,
      };
  }
}

export function viewportToPdfPoint(
  point: ViewportPoint,
  viewport: WriterPageViewport,
): PdfPoint {
  const { pdfWidth, pdfHeight, scale, rotation } = normalizeViewport(viewport);

  switch (rotation) {
    case 0:
      return {
        x: point.x / scale,
        y: pdfHeight - point.y / scale,
      };

    case 90:
      return {
        x: pdfWidth - point.y / scale,
        y: pdfHeight - point.x / scale,
      };

    case 180:
      return {
        x: pdfWidth - point.x / scale,
        y: point.y / scale,
      };

    case 270:
      return {
        x: point.y / scale,
        y: point.x / scale,
      };
  }
}

export function screenToPdfPoint(
  screenPoint: {
    clientX: number;
    clientY: number;
  },
  pageElement: Pick<HTMLElement, 'getBoundingClientRect'>,
  viewport: WriterPageViewport,
): PdfPoint {
  const rect = pageElement.getBoundingClientRect();

  return viewportToPdfPoint(
    {
      x: screenPoint.clientX - rect.left,
      y: screenPoint.clientY - rect.top,
    },
    viewport,
  );
}

export function pdfRectToViewportRect(
  rect: PdfRect,
  viewport: WriterPageViewport,
): ViewportRect {
  const normalized = normalizePdfRect(rect);

  const corners = [
    { x: normalized.x, y: normalized.y },
    { x: normalized.x + normalized.width, y: normalized.y },
    { x: normalized.x, y: normalized.y + normalized.height },
    {
      x: normalized.x + normalized.width,
      y: normalized.y + normalized.height,
    },
  ].map((point) => pdfToViewportPoint(point, viewport));

  return pointsToViewportRect(corners);
}

export function viewportRectToPdfRect(
  rect: ViewportRect,
  viewport: WriterPageViewport,
): PdfRect {
  const normalized = normalizeViewportRect(rect);

  const corners = [
    { x: normalized.x, y: normalized.y },
    { x: normalized.x + normalized.width, y: normalized.y },
    { x: normalized.x, y: normalized.y + normalized.height },
    {
      x: normalized.x + normalized.width,
      y: normalized.y + normalized.height,
    },
  ].map((point) => viewportToPdfPoint(point, viewport));

  return pointsToPdfRect(corners);
}

export function normalizePdfRect(rect: PdfRect): PdfRect {
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

export function normalizeViewportRect(rect: ViewportRect): ViewportRect {
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

export function clampPdfPointToPage(
  point: PdfPoint,
  viewport: WriterPageViewport,
): PdfPoint {
  const normalized = normalizeViewport(viewport);

  return {
    x: clamp(point.x, 0, normalized.pdfWidth),
    y: clamp(point.y, 0, normalized.pdfHeight),
  };
}

export function clampPdfRectToPage(
  rect: PdfRect,
  viewport: WriterPageViewport,
): PdfRect {
  const normalized = normalizeViewport(viewport);
  const clean = normalizePdfRect(rect);

  const width = Math.min(clean.width, normalized.pdfWidth);
  const height = Math.min(clean.height, normalized.pdfHeight);

  return {
    x: clamp(clean.x, 0, normalized.pdfWidth - width),
    y: clamp(clean.y, 0, normalized.pdfHeight - height),
    width,
    height,
  };
}

function normalizeViewport(viewport: WriterPageViewport): WriterPageViewport {
  if (!Number.isFinite(viewport.pdfWidth) || viewport.pdfWidth <= 0) {
    throw new Error('writer-v2 viewport pdfWidth must be greater than 0.');
  }

  if (!Number.isFinite(viewport.pdfHeight) || viewport.pdfHeight <= 0) {
    throw new Error('writer-v2 viewport pdfHeight must be greater than 0.');
  }

  if (!Number.isFinite(viewport.scale) || viewport.scale <= 0) {
    throw new Error('writer-v2 viewport scale must be greater than 0.');
  }

  if (![0, 90, 180, 270].includes(viewport.rotation)) {
    throw new Error(`Unsupported writer-v2 rotation: ${viewport.rotation}`);
  }

  return viewport;
}

function pointsToViewportRect(points: ViewportPoint[]): ViewportRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function pointsToPdfRect(points: PdfPoint[]): PdfRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
