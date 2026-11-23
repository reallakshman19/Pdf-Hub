import type { PdfRect } from '../../writer-v2/types';
import type {
  OcrLine,
  OcrTableBlock,
  OcrTableCell,
  OcrTableRow,
  OcrWord,
} from '../types';

export interface DetectOcrTablesInput {
  words: OcrWord[];
  lines?: OcrLine[];
  pageWidth: number;
  pageHeight: number;
  pageIndex?: number;
  minRows?: number;
  minColumns?: number;
  minGutterWidth?: number;
  /**
   * Coordinate origin of the input bounding boxes.
   * - 'bottom-left' (default): Standard PDF user space (Y increases upwards; top of page has highest Y).
   * - 'top-left': Screen / raster canvas space (Y increases downwards; top of page has Y=0).
   */
  coordinateOrigin?: 'bottom-left' | 'top-left';
}

interface RowCandidate {
  yMin: number;
  yMax: number;
  height: number;
  words: OcrWord[];
}

interface ColumnBoundary {
  xMin: number;
  xMax: number;
}

/**
 * Pure client-side table structure detector.
 * Analyzes word geometry, line heights, and horizontal alignment gutters to reconstruct
 * structured 2D table matrices (OcrTableBlock) without server or external model dependencies.
 */
export function detectOcrTables(input: DetectOcrTablesInput): OcrTableBlock[] {
  const {
    words,
    pageIndex = 0,
    minRows = 2,
    minColumns = 2,
    minGutterWidth = 12,
    coordinateOrigin = 'bottom-left',
  } = input;

  if (words.length < minRows * minColumns) {
    return [];
  }

  // 1. Group words into horizontal row bands based on vertical overlap
  const rows = clusterWordsIntoRows(words, coordinateOrigin);
  if (rows.length < minRows) {
    return [];
  }

  // 2. Identify potential table clusters among consecutive rows
  const tableClusters = findTableClusters(rows, minRows);
  if (tableClusters.length === 0) {
    return [];
  }

  const detectedTables: OcrTableBlock[] = [];

  for (let clusterIndex = 0; clusterIndex < tableClusters.length; clusterIndex++) {
    const clusterRows = tableClusters[clusterIndex];

    // 3. Find column boundaries by detecting vertical gutters (whitespace strips)
    // that run cleanly through all rows without cutting through any word.
    const columns = detectColumnBoundaries(clusterRows, minGutterWidth);
    if (columns.length < minColumns) {
      continue;
    }

    // 4. Construct structured OcrTableRow and OcrTableCell matrix
    const tableBlock = buildTableBlock({
      clusterRows,
      columns,
      pageIndex,
      tableIndex: clusterIndex,
    });

    if (tableBlock && tableBlock.rows.length >= minRows) {
      detectedTables.push(tableBlock);
    }
  }

  return detectedTables;
}

/**
 * Clusters words into horizontal rows based on vertical coordinate overlap.
 */
function clusterWordsIntoRows(
  words: OcrWord[],
  coordinateOrigin: 'bottom-left' | 'top-left' = 'bottom-left',
): RowCandidate[] {
  // Sort words vertically (top-to-bottom, then left-to-right)
  const isTopLeft = coordinateOrigin === 'top-left';
  const sorted = [...words].sort((a, b) => {
    const diffY = isTopLeft ? a.bbox.y - b.bbox.y : b.bbox.y - a.bbox.y;
    if (Math.abs(diffY) > 3) return diffY;
    return a.bbox.x - b.bbox.x;
  });

  const rowBuckets: RowCandidate[] = [];

  for (const word of sorted) {
    const wordYMin = word.bbox.y;
    const wordYMax = word.bbox.y + word.bbox.height;
    const wordHeight = Math.max(1, word.bbox.height);

    let placed = false;
    for (const row of rowBuckets) {
      // Calculate vertical overlap between word and row candidate
      const overlapMin = Math.max(wordYMin, row.yMin);
      const overlapMax = Math.min(wordYMax, row.yMax);
      const overlapHeight = Math.max(0, overlapMax - overlapMin);

      // If overlap is at least 40% of the word height, group together
      if (overlapHeight / wordHeight >= 0.4) {
        row.words.push(word);
        row.yMin = Math.min(row.yMin, wordYMin);
        row.yMax = Math.max(row.yMax, wordYMax);
        row.height = row.yMax - row.yMin;
        placed = true;
        break;
      }
    }

    if (!placed) {
      rowBuckets.push({
        yMin: wordYMin,
        yMax: wordYMax,
        height: wordHeight,
        words: [word],
      });
    }
  }

  // Ensure words within each row are sorted left-to-right
  for (const row of rowBuckets) {
    row.words.sort((a, b) => a.bbox.x - b.bbox.x);
  }

  return rowBuckets.sort((a, b) => (isTopLeft ? a.yMin - b.yMin : b.yMin - a.yMin));
}

