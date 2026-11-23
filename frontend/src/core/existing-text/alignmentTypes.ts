export type ExistingTextAlign = 'left' | 'center' | 'right' | 'justify';

export interface ExistingTextAlignmentOptions {
  align: ExistingTextAlign;
  columnWidthPt: number;
  horizontalScalePercent?: number; // 90 to 110 (100 = normal)
  letterSpacingPt?: number;        // Tc
  wordSpacingPt?: number;          // Tw
}

export interface AlignedLineLayout {
  text: string;
  offsetX: number;                 // Starting x offset relative to column left
  wordSpacingPt: number;           // Tw parameter
  charSpacingPt: number;           // Tc parameter
  horizontalScalePercent: number;  // Tz parameter
  effectiveLineWidthPt: number;
}
