/**
 * 1-Click Cryptographic Redaction Bridge for OCR Forms and PII Entities.
 *
 * Bridges detected sensitive entities and form values directly into the
 * client-side redaction store for irreversible vector sanitization.
 *
 * Invariant INV-4 & INV-11 compliant: Pure TypeScript domain logic, no console.log.
 */

import type { PdfRect } from '../types';
import type { OcrPiiEntity, OcrKeyValuePair } from './formTypes';
import { addRegion } from '@/core/redaction/store';
import type { RedactionRegion } from '@/core/redaction/types';

export interface RedactionDraft {
  pageNumber: number;
  rect: PdfRect;
  reason: string;
}

/**
 * Applies a visual padding margin around a bounding box to guarantee full
 * optical clearance of ascenders and descenders during sanitization.
 */
export function padRect(rect: PdfRect, paddingPt: number = 2): PdfRect {
  return {
    x: Math.round(Math.max(0, rect.x - paddingPt) * 100) / 100,
    y: Math.round(Math.max(0, rect.y - paddingPt) * 100) / 100,
    width: Math.round((rect.width + paddingPt * 2) * 100) / 100,
    height: Math.round((rect.height + paddingPt * 2) * 100) / 100,
  };
}

/**
 * Converts a detected PII entity into a redaction region draft.
 */
export function convertOcrEntityToRedactionDraft(
  entity: OcrPiiEntity,
  paddingPt: number = 2,
): RedactionDraft {
  const categoryLabel = entity.category.toUpperCase().replace('-', ' ');
  return {
    pageNumber: entity.pageIndex + 1, // 1-based pageNumber for redaction store
    rect: padRect(entity.bbox, paddingPt),
    reason: `OCR PII: ${categoryLabel} (${entity.maskedText})`,
  };
}

/**
 * Converts a key-value pair value into a redaction region draft.
 */
export function convertKeyValuePairToRedactionDraft(
  pair: OcrKeyValuePair,
  target: 'value' | 'key' | 'both' = 'value',
  paddingPt: number = 2,
): RedactionDraft[] {
  const pageNumber = pair.pageIndex + 1;
  const drafts: RedactionDraft[] = [];

  if (target === 'value' || target === 'both') {
    drafts.push({
      pageNumber,
      rect: padRect(pair.valueBbox, paddingPt),
      reason: `Form Value: ${pair.keyText}`,
    });
  }

  if (target === 'key' || target === 'both') {
    drafts.push({
      pageNumber,
      rect: padRect(pair.keyBbox, paddingPt),
      reason: `Form Key: ${pair.keyText}`,
    });
  }

  return drafts;
}

/**
 * Batch dispatches detected PII entities to the redaction store.
 */
export function batchApplyPiiEntitiesToRedactionStore(
  entities: readonly OcrPiiEntity[],
  paddingPt: number = 2,
): RedactionRegion[] {
  const created: RedactionRegion[] = [];
  for (const entity of entities) {
    const draft = convertOcrEntityToRedactionDraft(entity, paddingPt);
    const region = addRegion(draft.pageNumber, draft.rect, draft.reason);
    created.push(region);
  }
  return created;
}