/**
 * Finds groups of consecutive rows that have multiple words.
 */
function findTableClusters(rows: RowCandidate[], minRows: number): RowCandidate[][] {
  const clusters: RowCandidate[][] = [];
  let currentCluster: RowCandidate[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Rows in a table cluster should generally have at least 2 words, or be flanked by multi-word rows
    const isMultiWordRow = row.words.length >= 2;

    if (isMultiWordRow) {
      currentCluster.push(row);
    } else {
      if (currentCluster.length >= minRows) {
        clusters.push(currentCluster);
      }
      currentCluster = [];
    }
  }

  if (currentCluster.length >= minRows) {
    clusters.push(currentCluster);
  }

  return clusters;
}

/**
 * Detects vertical column gutters (whitespace gaps that are not intersected by words in any row).
 */
function detectColumnBoundaries(rows: RowCandidate[], minGutterWidth: number): ColumnBoundary[] {
  // Collect all word bounding x ranges across the table
  const allWords = rows.flatMap((r) => r.words);
  if (allWords.length === 0) return [];

  const tableXMin = Math.min(...allWords.map((w) => w.bbox.x));
  const tableXMax = Math.max(...allWords.map((w) => w.bbox.x + w.bbox.width));

  if (tableXMax - tableXMin <= minGutterWidth) return [];

  // Find candidate vertical gutters across the entire table width:
  // A vertical gutter [gStart, gEnd] is a region where NO row has any word intersecting [gStart, gEnd].
  const candidateSplitPoints: number[] = [];

  for (const word of allWords) {
    const afterWordX = word.bbox.x + word.bbox.width;
    if (afterWordX >= tableXMax - minGutterWidth) continue;

    // Check if there is an empty gap starting around afterWordX
    // Find the closest word start in all rows that is >= afterWordX
    const wordsToRight = allWords.filter((w) => w.bbox.x >= afterWordX - 2);
    if (wordsToRight.length === 0) continue;

    const nextWordX = Math.min(...wordsToRight.map((w) => w.bbox.x));
    const gapWidth = nextWordX - afterWordX;

    if (gapWidth >= minGutterWidth) {
      const gutterMid = (afterWordX + nextWordX) / 2;

      // Verify that NO word in ANY row intersects this gutter midpoint
      const cutsWord = allWords.some((w) =>
        gutterMid > w.bbox.x + 1 && gutterMid < (w.bbox.x + w.bbox.width - 1),
      );

      if (!cutsWord && !candidateSplitPoints.some((p) => Math.abs(p - gutterMid) < minGutterWidth)) {
        // Also verify that at least one row has words on BOTH sides of this gutter
        const hasWordsOnBothSides = rows.some((r) =>
          r.words.some((w) => w.bbox.x + w.bbox.width <= gutterMid) &&
          r.words.some((w) => w.bbox.x >= gutterMid),
        );

        if (hasWordsOnBothSides) {
          candidateSplitPoints.push(gutterMid);
        }
      }
    }
  }

  candidateSplitPoints.sort((a, b) => a - b);

  if (candidateSplitPoints.length === 0) {
    return [];
  }

  // Construct column intervals between split points
  const columns: ColumnBoundary[] = [];
  let currentXMin = tableXMin;

  for (const splitPoint of candidateSplitPoints) {
    columns.push({
      xMin: currentXMin,
      xMax: splitPoint,
    });
    currentXMin = splitPoint;
  }

  // Final column from last splitPoint to tableXMax
  columns.push({
    xMin: currentXMin,
    xMax: tableXMax,
  });

  return columns;
}

