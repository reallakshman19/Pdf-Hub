import { describe, expect, it } from 'vitest';
import { normalizePsNumber, parsePsIsonoteTable } from './psIsonoteTable';

describe('psIsonoteTable', () => {
  it('normalizes common PS number forms', () => {
    expect(normalizePsNumber('PS-1234.5')).toBe('PS-1234.5');
    expect(normalizePsNumber('PS No.: 1234.5')).toBe('PS-1234.5');
    expect(normalizePsNumber('support number 0099.2')).toBe('PS-0099.2');
    expect(normalizePsNumber('1234.5')).toBe('PS-1234.5');
    expect(normalizePsNumber('not-a-support')).toBeNull();
  });

  it('parses quoted CSV notes and family columns', () => {
    const parsed = parsePsIsonoteTable([
      'PS No.,Support Family,ISONOTE',
      'PS-1234.5,Guide,"REST(6kN), GUIDE [Gap=10mm] (8kN)"',
      'PS-2222.1,Rest,REST(4kN)',
    ].join('\n'));

    expect(parsed.mappings).toEqual([
      {
        psNo: 'PS-1234.5',
        family: 'Guide',
        isonote: 'REST(6kN), GUIDE [Gap=10mm] (8kN)',
        sourceRow: 2,
      },
      {
        psNo: 'PS-2222.1',
        family: 'Rest',
        isonote: 'REST(4kN)',
        sourceRow: 3,
      },
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it('accepts pasted markdown tables and XML utility output aliases', () => {
    const parsed = parsePsIsonoteTable([
      '| Name of the element | Support ISONOTE |',
      '| --- | --- |',
      '| PS-4000.2 | GUIDE [Gap=6mm] |',
    ].join('\n'));

    expect(parsed.delimiter).toBe('|');
    expect(parsed.mappings[0]).toMatchObject({
      psNo: 'PS-4000.2',
      isonote: 'GUIDE [Gap=6mm]',
    });
  });

  it('keeps the first row when duplicate PS numbers conflict', () => {
    const parsed = parsePsIsonoteTable([
      'PS No.\tISONOTE',
      'PS-1000.1\tREST(2kN)',
      'PS-1000.1\tREST(3kN)',
    ].join('\n'));

    expect(parsed.mappings).toHaveLength(1);
    expect(parsed.mappings[0].isonote).toBe('REST(2kN)');
    expect(parsed.warnings[0]).toContain('conflicting ISONOTE');
  });
});
