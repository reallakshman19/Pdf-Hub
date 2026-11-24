/**
 * Interactive Text Frame Manipulation Domain Types.
 * Pure TypeScript (INV-4 compliant: zero external library imports).
 */

import type { PageId } from '@/core/pages/types';
import type { ExistingTextStyleOverride } from './types';
import type { ExistingTextAlign } from './alignmentTypes';

export interface FramePoint2D {
  x: number;
  y: number;
}

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExistingTextFrame {
  frameId: string;
  revisionId: string;
  pageIndex: number;
  pageId: PageId;
  bounds: FrameRect;
  originalBounds: FrameRect;
  text: string;
  originalText?: string;
  spanIds: string[];
  fontSizePt: number;
  leadingPt: number;
  fontName?: string;
  styleOverride?: ExistingTextStyleOverride;
  align?: ExistingTextAlign;
}

export interface MoveTextFrameIntent {
  schemaVersion: 1;
  sourceRevisionId: string;
  pageIndex: number;
  pageId: PageId;
  frame: ExistingTextFrame;
  targetPosition: FramePoint2D;
  backgroundColorHex?: string;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ResizeTextFrameIntent {
  schemaVersion: 1;
  sourceRevisionId: string;
  pageIndex: number;
  pageId: PageId;
  frame: ExistingTextFrame;
  newWidthPt: number;
  newHeightPt?: number;
  handle: ResizeHandle;
  reflowedText?: string;
  overflowPolicy?: 'spillover' | 'fail-closed';
  backgroundColorHex?: string;
}

export interface MarqueeSelectionIntent {
  pageIndex: number;
  bounds: FrameRect;
  selectedFrameIds: string[];
}

export interface MoveTextFrameResult {
  mutatedBytes: Uint8Array;
  newBounds: FrameRect;
}

export interface ResizeTextFrameResult {
  mutatedBytes: Uint8Array;
  newBounds: FrameRect;
  lines: string[];
}
