export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BoxPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export type CalloutConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type ConfidenceCode = 'H' | 'M' | 'L';
export type PdfFontId = 'Helvetica' | 'Helvetica-Bold';
export type VectorLineStyle = 'solid' | 'dashed';
export type ProfessionalColor =
  | '#ffffff'
  | '#0f172a'
  | '#334155'
  | '#475569'
  | '#fffaf0'
  | '#9a3412'
  | '#ea580c';

export interface ProfessionalCalloutContent {
  readonly tagValue?: string;
  readonly isoNoteValue?: string;
  readonly confidence?: CalloutConfidence;
}

export interface StyleContractInput {
  readonly isReview: boolean;
  readonly fontSize: number;
}

export interface StyleContract {
  readonly version: 'v1';
  readonly isReview: boolean;
  readonly backgroundColor: ProfessionalColor;
  readonly textColor: ProfessionalColor;
  readonly borderColor: ProfessionalColor;
  readonly leaderColor: ProfessionalColor;
  readonly fontSize: number;
  readonly tagFontId: 'Helvetica-Bold';
  readonly bodyFontId: 'Helvetica';
  readonly lineHeight: number;
  readonly padding: number;
  readonly sectionGap: number;
  readonly borderWidth: number;
  readonly cornerRadius: number;
}

export interface VectorRectangle {
  readonly type: 'rectangle';
  readonly rect: Rect;
  readonly fillColor: ProfessionalColor;
  readonly borderColor: ProfessionalColor;
  readonly borderWidth: number;
  readonly cornerRadius: number;
}

export interface VectorLine {
  readonly type: 'line';
  readonly start: Point;
  readonly end: Point;
  readonly color: ProfessionalColor;
  readonly width: number;
  readonly style: VectorLineStyle;
}

export interface VectorCircle {
  readonly type: 'circle';
  readonly center: Point;
  readonly radius: number;
  readonly fillColor: ProfessionalColor;
  readonly borderColor: ProfessionalColor;
  readonly borderWidth: number;
}

export interface VectorText {
  readonly type: 'text';
  readonly position: Point;
  readonly text: string;
  readonly fontSize: number;
  readonly fontId: PdfFontId;
  readonly color: ProfessionalColor;
}

export type VectorPrimitive = VectorRectangle | VectorLine | VectorCircle | VectorText;

export interface ProfessionalCalloutModel {
  readonly id: string;
  readonly psNo: string;
  readonly content: ProfessionalCalloutContent;
  readonly targetPoint: Point;
  readonly box: Rect;
  readonly style: StyleContract;
  readonly primitives: readonly VectorPrimitive[];
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

export function getStyleContract(input: StyleContractInput): StyleContract {
  assertPositiveFinite(input.fontSize, 'fontSize');
  const common = {
    version: 'v1' as const,
    fontSize: input.fontSize,
    tagFontId: 'Helvetica-Bold' as const,
    bodyFontId: 'Helvetica' as const,
    lineHeight: input.fontSize * 1.35,
    padding: 8,
    sectionGap: 4,
  };

  return input.isReview
    ? {
        ...common,
        isReview: true,
        backgroundColor: '#fffaf0',
        textColor: '#9a3412',
        borderColor: '#ea580c',
        leaderColor: '#ea580c',
        borderWidth: 1.5,
        cornerRadius: 3,
      }
    : {
        ...common,
        isReview: false,
        backgroundColor: '#ffffff',
        textColor: '#0f172a',
        borderColor: '#334155',
        leaderColor: '#475569',
        borderWidth: 1,
        cornerRadius: 2,
      };
}
