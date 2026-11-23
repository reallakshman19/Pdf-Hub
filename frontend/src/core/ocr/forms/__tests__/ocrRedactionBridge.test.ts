import { describe, it, expect, beforeEach } from 'vitest';
import {
  padRect,
  convertOcrEntityToRedactionDraft,
  convertKeyValuePairToRedactionDraft,
  batchApplyPiiEntitiesToRedactionStore,
} from '../ocrRedactionBridge';
import type { OcrPiiEntity, OcrKeyValuePair } from '../formTypes';
import { getState, clearRegions } from '@/core/redaction/store';

describe('ocrRedactionBridge', () => {
  beforeEach(() => {
    clearRegions();
  });

  it('applies padding around bounding boxes for ascender/descender clearance', () => {
    const original = { x: 50, y: 100, width: 80, height: 16 };
    const padded = padRect(original, 2);

    expect(padded.x).toBe(48);
    expect(padded.y).toBe(98);
    expect(padded.width).toBe(84);
    expect(padded.height).toBe(20);
  });

  it('converts detected PII entity to 1-based redaction draft with descriptive reason', () => {
    const entity: OcrPiiEntity = {
      id: 'pii-1',
      pageIndex: 2, // page 3 in 1-based PDF numbering
      category: 'ssn',
      rawText: '123-45-6789',
      maskedText: '***-**-6789',
      bbox: { x: 72, y: 200, width: 90, height: 14 },
      confidence: 0.96,
    };

    const draft = convertOcrEntityToRedactionDraft(entity);
    expect(draft.pageNumber).toBe(3);
    expect(draft.reason).toBe('OCR PII: SSN (***-**-6789)');
    expect(draft.rect.x).toBe(70);
  });

  it('converts key-value pairs into value, key, or both redaction drafts', () => {
    const pair: OcrKeyValuePair = {
      id: 'kv-1',
      pageIndex: 0,
      keyText: 'Patient Name',
      keyBbox: { x: 50, y: 100, width: 70, height: 14 },
      valueText: 'Jane Doe',
      valueBbox: { x: 130, y: 100, width: 60, height: 14 },
      confidence: 0.95,
      layoutRelation: 'same-line-colon',
    };

    const valueOnly = convertKeyValuePairToRedactionDraft(pair, 'value');
    expect(valueOnly).toHaveLength(1);
    expect(valueOnly[0].reason).toBe('Form Value: Patient Name');
    expect(valueOnly[0].rect.x).toBe(128);

    const both = convertKeyValuePairToRedactionDraft(pair, 'both');
    expect(both).toHaveLength(2);
    expect(both[0].reason).toBe('Form Value: Patient Name');
    expect(both[1].reason).toBe('Form Key: Patient Name');
  });

  it('batch applies PII entities to redaction store and updates store state', () => {
    const entities: OcrPiiEntity[] = [
      {
        id: 'pii-1',
        pageIndex: 0,
        category: 'email',
        rawText: 'user@example.com',
        maskedText: 'u***@example.com',
        bbox: { x: 50, y: 100, width: 100, height: 14 },
        confidence: 0.95,
      },
      {
        id: 'pii-2',
        pageIndex: 1,
        category: 'phone',
        rawText: '555-0199',
        maskedText: '(***) ***-0199',
        bbox: { x: 50, y: 150, width: 70, height: 14 },
        confidence: 0.93,
      },
    ];

    const created = batchApplyPiiEntitiesToRedactionStore(entities);
    expect(created).toHaveLength(2);

    const storeState = getState();
    expect(storeState.regions).toHaveLength(2);
    expect(storeState.regions[0].pageNumber).toBe(1);
    expect(storeState.regions[1].pageNumber).toBe(2);
  });
});
