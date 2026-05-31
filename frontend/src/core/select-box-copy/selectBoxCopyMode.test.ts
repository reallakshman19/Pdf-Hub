import { describe, expect, it } from 'vitest';
import type { SelectBoxCopyResult } from './types';
import {
  confidenceLabelFor,
  resolveRecommendedMode,
  summarizeSelectBoxCopyResult,
} from './selectBoxCopyMode';

function result(patch: Partial<SelectBoxCopyResult> = {}): SelectBoxCopyResult {
  return {
    pageNumber: 1,
    pageIndex: 0,
    viewportRect: { x: 0, y: 0, width: 100, height: 100 },
    pdfRect: { x: 0, y: 0, width: 100, height: 100 },
    items: [],
    rows: [],
    plainText: '',
    html: '',
    table: null,
    ...patch,
  };
}

describe('selectBoxCopyMode', () => {
  it('recommends image when no text exists', () => {
    expect(resolveRecommendedMode(result())).toBe('image');

    const summary = summarizeSelectBoxCopyResult(result());

    expect(summary.message).toContain('No selectable text');
  });

  it('recommends text when plain text exists but table does not', () => {
    expect(resolveRecommendedMode(result({ plainText: 'Hello' }))).toBe('text');
  });

  it('recommends table when table confidence is high', () => {
    expect(resolveRecommendedMode(result({
      plainText: 'A\tB',
      table: {
        confidence: 0.88,
        html: '<table></table>',
        tsv: 'A\tB',
        tableData: {
          columns: [{ id: 'col-1' }, { id: 'col-2' }],
          rows: [],
        },
      },
    }))).toBe('table');
  });

  it('maps confidence labels', () => {
    expect(confidenceLabelFor(null)).toBe('none');
    expect(confidenceLabelFor(0.3)).toBe('low');
    expect(confidenceLabelFor(0.6)).toBe('medium');
    expect(confidenceLabelFor(0.8)).toBe('high');
  });
});