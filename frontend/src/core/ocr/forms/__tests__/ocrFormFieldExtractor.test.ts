import { describe, it, expect } from 'vitest';
import {
  extractPageKeyValuePairs,
  serializeKeyValuePairsToJson,
  serializeKeyValuePairsToCsv,
} from '../ocrFormFieldExtractor';
import type { OcrPageResult, OcrLine, OcrWord } from '../../types';

describe('ocrFormFieldExtractor', () => {
  it('extracts same-line colon separated key-value pairs', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-1',
        pageIndex: 0,
        text: 'Invoice Number: INV-2026-904',
        confidence: 0.95,
        bbox: { x: 50, y: 100, width: 220, height: 14 },
        wordIds: ['w-1', 'w-2', 'w-3'],
      },
      {
        id: 'l-2',
        pageIndex: 0,
        text: 'Total Amount: $4,520.00',
        confidence: 0.98,
        bbox: { x: 50, y: 130, width: 180, height: 14 },
        wordIds: ['w-4', 'w-5', 'w-6'],
      },
    ];

    const words: OcrWord[] = [
      {
        id: 'w-1',
        pageIndex: 0,
        lineId: 'l-1',
        text: 'Invoice',
        normalizedText: 'invoice',
        confidence: 0.95,
        bbox: { x: 50, y: 100, width: 45, height: 14 },
      },
      {
        id: 'w-2',
        pageIndex: 0,
        lineId: 'l-1',
        text: 'Number:',
        normalizedText: 'number',
        confidence: 0.95,
        bbox: { x: 98, y: 100, width: 50, height: 14 },
      },
      {
        id: 'w-3',
        pageIndex: 0,
        lineId: 'l-1',
        text: 'INV-2026-904',
        normalizedText: 'inv-2026-904',
        confidence: 0.96,
        bbox: { x: 155, y: 100, width: 110, height: 14 },
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.96,
      blocks: [],
      lines,
      words,
    };

    const pairs = extractPageKeyValuePairs(pageResult);
    expect(pairs).toHaveLength(2);

    expect(pairs[0].keyText).toBe('Invoice Number');
    expect(pairs[0].valueText).toBe('INV-2026-904');
    expect(pairs[0].layoutRelation).toBe('same-line-colon');
    expect(pairs[0].valueBbox.x).toBeGreaterThan(pairs[0].keyBbox.x);

    expect(pairs[1].keyText).toBe('Total Amount');
    expect(pairs[1].valueText).toBe('$4,520.00');
  });

  it('extracts right-of adjacent key-value pairs', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-key',
        pageIndex: 0,
        text: 'Bill To:',
        confidence: 0.92,
        bbox: { x: 50, y: 100, width: 50, height: 14 },
        wordIds: [],
      },
      {
        id: 'l-val',
        pageIndex: 0,
        text: 'Acme Corporation Inc.',
        confidence: 0.94,
        bbox: { x: 115, y: 100, width: 140, height: 14 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.93,
      blocks: [],
      lines,
      words: [],
    };

    const pairs = extractPageKeyValuePairs(pageResult);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].keyText).toBe('Bill To');
    expect(pairs[0].valueText).toBe('Acme Corporation Inc.');
    expect(pairs[0].layoutRelation).toBe('right-of');
  });

  it('extracts vertical stacked (below) key-value pairs', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-key-down',
        pageIndex: 0,
        text: 'Ship To:',
        confidence: 0.9,
        bbox: { x: 50, y: 100, width: 60, height: 14 },
        wordIds: [],
      },
      {
        id: 'l-val-down',
        pageIndex: 0,
        text: '123 Industrial Parkway, Suite 400',
        confidence: 0.93,
        bbox: { x: 50, y: 122, width: 200, height: 14 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'success',
      confidence: 0.91,
      blocks: [],
      lines,
      words: [],
    };

    const pairs = extractPageKeyValuePairs(pageResult);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].keyText).toBe('Ship To');
    expect(pairs[0].valueText).toBe('123 Industrial Parkway, Suite 400');
    expect(pairs[0].layoutRelation).toBe('below');
  });

  it('filters out pairs below minConfidence threshold', () => {
    const lines: OcrLine[] = [
      {
        id: 'l-low',
        pageIndex: 0,
        text: 'Account Number: 994821',
        confidence: 0.2, // Below default 0.3 threshold
        bbox: { x: 50, y: 100, width: 180, height: 14 },
        wordIds: [],
      },
    ];

    const pageResult: OcrPageResult = {
      pageNumber: 1,
      pageIndex: 0,
      status: 'partial',
      confidence: 0.2,
      blocks: [],
      lines,
      words: [],
    };

    const pairs = extractPageKeyValuePairs(pageResult);
    expect(pairs).toHaveLength(0);
  });

  it('serializes key-value pairs to JSON and CSV formats', () => {
    const pairs = [
      {
        id: 'kv-1',
        pageIndex: 0,
        keyText: 'Customer ID',
        keyBbox: { x: 50, y: 100, width: 60, height: 14 },
        valueText: 'C-9912',
        valueBbox: { x: 120, y: 100, width: 50, height: 14 },
        confidence: 0.95,
        layoutRelation: 'same-line-colon' as const,
      },
    ];

    const jsonStr = serializeKeyValuePairsToJson(pairs);
    expect(JSON.parse(jsonStr)).toEqual({
      'Customer ID': 'C-9912',
    });

    const csvStr = serializeKeyValuePairsToCsv(pairs);
    expect(csvStr).toContain('"Key","Value","Confidence","LayoutRelation","PageIndex"');
    expect(csvStr).toContain('"Customer ID","C-9912",0.95,"same-line-colon",0');
  });
});
