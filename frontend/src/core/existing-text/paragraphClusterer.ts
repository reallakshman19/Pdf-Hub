import type { ExistingTextSpan } from './types';
import type {
  ExistingTextParagraphBlock,
  ExistingTextParagraphLine,
} from './paragraphTypes';
import type { ExistingTextFitRect } from './fitTypes';
import type { DetectedTableGrid } from './tableCellTypes';
import { detectTableGridsForPage, findTableCellForSpan } from './tableCellDetector';

export function clusterPageSpansIntoParagraphs(
  pageSpans: readonly ExistingTextSpan[],
  detectedTables?: readonly DetectedTableGrid[],
): ExistingTextParagraphBlock[] {
  if (pageSpans.length === 0) return [];

  const eligibleSpans = pageSpans.filter(
    (s) => s.editability !== 'unsupported' && s.text.trim().length > 0,
  );

  if (eligibleSpans.length === 0) return [];

  const tableGrids = detectedTables ?? detectTableGridsForPage(eligibleSpans);

  // Sort top-to-bottom (descending y in PDF user space), then left-to-right (ascending x)
  const sorted = [...eligibleSpans].sort((a, b) => {
    const dy = b.originPt.y - a.originPt.y;
    if (Math.abs(dy) > 2) return dy;
    return a.originPt.x - b.originPt.x;
  });

  const clusters: ExistingTextSpan[][] = [];

  for (const span of sorted) {
    let added = false;
    for (const cluster of clusters) {
      const lastSpan = cluster[cluster.length - 1];
      if (canSpansBelongToSameParagraph(lastSpan, span, tableGrids)) {
        cluster.push(span);
        added = true;
        break;
      }
    }
    if (!added) {
      clusters.push([span]);
    }
  }

  return clusters.map((cluster, index) => buildParagraphBlock(cluster, index));
}

export function findParagraphForSpan(
  targetSpan: ExistingTextSpan,
  allPageSpans: readonly ExistingTextSpan[],
): ExistingTextParagraphBlock {
  const paragraphs = clusterPageSpansIntoParagraphs(allPageSpans);
  const found = paragraphs.find((p) =>
    p.lines.some((l) => l.span.id === targetSpan.id || l.span.sourceIndex === targetSpan.sourceIndex),
  );

  if (found) {
    return found;
  }

  // Fallback: single-line paragraph
  return buildParagraphBlock([targetSpan], 0);
}

function canSpansBelongToSameParagraph(
  prev: ExistingTextSpan,
  curr: ExistingTextSpan,
  tableGrids?: readonly DetectedTableGrid[],
): boolean {
  if (prev.pageIndex !== curr.pageIndex) return false;

  // 0. Table cell boundary isolation: spans in different table cells/rows cannot cluster
  if (tableGrids && tableGrids.length > 0) {
    const prevCell = findTableCellForSpan(prev, tableGrids);
    const currCell = findTableCellForSpan(curr, tableGrids);
    if (prevCell || currCell) {
      if (!prevCell || !currCell) return false;
      if (prevCell.tableId !== currCell.tableId) return false;
      if (prevCell.rowIndex !== currCell.rowIndex) return false;
      if (prevCell.columnIndex !== currCell.columnIndex) return false;
    }
  }

  // 1. Font size consistency (within 1pt)
  if (Math.abs(prev.fontSizePt - curr.fontSizePt) > 1.0) {
    return false;
  }

  // 2. Font family / name consistency if available
  if (prev.fontName && curr.fontName && prev.fontName !== curr.fontName) {
    return false;
  }

  // 3. Vertical baseline displacement (curr must be strictly below prev in PDF user space)
  const deltaY = prev.originPt.y - curr.originPt.y;
  const avgFontSize = (prev.fontSizePt + curr.fontSizePt) / 2;

  // Typical leading is 1.0x to 1.8x font size. Allow 0.7x to 2.2x to handle loose or tight typography
  if (deltaY < avgFontSize * 0.7 || deltaY > avgFontSize * 2.5) {
    return false;
  }

  // 4. Horizontal alignment or column overlap
  const prevRight = prev.originPt.x + prev.advanceWidthPt;
  const currRight = curr.originPt.x + curr.advanceWidthPt;

  // Left-aligned margin check (within 2 ems) OR horizontal overlap
  const leftDiff = Math.abs(prev.originPt.x - curr.originPt.x);
  const isLeftAligned = leftDiff < avgFontSize * 2.5;

  const hasHorizontalOverlap =
    Math.max(prev.originPt.x, curr.originPt.x) < Math.min(prevRight, currRight);

  return isLeftAligned || hasHorizontalOverlap;
}

function buildParagraphBlock(
  spans: ExistingTextSpan[],
  clusterIndex: number,
): ExistingTextParagraphBlock {
  // Sort lines strictly top to bottom (descending y)
  const sortedSpans = [...spans].sort((a, b) => b.originPt.y - a.originPt.y);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxLineWidth = 0;

  const lines: ExistingTextParagraphLine[] = sortedSpans.map((span, lineIndex) => {
    const x = span.originPt.x;
    const y = span.originPt.y - span.sourceHeightPt * 0.2; // approx descender
    const width = Math.max(span.advanceWidthPt, 10);
    const height = Math.max(span.sourceHeightPt, span.fontSizePt);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    maxLineWidth = Math.max(maxLineWidth, width);

    const boundsPt: ExistingTextFitRect = {
      x,
      y,
      width,
      height,
    };

    return {
      span,
      lineIndex,
      text: span.text,
      baselinePt: {
        x: span.originPt.x,
        y: span.originPt.y,
      },
      boundsPt,
      advanceWidthPt: span.advanceWidthPt,
    };
  });

  const firstSpan = sortedSpans[0];
  const fontSizePt = firstSpan.fontSizePt;

  // Calculate average leading
  let leadingPt = fontSizePt * 1.2;
  if (lines.length > 1) {
    let totalDeltaY = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      totalDeltaY += lines[i].baselinePt.y - lines[i + 1].baselinePt.y;
    }
    leadingPt = Math.max(fontSizePt, totalDeltaY / (lines.length - 1));
  }

  const boundsPt: ExistingTextFitRect = {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 20),
    height: Math.max(maxY - minY, fontSizePt),
  };

  const fullText = lines.map((l) => l.text).join(' ');

  return {
    paragraphId: `p-${firstSpan.pageIndex}-${clusterIndex}-${firstSpan.sourceIndex}`,
    pageIndex: firstSpan.pageIndex,
    pageId: firstSpan.pageId,
    revisionId: firstSpan.revisionId,
    lines,
    boundsPt,
    fontSizePt,
    leadingPt,
    columnWidthPt: Math.max(maxLineWidth, boundsPt.width),
    fullText,
    fontName: firstSpan.fontName,
  };
}
