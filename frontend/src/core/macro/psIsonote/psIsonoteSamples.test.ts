import { describe, expect, it } from 'vitest';
import { parsePsIsonoteTable } from './psIsonoteTable';
import { PS_ISONOTE_SAMPLES } from './psIsonoteSamples';

describe('PS ISONOTE sample mappings', () => {
  it('keeps the sample catalog and records immutable', () => {
    expect(Object.isFrozen(PS_ISONOTE_SAMPLES)).toBe(true);
    expect(PS_ISONOTE_SAMPLES.every((sample) => Object.isFrozen(sample))).toBe(true);
  });

  it('provides parser-valid CSV, TSV, and pipe-table samples', () => {
    const parsed = PS_ISONOTE_SAMPLES.map((sample) => parsePsIsonoteTable(sample.content));

    expect(parsed.map((result) => result.delimiter)).toEqual([',', '\t', '|', '\t']);
    expect(parsed.every((result) => result.mappings.length === 3)).toBe(true);
    expect(parsed[0]?.mappings[0]?.psNo).toBe('PS-11167.4');
    expect(parsed[3]?.mappings[0]?.psNo).toBe('PS-11168/DATUM');
  });

  it('binds each format to an exact filename and text MIME type', () => {
    expect(
      PS_ISONOTE_SAMPLES.map(({ fileName, mimeType }) => ({ fileName, mimeType })),
    ).toEqual([
      {
        fileName: 'ps-isonote-sample.csv',
        mimeType: 'text/csv;charset=utf-8',
      },
      {
        fileName: 'ps-isonote-sample.tsv',
        mimeType: 'text/tab-separated-values;charset=utf-8',
      },
      {
        fileName: 'ps-isonote-sample.txt',
        mimeType: 'text/plain;charset=utf-8',
      },
      {
        fileName: 'navis-tag-isonote-resolution.tsv',
        mimeType: 'text/tab-separated-values;charset=utf-8',
      },
    ]);
  });

  it('demonstrates that PS_NO and ISONOTE are separate TSV columns', () => {
    const sample = PS_ISONOTE_SAMPLES.find((candidate) => candidate.id === 'tsv-basic');
    expect(sample).toBeDefined();

    const parsed = parsePsIsonoteTable(sample?.content ?? '');
    expect(parsed.psColumn).toBe('PS_NO');
    expect(parsed.isonoteColumn).toBe('ISONOTE');
    expect(parsed.mappings[0]).toMatchObject({
      psNo: 'PS-11167.4',
      isonote: 'GUIDE',
    });
  });
});
