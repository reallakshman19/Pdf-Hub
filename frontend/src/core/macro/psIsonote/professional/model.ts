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

export interface VectorArrow {
  type: 'arrow';
  start: Point;
  end: Point;
  color: string;
  width: number;
  headStyle: 'filled-triangle' | 'open' | 'dot' | 'none';
  headSize?: number;
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

export type VectorPrimitive = VectorRectangle | VectorLine | VectorArrow | VectorCircle | VectorText;

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
 * Creates an authoritative engineering CAD style contract.
 * Normal and review results use rigorous Acrobat / CAD drafting standards:
 * - Solid 100% white masking background (#ffffff)
 * - Sharp architectural square corners (cornerRadius 0)
 * - Deep black / jet slate borders and typography (#000000 / #0f172a)
 */
export function getStyleContract(isReview = false, fontSize = 10): StyleContract {
  if (isReview) {
    return {
      version: 'v1',
      isReview: true,
      backgroundColor: '#ffffff', // Solid white masking background
      textColor: '#0f172a',       // Jet slate engineering typography
      borderColor: '#b91c1c',     // Crisp architectural crimson accent for review state
      leaderColor: '#b91c1c',
      fontSize,
      fontFamily: 'Helvetica',
      borderWidth: 1.0,           // Clear precise 1.0pt review weight
      cornerRadius: 0,            // Square engineering corners
    };
  }
  return {
    version: 'v1',
    isReview: false,
    backgroundColor: '#ffffff', // Solid white masking background
    textColor: '#0f172a',       // Jet slate engineering typography
    borderColor: '#000000',     // Solid CAD black ruled box
    leaderColor: '#000000',     // Solid CAD black leader line
    fontSize,
    fontFamily: 'Helvetica',
    borderWidth: 0.75,          // 0.75pt (0.25mm) standard CAD line weight
    cornerRadius: 0,            // Square engineering corners
  };
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }

  return value;
}
