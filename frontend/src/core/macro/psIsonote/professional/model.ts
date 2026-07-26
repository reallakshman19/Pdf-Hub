export interface PdfPoint {
  x: number;
  y: number;
}

/**
 * PDF.js-style page rectangle. The origin is the top-left of the displayed page.
 * Rendering adapters are responsible for converting to the PDF bottom-left origin.
 */
export interface PdfRect extends PdfPoint {
  width: number;
  height: number;
}

export type PsIsonoteLayoutQuality = 'clean' | 'review' | 'unplaceable' | 'manual';

export interface PsIsonoteCalloutIdentity {
  psNo: string;
  pageNumber: number;
  mappingHash: string;
  occurrenceId: string;
}

export interface PsIsonoteCalloutContent {
  psNo: string;
  isonote: string;
  family?: string;
  statusLabel?: string;
}

export interface PsIsonoteLeaderPath {
  /** Ordered from the callout box attachment point to the drawing anchor. */
  points: PdfPoint[];
  anchorRadius: number;
}

export interface PsIsonoteProfessionalStyle {
  styleVersion: string;
  paddingX: number;
  paddingY: number;
  headerFontSize: number;
  noteFontSize: number;
  secondaryFontSize: number;
  lineHeight: number;
  minimumWidth: number;
  preferredWidth: number;
  maximumWidth: number;
  backgroundColor: string;
  backgroundOpacity: number;
  borderColor: string;
  reviewBorderColor: string;
  borderWidth: number;
  textColor: string;
  secondaryTextColor: string;
  leaderColor: string;
  reviewLeaderColor: string;
  leaderWidth: number;
  anchorRadius: number;
}

export const DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE: Readonly<PsIsonoteProfessionalStyle> = {
  styleVersion: 'professional-v1',
  paddingX: 6,
  paddingY: 5,
  headerFontSize: 8.5,
  noteFontSize: 7.5,
  secondaryFontSize: 6.5,
  lineHeight: 1.2,
  minimumWidth: 135,
  preferredWidth: 180,
  maximumWidth: 220,
  backgroundColor: '#FFFFFF',
  backgroundOpacity: 0.96,
  borderColor: '#475569',
  reviewBorderColor: '#C2410C',
  borderWidth: 0.6,
  textColor: '#0F172A',
  secondaryTextColor: '#475569',
  leaderColor: '#475569',
  reviewLeaderColor: '#C2410C',
  leaderWidth: 0.6,
  anchorRadius: 2.5,
};

export interface PsIsonotePlannedCallout extends PsIsonoteCalloutIdentity {
  content: PsIsonoteCalloutContent;
  box: PdfRect;
  anchor: PdfPoint;
  leader: PsIsonoteLeaderPath;
  quality: PsIsonoteLayoutQuality;
  diagnostics: string[];
  score: number;
  styleVersion: string;
  layoutHash?: string;
}

export interface TextMetricsProvider {
  widthOfText(text: string, fontSize: number, weight: 'regular' | 'bold'): number;
}

export interface VectorRectanglePrimitive {
  type: 'rectangle';
  rect: PdfRect;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
}

export interface VectorLinePrimitive {
  type: 'line';
  from: PdfPoint;
  to: PdfPoint;
  color: string;
  width: number;
}

export interface VectorCirclePrimitive {
  type: 'circle';
  center: PdfPoint;
  radius: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string;
}

export interface VectorTextPrimitive {
  type: 'text';
  position: PdfPoint;
  text: string;
  fontSize: number;
  weight: 'regular' | 'bold';
  color: string;
  maxWidth: number;
}

export type PsIsonoteVectorPrimitive =
  | VectorRectanglePrimitive
  | VectorLinePrimitive
  | VectorCirclePrimitive
  | VectorTextPrimitive;

export interface PsIsonoteVectorRenderPlan {
  pageNumber: number;
  identity: PsIsonoteCalloutIdentity;
  bounds: PdfRect;
  primitives: PsIsonoteVectorPrimitive[];
  visibleText: string[];
  styleVersion: string;
}
