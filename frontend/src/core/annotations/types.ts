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

export type NativeInteropFidelityClass =
  | 'NATIVE_SUPPORTED'
  | 'NATIVE_PRESERVED_READ_ONLY'
  | 'MUTATED_USER_EDIT'
  | 'NATIVE_DEGRADED'
  | 'VISUAL_ONLY'
  | 'UNKNOWN';

export interface AnnotationNativeInteropState {
  fidelityClass: NativeInteropFidelityClass;
  reason?: 'RICH_TEXT' | 'USER_EDITED';
  /** Native /RC rich-text semantics are present and must not be flattened silently. */
  richText?: boolean;
  /** FreeText /DS default style is present and preserved with /RC. */
  defaultStyle?: boolean;
  /** Native semantics observed at import time; used as a writer fail-closed oracle. */
  protectedSnapshot?: {
    type: AnnotationType;
    text: string;
    content?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    fontFamily?: string;
    textColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    lineHeight?: number;
    autoSize?: boolean;
  };
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
  nativeStampAppearanceKind?: 'generated' | 'imported';
  /** Page rotation against which generated artwork was laid out. */
  nativeStampBasisRotation?: number;
  /** Session-only basis of the original source of a copied generated stamp. */
  nativeStampCopySourceBasisRotation?: number;

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
  nativeInterop?: AnnotationNativeInteropState;
  /** Page-scoped native /NM when the application ID was disambiguated. */
  nativeOriginalName?: string;
  /** A same-page /NM collision cannot be safely addressed by name alone. */
  nativeIdentityAmbiguous?: boolean;
  /** Original object reference for unnamed native annotations in this revision. */
  nativeSourceRef?: string;
  /** Explicitly removed native reply identities; other opaque replies stay intact. */
  nativeDeletedReplyIds?: string[];
  /** Ephemeral PDF.js identity for the native appearance in the loaded revision. */
  nativeAppearanceRef?: string;
  nativeAppearanceRotation?: number;
  nativeAppearancePageRotation?: number;
  /** Ephemeral source validation for native square/circle appearance rotation. */
  nativeBoxShapeImported?: boolean;
  nativeBoxShapeHasAppearance?: boolean;
  nativeBoxShapeSourceHash?: string;
  nativeBoxShapeTurn?: { turns: number; sourceHash?: string };
  /** Derived from verified source AP; never trust persisted sidecar values. */
  nativeBoxShapeGenerated?: boolean;
  nativeBoxShapeGeneratedOrientation?: number;
  /** Ephemeral capability derived from the current native markup appearance. */
  nativeMarkupRotationSourceHash?: string;
  nativeMarkupTurn?: { turns: number; sourceHash: string };
  /** Verified quarter-turn offset relative to the page for a saved markup. */
  nativeMarkupPreviewOffset?: number;
  /** Rotation needed to retain a copied text annotation's visual orientation. */
  nativeOrientationAdjustment?: number;
  /** Origin used to clone native appearance and popup graphs within a PDF. */
  nativeCopySource?: { pageNumber: number; nativeName: string; ambiguous?: boolean; requiresSource?: boolean };
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
  nativeAppearanceUrl?: string;
  onSelect: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTransformStart: (e: React.PointerEvent<HTMLDivElement>, mode: 'move' | 'resize') => void;
  onDoubleClick?: () => void;
  onCommitEdit?: (value: string) => void;
}
