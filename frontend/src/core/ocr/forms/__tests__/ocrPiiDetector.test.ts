import { describe, it, expect } from 'vitest';
import { detectPagePiiEntities } from '../ocrPiiDetector';
import type { OcrPageResult, OcrLine, OcrWord } from '../../types';

describe('ocrPiiDetector', () => {
  it('detects SSN and masks characters preserving last 4', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-ssn',
        pageIndex: 0,
        text: 'Social Security Number: 123-45-6789 on record',
        confidence: 0.95,
        bbox: { x: 50, y: 100, width: 250, height: 14 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.95,
      blocks: [],
      lines,
      words: [],
    };

    const entities = detectPagePiiEntities(pageResult);
    expect(entities).toHaveLength(1);
    expect(entities[0].category).toBe('ssn');
    expect(entities[0].rawText).toBe('123-45-6789');
    expect(entities[0].maskedText).toBe('***-**-6789');
  });

  it('detects email addresses and masks usernames', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-email',
        pageIndex: 0,
        text: 'Contact us at billing.support@acmecorp.com for inquiries',
        confidence: 0.96,
        bbox: { x: 50, y: 120, width: 280, height: 14 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.96,
      blocks: [],
      lines,
      words: [],
    };

    const entities = detectPagePiiEntities(pageResult);
    expect(entities).toHaveLength(1);
    expect(entities[0].category).toBe('email');
    expect(entities[0].rawText).toBe('billing.support@acmecorp.com');
    expect(entities[0].maskedText).toBe('b***@acmecorp.com');
  });

  it('detects phone numbers across formats', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-phone',
        pageIndex: 0,
        text: 'Direct hotline: (800) 555-0199 or 415-555-2671',
        confidence: 0.94,
        bbox: { x: 50, y: 140, width: 260, height: 14 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.94,
      blocks: [],
      lines,
      words: [],
    };

    const entities = detectPagePiiEntities(pageResult);
    expect(entities).toHaveLength(2);
    expect(entities[0].category).toBe('phone');
    expect(entities[0].rawText).toBe('(800) 555-0199');
    expect(entities[0].maskedText).toBe('(***) ***-0199');

    expect(entities[1].category).toBe('phone');
    expect(entities[1].rawText).toBe('415-555-2671');
    expect(entities[1].maskedText).toBe('(***) ***-2671');
  });

  it('detects Luhn-valid credit card numbers and rejects invalid numbers', () => {
    const lines: OcrLine[] = [
      // 4532-0150-1234-5671 is a valid Luhn credit card number
      {
        id: 'l-cc',
        pageIndex: 0,
        text: 'Charged to card 4532 0150 1234 5671 on file',
        confidence: 0.98,
        bbox: { x: 50, y: 160, width: 270, height: 14 },
        wordIds: [],
      },
      // 1234-5678-9012-3456 is invalid Luhn
      {
        id: 'l-invalid',
        pageIndex: 0,
        text: 'Invalid fake number 1234 5678 9012 3456 here',
        confidence: 0.98,
        bbox: { x: 50, y: 180, width: 270, height: 14 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.98,
      blocks: [],
      lines,
      words: [],
    };

    const entities = detectPagePiiEntities(pageResult);
    expect(entities).toHaveLength(1);
    expect(entities[0].category).toBe('credit-card');
    expect(entities[0].maskedText).toBe('****-****-****-5671');
  });

  it('maps matching words to spatial bounding box', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-1',
        pageIndex: 0,
        text: 'Tax ID: 12-3456789',
        confidence: 0.92,
        bbox: { x: 50, y: 100, width: 140, height: 14 },
        wordIds: ['w-1', 'w-2', 'w-3'],
      },
    ];

    const words: OcrWord[] = [
      {
        id: 'w-1',
        pageIndex: 0,
        lineId: 'l-1',
        text: 'Tax',
        normalizedText: 'tax',
        confidence: 0.92,
        bbox: { x: 50, y: 100, width: 25, height: 14 },
      },
      {
        id: 'w-2',
        pageIndex: 0,
        lineId: 'l-1',
        text: 'ID:',
        normalizedText: 'id',
        confidence: 0.92,
        bbox: { x: 78, y: 100, width: 18, height: 14 },
      },
      {
        id: 'w-3',
        pageIndex: 0,
        lineId: 'l-1',
        text: '12-3456789',
        normalizedText: '12-3456789',
        confidence: 0.95,
        bbox: { x: 102, y: 100, width: 75, height: 14 },
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.93,
      blocks: [],
      lines,
      words,
    };

    const entities = detectPagePiiEntities(pageResult);
    expect(entities).toHaveLength(1);
    expect(entities[0].category).toBe('tax-id');
    expect(entities[0].bbox.x).toBe(102);
    expect(entities[0].bbox.width).toBe(75);
  });
});
