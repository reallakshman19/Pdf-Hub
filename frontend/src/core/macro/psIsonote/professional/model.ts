export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StyleContract {
  version: 'v1';
  isReview: boolean;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  leaderColor: string;
  fontSize: number;
  fontFamily: string;
  borderWidth: number;
  cornerRadius: number;
}

export interface VectorRectangle {
  type: 'rectangle';
  rect: Rect;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  cornerRadius?: number;
}

export interface VectorLine {
  type: 'line';
  start: Point;
  end: Point;
  color: string;
  width: number;
  style?: 'solid' | 'dashed';
}

export interface VectorCircle {
  type: 'circle';
  center: Point;
  radius: number;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
}

export interface VectorText {
  type: 'text';
  position: Point;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  fontWeight?: 'normal' | 'bold';
}

export type VectorPrimitive = VectorRectangle | VectorLine | VectorCircle | VectorText;

export interface ProfessionalCalloutModel {
  id: string;
  psNo: string;
  tag: string;
  note: string;
  confidence: string;
  targetPoint: Point;
  box: Rect;
  style: StyleContract;
  primitives: VectorPrimitive[];
}

/**
 * Creates an engineering-oriented style contract.
 * Normal results use neutral professional styling (slate/navy on clean background).
 * Orange is strictly reserved for review-only states.
 */
export function getStyleContract(isReview = false, fontSize = 9): StyleContract {
  if (isReview) {
    return {
      version: 'v1',
      isReview: true,
      backgroundColor: '#fffaf0', // Orange review background
      textColor: '#9a3412',       // Orange review text
      borderColor: '#ea580c',     // Orange review border
      leaderColor: '#ea580c',
      fontSize,
      fontFamily: 'Helvetica, Arial, sans-serif',
      borderWidth: 1.5,
      cornerRadius: 3,
    };
  }
  return {
    version: 'v1',
    isReview: false,
    backgroundColor: '#ffffff', // Neutral background
    textColor: '#0f172a',       // Slate/navy engineering text
    borderColor: '#334155',     // Slate border
    leaderColor: '#475569',
    fontSize,
    fontFamily: 'Helvetica, Arial, sans-serif',
    borderWidth: 1,
    cornerRadius: 2,
  };
}
