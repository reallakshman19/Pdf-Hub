import type { PdfRect } from './types';

export interface WriterSnapContext {
  pageWidth: number;
  pageHeight: number;
  threshold?: number;
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface WriterSnapResult {
  rect: PdfRect;
  snappedX: boolean;
  snappedY: boolean;
}

const DEFAULT_SNAP_THRESHOLD = 6;

export function applyWriterRectSnap(
  rect: PdfRect,
  context: WriterSnapContext,
): WriterSnapResult {
  const threshold = context.threshold ?? DEFAULT_SNAP_THRESHOLD;
  const xCandidates = buildHorizontalSnapCandidates(rect, context);
  const yCandidates = buildVerticalSnapCandidates(rect, context);
  const x = nearestCandidate(rect.x, xCandidates, threshold);
  const y = nearestCandidate(rect.y, yCandidates, threshold);

  return {
    rect: {
      ...rect,
      x: x.value,
      y: y.value,
    },
    snappedX: x.snapped,
    snappedY: y.snapped,
  };
}

function buildHorizontalSnapCandidates(
  rect: PdfRect,
  context: WriterSnapContext): number[] {
  const rightEdgeX = context.pageWidth - rect.width;
  const centerX = context.pageWidth / 2 - rect.width / 2;
  const candidates = [0, centerX, rightEdgeX];

  if (context.margins) {
    candidates.push(
      context.margins.left,
      context.pageWidth - context.margins.right - rect.width,
    );
  }

  return candidates.filter((value) => Number.isFinite(value));
}

function buildVerticalSnapCandidates(
  rect: PdfRect,
  context: WriterSnapContext): number[] {
  const topEdgeY = context.pageHeight - rect.height;
  const centerY = context.pageHeight / 2 - rect.height / 2;
  const candidates = [0, centerY, topEdgeY];

  if (context.margins) {
    candidates.push(
      context.margins.bottom,
      context.pageHeight - context.margins.top - rect.height,
    );
  }

  return candidates.filter((value) => Number.isFinite(value));
}

function nearestCandidate(
  value: number,
  candidates: number[],
  threshold: number,
): { value: number; snapped: boolean } {
  let best = value;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate);

    if (distance <= threshold && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return {
    value: best,
    snapped: best !== value,
  };
}
