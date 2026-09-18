import { describe, expect, it } from 'vitest';

import { createPdfCommand, type PdfCommand } from './types';
import { validateCommand } from './validators';

function command(ranges: Array<{
  startPageId: string;
  style?: 'decimal' | 'roman-lower' | 'roman-upper' | 'letters-lower' | 'letters-upper';
  prefix?: string;
  startNumber?: number;
}>): PdfCommand {
  return createPdfCommand({
    type: 'SET_PAGE_LABELS',
    source: 'api',
    documentKey: 'doc',
    payload: { ranges },
    id: 'labels-command',
    createdAt: '2026-09-18T00:00:00.000Z',
  });
}

describe('SET_PAGE_LABELS validation', () => {
  it('accepts complete ranges and an empty clear command', () => {
    expect(validateCommand(command([
      { startPageId: 'p1', prefix: 'Cover' },
      { startPageId: 'p2', style: 'roman-lower' },
      { startPageId: 'p5', style: 'decimal', prefix: 'A-', startNumber: 7 },
    ])).ok).toBe(true);

    expect(validateCommand(command([])).ok).toBe(true);
  });

  it('rejects duplicate starts and invalid starting numbers', () => {
    const result = validateCommand(command([
      { startPageId: 'p1', style: 'decimal' },
      { startPageId: 'p1', style: 'roman-lower', startNumber: 0 },
    ]));

    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes('duplicate startPageId'))).toBe(true);
    expect(result.errors.some((message) => message.includes('integer >= 1'))).toBe(true);
  });

  it('rejects a range with neither numbering style nor prefix', () => {
    const result = validateCommand(command([
      { startPageId: 'p1' },
    ]));

    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes('style or non-empty prefix'))).toBe(true);
  });

  it('rejects an unsupported runtime style even when input bypasses TypeScript', () => {
    const invalid = command([
      {
        startPageId: 'p1',
        style: 'decimal',
      },
    ]) as Extract<PdfCommand, { type: 'SET_PAGE_LABELS' }>;

    (invalid.payload.ranges[0] as { style?: string }).style = 'hexadecimal';

    const result = validateCommand(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes('supported PageLabel style'))).toBe(true);
  });
});
