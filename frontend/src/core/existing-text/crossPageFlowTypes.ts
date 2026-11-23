/**
 * Cross-Page Paragraph & Multi-Column Flow Domain Types.
 * Pure TypeScript (INV-4 compliant: zero external library imports).
 */

import type { ExistingTextStyleOverride } from './types';
import type { MultiColumnLayout, ColumnFlowSegment } from './columnFlowTypes';

export interface CrossPageFlowIntent {
  schemaVersion: 1;
  sourceRevisionId: string;
  sourcePageIndex: number;
  sourcePageId: string;
  targetPageIndex: number;
  targetPageId: string;
  sourceLayout: MultiColumnLayout;
  targetLayout: MultiColumnLayout;
  text: string;
  originalText?: string;
  styleOverride?: ExistingTextStyleOverride;
  headerExclusionTopPt?: number;
  footerExclusionBottomPt?: number;
  overflowPolicy?: 'spillover' | 'fail-closed';
}

export interface CrossPageFlowResult {
  success: boolean;
  sourcePageIndex: number;
  targetPageIndex: number;
  bytesModified: boolean;
  sourceSegments: ColumnFlowSegment[];
  targetSegments: ColumnFlowSegment[];
  sourceLinesEmitted: number;
  targetLinesEmitted: number;
  totalLinesEmitted: number;
  overflowsTargetLayout: boolean;
  spillOverText?: string;
  warning?: string;
}
