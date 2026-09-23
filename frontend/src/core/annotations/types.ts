import type { ReviewMetadata } from '../review/types';
import type { PageId } from '../pages/types';
export type { ReviewStatus } from '../review/types';

import type { AnnotationType } from './annotationTypes';
export type { AnnotationType } from './annotationTypes';


export interface AnnotationStyle {
  stroke?: string;
  fill?: string;
  textColor?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface AnnotationData extends Record<string, unknown> {
  // ── text ──────────────────────────────────────────────
  text?: string;
  title?: string;
  content?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  lineHeight?: number;
  autoSize?: boolean;

  // ── appearance ────────────────────────────────────────
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderRadius?: number;
  opacity?: number;

  // ── leader / callout ─────────────────────────────────
  anchor?: Point2D;
  knee?: Point2D;
  leaderStyle?: 'straight' | 'elbow';
  arrowHead?: 'open' | 'filled' | 'none';

  // ── line end styles ───────────────────────────────────
  lineStartCap?: 'none' | 'arrow' | 'circle' | 'square';
  lineEndCap?: 'none' | 'arrow' | 'circle' | 'square';

  // ── ink / polygon / text markup ───────────────────────
  paths?: Array<number[]>;
  points?: number[];
  /**
   * Text-markup quadrilateral x/y pairs normalized to the annotation Rect.
   * Values preserve native multi-quad geometry while remaining portable across
   * local translation/resizing. Eight numbers represent one quadrilateral.
   */
  textMarkupQuads?: number[];

  // ── stamp ─────────────────────────────────────────────
  stampLabel?: string;
  stampImageDataUrl?: string;
  stampStyle?: 'approved' | 'rejected' | 'draft' | 'confidential' | 'custom';

  // ── sticky note ───────────────────────────────────────
  isCollapsed?: boolean;
  author?: string;

  // ── meta ──────────────────────────────────────────────
  locked?: boolean;
  zIndex?: number;
  rotation?: number;
  review?: ReviewMetadata;
  style?: AnnotationStyle;
  geometryVersion?: number;
  normalizedGeometry?: unknown;
}

export interface PdfAnnotation {
  id: string;
  type: AnnotationType;
  /**
   * Canonical page identity for PDF-backed sessions.
   *
   * Optional during migration so legacy persisted/native annotations can be
   * hydrated by pageNumber and upgraded at the session boundary.
   */
  pageId?: PageId;
  /**
   * One-based compatibility/render position derived from PageGraph when pageId
   * is available. Do not treat this as persistent identity.
   */
  pageNumber: number;
  rect: Rect;
  data: AnnotationData;
  createdAt: number;
  updatedAt: number;
}


export interface AnnotationNodeProps<T extends AnnotationType = AnnotationType> {
  annotation: PdfAnnotation & { type: T };
  rect: Rect;
  scale: number;
  isSelected: boolean;
  isEditing?: boolean;
  editingValue?: string;
  pageRotation?: number;
  onSelect: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTransformStart: (e: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize') => void;
  onDoubleClick?: () => void;
  onCommitEdit?: (value: string) => void;
}