/**
 * Synthesizes a structured OcrTableBlock with rows and cells from detected geometry.
 */
function buildTableBlock(input: {
  clusterRows: RowCandidate[];
  columns: ColumnBoundary[];
  pageIndex: number;
  tableIndex: number;
}): OcrTableBlock | null {
  const { clusterRows, columns, pageIndex, tableIndex } = input;

  const tableRows: OcrTableRow[] = [];
  let tableConfidenceSum = 0;
  let tableConfidenceCount = 0;

  let overallXMin = Infinity;
  let overallYMin = Infinity;
  let overallXMax = -Infinity;
  let overallYMax = -Infinity;

  for (let rIndex = 0; rIndex < clusterRows.length; rIndex++) {
    const rowCandidate = clusterRows[rIndex];
    const cells: OcrTableCell[] = [];

    overallYMin = Math.min(overallYMin, rowCandidate.yMin);
    overallYMax = Math.max(overallYMax, rowCandidate.yMax);

    for (let cIndex = 0; cIndex < columns.length; cIndex++) {
      const col = columns[cIndex];
      overallXMin = Math.min(overallXMin, col.xMin);
      overallXMax = Math.max(overallXMax, col.xMax);

      // Find words in this row whose center point falls within this column interval
      const cellWords = rowCandidate.words.filter((word) => {
        const wordCenter = word.bbox.x + word.bbox.width / 2;
        return wordCenter >= col.xMin && wordCenter < col.xMax;
      });

      cellWords.sort((a, b) => a.bbox.x - b.bbox.x);
      const text = cellWords.map((w) => w.text).join(' ').trim();

      const confidences = cellWords.map((w) => w.confidence).filter((c) => c > 0);
      const cellConfidence = confidences.length > 0
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : (text.length > 0 ? 80 : 0);

      if (confidences.length > 0) {
        tableConfidenceSum += cellConfidence;
        tableConfidenceCount++;
      }

      const cellBbox: PdfRect = {
        x: Math.round(col.xMin * 10) / 10,
        y: Math.round(rowCandidate.yMin * 10) / 10,
        width: Math.round((col.xMax - col.xMin) * 10) / 10,
        height: Math.round((rowCandidate.yMax - rowCandidate.yMin) * 10) / 10,
      };

      cells.push({
        id: `ocr-cell-${pageIndex}-${tableIndex}-${rIndex + 1}-${cIndex + 1}`,
        text,
        confidence: cellConfidence,
        bbox: cellBbox,
        rowSpan: 1,
        colSpan: 1,
      });
    }

    tableRows.push({
      id: `ocr-row-${pageIndex}-${tableIndex}-${rIndex + 1}`,
      cells,
    });
  }

  const tableBbox: PdfRect = {
    x: Math.round(overallXMin * 10) / 10,
    y: Math.round(overallYMin * 10) / 10,
    width: Math.round((overallXMax - overallXMin) * 10) / 10,
    height: Math.round((overallYMax - overallYMin) * 10) / 10,
  };

  const tableConfidence = tableConfidenceCount > 0
    ? Math.round(tableConfidenceSum / tableConfidenceCount)
    : 85;

  return {
    id: `ocr-table-${pageIndex}-${tableIndex + 1}`,
    pageIndex,
    type: 'table',
    bbox: tableBbox,
    rect: tableBbox,
    confidence: tableConfidence,
    rows: tableRows,
    text: tableRows.map((r) => r.cells.map((c) => c.text).join('\t')).join('\n'),
  };
}
