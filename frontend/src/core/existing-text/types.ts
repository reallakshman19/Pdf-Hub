import type { PageId } from '@/core/pages/types';

export type ExistingTextTransform = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface ExistingTextSourceItem {
  sourceIndex: number;
  text: string;
  transform: ExistingTextTransform;
  width: number;
  height: number;
  fontName?: string;
  direction?: string;
  hasEol: boolean;
}

export type ExistingTextEditability =
  | 'native-replacement-candidate'
  | 'reconstructed-candidate'
  | 'unsupported';

export type ExistingTextEditabilityReason =
  | 'EMPTY_TEXT'
  | 'INVALID_SOURCE_INDEX'
  | 'NON_FINITE_GEOMETRY'
  | 'NON_POSITIVE_ADVANCE'
  | 'NON_POSITIVE_TEXT_SCALE'
  | 'MISSING_FONT_IDENTITY'
  | 'VERTICAL_WRITING_MODE'
  | 'ROTATED_TEXT'
  | 'SKEWED_TEXT';

export interface ExistingTextPageContext {
  revisionId: string;
  pageId: PageId;
  pageIndex: number;
}

export interface ExistingTextSpan {
  id: string;
  revisionId: string;
  pageId: PageId;
  pageIndex: number;
  sourceIndex: number;
  text: string;
  transform: ExistingTextTransform;
  originPt: {
    x: number;
    y: number;
  };
  advanceWidthPt: number;
  sourceHeightPt: number;
  horizontalScalePt: number;
  fontSizePt: number;
  rotationDegrees: number;
  skewCosine: number;
  fontName?: string;
  direction?: string;
  hasEol: boolean;
  editability: ExistingTextEditability;
  reasons: ExistingTextEditabilityReason[];
}

export interface ExistingTextPageInspection {
  revisionId: string;
  pageId: PageId;
  pageIndex: number;
  spans: ExistingTextSpan[];
  counts: {
    nativeReplacementCandidates: number;
    reconstructedCandidates: number;
    unsupported: number;
  };
}

export interface ExistingTextEditIntent {
  schemaVersion: 1;
  sourceRevisionId: string;
  pageId: PageId;
  spanId: string;
  sourceIndex: number;
  expectedText: string;
  replacementText: string;
  sourceEditability:
    | 'native-replacement-candidate'
    | 'reconstructed-candidate';
}

export interface ExistingTextIntentValidation {
  ok: boolean;
  errors: string[];
}
