import type { ReviewMetadata } from '../review/types';

export type AnnotationType =
  | 'textbox'        // multiline, no leader
  | 'callout'        // textbox + 3-point leader (anchor → knee → box edge)
  | 'sticky-note'    // collapsible pushpin icon → expands to note
  | 'highlight'      // text-based, follows selection
  | 'underline'
  | 'strikeout'
  | 'squiggly'       // NEW — wavy red underline
  | 'shape-rect'     // was 'shape'
  | 'shape-ellipse'  // was 'ellipse'
  | 'shape-polygon'  // NEW — freeform polygon
  | 'shape-cloud'    // NEW — rect with wavy cloud border
  | 'line'
  | 'arrow'
  | 'ink'            // NEW — freehand polyline paths
  | 'stamp'          // text + custom image stamps
  | 'comment'
  | 'redaction';     // NEW — black out content

export type ReviewStatus = 'open' | 'resolved' | 'rejected';

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

  // ── ink / polygon ─────────────────────────────────────
  paths?: Array<number[]>;
  points?: number[];

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
  reviewStatus?: ReviewStatus;
  style?: AnnotationStyle;
}

export interface PdfAnnotation {
  id: string;
  type: AnnotationType;
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
  onSelect: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTransformStart: (e: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize') => void;
  onDoubleClick?: () => void;
  onCommitEdit?: (value: string) => void;
}
