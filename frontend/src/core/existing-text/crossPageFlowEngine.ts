/**
 * Cross-Page Text Flow Engine.
 * Reflows text across multi-column layouts on Page N, automatically spilling overflow lines into Page N+1.
 * Pure TypeScript (INV-4 compliant).
 */

import type {
  CrossPageFlowIntent,
  CrossPageFlowResult,
} from './crossPageFlowTypes';
import type {
  MultiColumnLayout,
  MultiColumnReflowOptions,
  TextColumnBoundary,
} from './columnFlowTypes';
import { reflowTextAcrossColumns } from './multiColumnReflowEngine';

export function clampColumnToExclusionZones(
  col: TextColumnBoundary,
  headerExclusionTopPt?: number,
  footerExclusionBottomPt?: number,
): TextColumnBoundary {
  let baselines = [...col.baselineYsPt];
  if (typeof headerExclusionTopPt === 'number') {
    baselines = baselines.filter((y) => y <= headerExclusionTopPt);
  }
  if (typeof footerExclusionBottomPt === 'number') {
    baselines = baselines.filter((y) => y >= footerExclusionBottomPt);
  }

  const effectiveTop = baselines.length > 0 ? Math.max(...baselines) : col.topPt;
  const effectiveBottom = baselines.length > 0 ? Math.min(...baselines) : col.topPt - col.heightPt;
  const heightPt = Math.max(10, effectiveTop - effectiveBottom);

  return {
    ...col,
    topPt: effectiveTop,
    heightPt,
    maxLines: Math.max(1, baselines.length),
    baselineYsPt: baselines,
  };
}

export function executeCrossPageFlow(
  intent: CrossPageFlowIntent,
  options?: MultiColumnReflowOptions,
): CrossPageFlowResult {
  const fontSizePt =
    intent.styleOverride?.fontSizePt ??
    options?.fontSizePt ??
    intent.sourceLayout.fontSizePt ??
    12;
  const leadingPt =
    options?.leadingPt ??
    intent.sourceLayout.averageLeadingPt ??
    fontSizePt * 1.2;

  const flowOptions: MultiColumnReflowOptions = {
    ...options,
    fontSizePt,
    leadingPt,
  };

  // 1. Reflow on Source Page N
  const sourceResult = reflowTextAcrossColumns(
    intent.text,
    intent.sourceLayout,
    flowOptions,
  );

  // If text fits entirely on source page
  if (!sourceResult.overflowsEntireLayout || !sourceResult.spillOverText) {
    return {
      success: true,
      sourcePageIndex: intent.sourcePageIndex,
      targetPageIndex: intent.targetPageIndex,
      bytesModified: true,
      sourceSegments: sourceResult.segments,
      targetSegments: [],
      sourceLinesEmitted: sourceResult.totalLines,
      targetLinesEmitted: 0,
      totalLinesEmitted: sourceResult.totalLines,
      overflowsTargetLayout: false,
    };
  }

  // If overflowPolicy is fail-closed, reject overcapacity
  if (intent.overflowPolicy === 'fail-closed') {
    throw new Error(
      `LAYOUT_CAPACITY_EXCEEDED: Source page layout capacity exceeded by ${
        sourceResult.spillOverText.split(/\s+/).length
      } words.`,
    );
  }

  // 2. Adjust target layout on Page N+1 for header/footer exclusion zones
  const adjustedTargetColumns = intent.targetLayout.columns.map((col) =>
    clampColumnToExclusionZones(
      col,
      intent.headerExclusionTopPt,
      intent.footerExclusionBottomPt,
    ),
  );

  const adjustedTargetLayout: MultiColumnLayout = {
    ...intent.targetLayout,
    columns: adjustedTargetColumns,
  };

  // 3. Reflow spillover text on Target Page N+1
  const targetResult = reflowTextAcrossColumns(
    sourceResult.spillOverText,
    adjustedTargetLayout,
    flowOptions,
  );

  return {
    success: true,
    sourcePageIndex: intent.sourcePageIndex,
    targetPageIndex: intent.targetPageIndex,
    bytesModified: true,
    sourceSegments: sourceResult.segments,
    targetSegments: targetResult.segments,
    sourceLinesEmitted: sourceResult.totalLines,
    targetLinesEmitted: targetResult.totalLines,
    totalLinesEmitted: sourceResult.totalLines + targetResult.totalLines,
    overflowsTargetLayout: targetResult.overflowsEntireLayout,
    spillOverText: targetResult.spillOverText,
    warning: targetResult.overflowsEntireLayout
      ? `Text exceeded capacity of both Page ${intent.sourcePageIndex + 1} and Page ${
          intent.targetPageIndex + 1
        }. Spillover unplaced: "${targetResult.spillOverText}".`
      : undefined,
  };
}
