/**
 * Domain types for OCR Form Field Extraction, Optical Mark Recognition (OMR),
 * and PII / Sensitive Entity Detection.
 *
 * Invariant INV-4 compliant: Pure TypeScript domain types without external library types.
 */

import type { PdfRect } from '../types';

export type KeyValueLayoutRelation = 'right-of' | 'below' | 'same-line-colon';

export interface OcrKeyValuePair {
  id: string;
  pageIndex: number;
  keyText: string;
  keyBbox: PdfRect;
  valueText: string;
  valueBbox: PdfRect;
  confidence: number;
  layoutRelation: KeyValueLayoutRelation;
}

export type OcrOmrMarkType = 'checkbox' | 'radio';
export type OcrOmrState = 'checked' | 'unchecked' | 'indeterminate';

export interface OcrOmrMark {
  id: string;
  pageIndex: number;
  type: OcrOmrMarkType;
  state: OcrOmrState;
  fillRatio: number; // 0.0 to 1.0
  bbox: PdfRect;
  label?: string;
  labelBbox?: PdfRect;
}

export type PiiCategory =
  | 'ssn'
  | 'email'
  | 'phone'
  | 'credit-card'
  | 'tax-id'
  | 'ip-address'
  | 'custom';

export interface OcrPiiEntity {
  id: string;
  pageIndex: number;
  category: PiiCategory;
  rawText: string;
  maskedText: string;
  bbox: PdfRect;
  confidence: number;
}

export interface OcrDocumentIntelligenceResult {
  keyValuePairs: OcrKeyValuePair[];
  omrMarks: OcrOmrMark[];
  piiEntities: OcrPiiEntity[];
  extractedAt: string;
}
