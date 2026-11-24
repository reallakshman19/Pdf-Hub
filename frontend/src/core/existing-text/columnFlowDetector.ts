/**
 * Multi-Column Layout Detector.
 * Identifies column bands, gutters, reading orders, and baseline geometries across page spans.
 * Pure TypeScript, fail-closed (INV-4 compliant).
 */

import type { ExistingTextSpan } from './types';
import type { MultiColumnLayout, TextColumnBoundary } from './columnFlowTypes';

const MIN_COLUMN_GUTTER_PT = 12.0;
const MIN_COLUMN_WIDTH_PT = 60.0;
const LINE_Y_TOLERANCE_PT = 3.0;

interface IntermediateSpanLine {
  y: number;
  minX: number;
  maxX: number;
  spans: ExistingTextSpan[];
}

export function detectMultiColumnLayoutFromSpans(
  spans: readonly ExistingTextSpan[],
  pageIndex: number,
  pageId: string,
): MultiColumnLayout | null {
  if (spans.length < 4) {
    return null;
  }

  // Filter to horizontal text only
  const horizontalSpans = spans.filter(
    (s) => Math.abs(s.rotationDegrees ?? 0) <= 0.5,
  );
  if (horizontalSpans.length < 4) {
    return null;
  }

  // 1. Group spans into visual lines by Y coordinate
  const lines: IntermediateSpanLine[] = [];
  const sorted = [...horizontalSpans].sort((a, b) => b.originPt.y - a.originPt.y);

  for (const span of sorted) {
    const existingLine = lines.find(
      (l) => Math.abs(l.y - span.originPt.y) <= LINE_Y_TOLERANCE_PT,
    );
    const spanRight = span.originPt.x + span.advanceWidthPt;
    if (existingLine) {
      existingLine.spans.push(span);
      existingLine.minX = Math.min(existingLine.minX, span.originPt.x);
      existingLine.maxX = Math.max(existingLine.maxX, spanRight);
    } else {
      lines.push({
        y: span.originPt.y,
        minX: span.originPt.x,
        maxX: spanRight,
        spans: [span],
      });
    }
  }

  // 2. Discover distinct column clusters along the X axis
  // Collect all span start X coordinates and widths
  const spanBoxes = horizontalSpans.map((s) => ({
    left: s.originPt.x,
    right: s.originPt.x + s.advanceWidthPt,
    top: s.originPt.y + s.sourceHeightPt,
    bottom: s.originPt.y,
    span: s,
  }));

  // Sort by left edge
  spanBoxes.sort((a, b) => a.left - b.left);

  // Cluster spans into horizontal column bands
  interface ColumnCluster {
    spans: ExistingTextSpan[];
    left: number;
    right: number;
    top: number;
    bottom: number;
  }

  const clusters: ColumnCluster[] = [];

  for (const box of spanBoxes) {
    let matchedCluster: ColumnCluster | null = null;
    for (const cluster of clusters) {
      // If this box overlaps or is very close (< MIN_COLUMN_GUTTER_PT) to the cluster's X-range
      const overlapsX =
        box.left <= cluster.right + 2 && box.right >= cluster.left - 2;
      const isWithinCluster =
        Math.abs(box.left - cluster.left) <= 30 || overlapsX;

      if (isWithinCluster) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.spans.push(box.span);
      matchedCluster.left = Math.min(matchedCluster.left, box.left);
      matchedCluster.right = Math.max(matchedCluster.right, box.right);
      matchedCluster.top = Math.max(matchedCluster.top, box.top);
      matchedCluster.bottom = Math.min(matchedCluster.bottom, box.bottom);
    } else {
      clusters.push({
        spans: [box.span],
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      });
    }
  }

  // Filter out tiny noise clusters (< 2 spans or width < MIN_COLUMN_WIDTH_PT)
  const validClusters = clusters
    .filter(
      (c) =>
        c.spans.length >= 2 &&
        c.right - c.left >= MIN_COLUMN_WIDTH_PT,
    )
    .sort((a, b) => a.left - b.left);

  if (validClusters.length < 2) {
    return null;
  }

  // Verify that adjacent clusters have a valid positive gutter
  const columns: TextColumnBoundary[] = [];
  for (let i = 0; i < validClusters.length; i++) {
    const curr = validClusters[i];
    const next = validClusters[i + 1];
    const gutterRightPt = next ? Math.max(0, next.left - curr.right) : 0;

    if (next && gutterRightPt < MIN_COLUMN_GUTTER_PT) {
      // Overlapping or gutter too narrow — not a distinct multi-column layout
      return null;
    }

    // Collect and sort baselines top-to-bottom (descending Y in PDF coordinates)
    const baselineSet = new Set<number>();
    for (const s of curr.spans) {
      const rounded = Math.round(s.originPt.y * 10) / 10;
      baselineSet.add(rounded);
    }
    const baselines = Array.from(baselineSet).sort((a, b) => b - a);

    // Compute average leading
    let totalLeading = 0;
    let leadingCount = 0;
    for (let j = 0; j < baselines.length - 1; j++) {
      const diff = baselines[j] - baselines[j + 1];
      if (diff > 5 && diff < 50) {
        totalLeading += diff;
        leadingCount++;
      }
    }

    const avgLeading =
      leadingCount > 0 ? totalLeading / leadingCount : (curr.spans[0]?.fontSizePt ?? 12) * 1.2;

    const heightPt = Math.max(20, curr.top - curr.bottom);
    const maxLines = Math.max(baselines.length, Math.floor(heightPt / avgLeading));

    columns.push({
      columnIndex: i,
      leftPt: curr.left,
      topPt: curr.top,
      widthPt: curr.right - curr.left,
      heightPt,
      gutterRightPt,
      maxLines,
      baselineYsPt: baselines,
    });
  }

  // Derive dominant font size and font name
  const firstSpan = horizontalSpans[0];
  const fontSizePt = firstSpan?.fontSizePt ?? 12;
  const fontName = firstSpan?.fontName;

  // Average leading across columns
  let totalLeading = 0;
  for (const col of columns) {
    const colLeading =
      col.baselineYsPt.length > 1
        ? (col.baselineYsPt[0] - col.baselineYsPt[col.baselineYsPt.length - 1]) /
          (col.baselineYsPt.length - 1)
        : fontSizePt * 1.2;
    totalLeading += colLeading;
  }
  const averageLeadingPt = totalLeading / columns.length;

  return {
    pageIndex,
    pageId,
    columnCount: columns.length,
    columns,
    readingOrder: columns.map((c) => c.columnIndex),
    averageLeadingPt,
    fontSizePt,
    fontName,
  };
}
