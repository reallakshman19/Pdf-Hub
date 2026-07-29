import { describe, expect, it } from 'vitest';
import {
  extractPipeLineStem,
  normalizePsNumber,
  parsePsIsonoteTable,
  PsIsonoteParseError,
} from './psIsonoteTable';
import { PS_ISONOTE_ADMISSION_LIMITS, PsIsonoteAdmissionError } from './psIsonoteAdmission';

describe('psIsonoteTable', () => {
  it('normalizes common PS number forms', () => {
    expect(normalizePsNumber('PS-1234.5')).toBe('PS-1234.5');
    expect(normalizePsNumber('PS No.: 1234.5')).toBe('PS-1234.5');
    expect(normalizePsNumber('support number 0099.2')).toBe('PS-0099.2');
    expect(normalizePsNumber('1234.5')).toBe('PS-1234.5');
    expect(normalizePsNumber('not-a-support')).toBeNull();
  });

  it('extracts stable line number stems from Navis and CAD pipe line designations', () => {
    expect(extractPipeLineStem('/ASIM-1835-6"-W8810193-33421')).toBe('8810193');
    expect(extractPipeLineStem('ASIM-1835-1/2"-P8810265-31441C4-PP')).toBe('8810265');
    expect(extractPipeLineStem('4"-P8810203-31441C4-PP')).toBe('8810203');
    expect(extractPipeLineStem('')).toBeNull();
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

  it('treats inch marks inside unquoted TSV cells as literal text', () => {
    const parsed = parsePsIsonoteTable([
      'Name of the element\tPIPE\tPOS\tNavis Tag ID\tNavis Tag POS\tTag\tSupport ISONOTE\tconfidence\tBasis',
      '/PS-11168/DATUM\t/ASIM-1835-8"-P8810201-31441C4-PP\tE=174657.718;N=711772.6;EL=1197.04\t3\tE=174645.189;N=711779.232;EL=1253.664\tR+G+LS\t:/PS-11168/DATUM REST, GUIDE, LINE STOP (C=M)\tMEDIUM\tDIRECT_TAG_PROXIMITY',
      '/PS-11167.4\t/ASIM-1835-4"-P8810203-31441C4-PP\tE=175057.718;N=714772.6;EL=1144.64\t1\tE=175057.718;N=714772.6;EL=1144.64\tR+G\t:/PS-11167.4 REST, GUIDE (C=H)\tHIGH\tDIRECT_TAG_PROXIMITY',
      '/PS-11168.8\t/ASIM-1835-4"-P8810203-31441C4-PP\tE=175057.718;N=711772.6;EL=1144.64\t2\tE=175059.782;N=711774.388;EL=1145.689\tRemove Guide\t:/PS-11168.8 Remove Guide (C=H)\tHIGH\tDIRECT_TAG_PROXIMITY',
    ].join('\n'));

    expect(parsed.delimiter).toBe('\t');
    expect(parsed.warnings).toEqual([]);
    expect(parsed.mappings).toEqual([
      {
        psNo: 'PS-11168/DATUM',
        family: 'R+G+LS',
        tagNo: '3',
        isonote: ':/PS-11168/DATUM REST, GUIDE, LINE STOP (C=M)',
        confidence: 'MEDIUM',
        pipeLineDesignation: '/ASIM-1835-8"-P8810201-31441C4-PP',
        pipeLineStem: '8810201',
        sourceRow: 2,
      },
      {
        psNo: 'PS-11167.4',
        family: 'R+G',
        tagNo: '1',
        isonote: ':/PS-11167.4 REST, GUIDE (C=H)',
        confidence: 'HIGH',
        pipeLineDesignation: '/ASIM-1835-4"-P8810203-31441C4-PP',
        pipeLineStem: '8810203',
        sourceRow: 3,
      },
      {
        psNo: 'PS-11168.8',
        family: 'Remove Guide',
        tagNo: '2',
        isonote: ':/PS-11168.8 Remove Guide (C=H)',
        confidence: 'HIGH',
        pipeLineDesignation: '/ASIM-1835-4"-P8810203-31441C4-PP',
        pipeLineStem: '8810203',
        sourceRow: 4,
      },
    ]);
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

  it('preserves a literal inch mark mid-field in unquoted CSV without losing subsequent rows', () => {
    const parsed = parsePsIsonoteTable([
      'PS,NOTE',
      'PS-101,12" flange spec',
      'PS-102,ok',
    ].join('\n'));

    expect(parsed.warnings).toEqual([]);
    expect(parsed.mappings).toEqual([
      { psNo: 'PS-101', isonote: '12" flange spec', sourceRow: 2 },
      { psNo: 'PS-102', isonote: 'ok', sourceRow: 3 },
    ]);
  });

  it('supports RFC4180 quoted fields with an embedded delimiter', () => {
    const parsed = parsePsIsonoteTable([
      'PS,NOTE',
      'PS-103,"REST(6kN), GUIDE (8kN)"',
    ].join('\n'));

    expect(parsed.warnings).toEqual([]);
    expect(parsed.mappings).toEqual([
      { psNo: 'PS-103', isonote: 'REST(6kN), GUIDE (8kN)', sourceRow: 2 },
    ]);
  });

  it('rejects an unterminated quoted field loudly instead of swallowing the rest of the file', () => {
    const input = [
      'PS,NOTE',
      'PS-104,"unterminated',
      'PS-105,ok',
    ].join('\n');

    expect(() => parsePsIsonoteTable(input)).toThrow(PsIsonoteParseError);
    expect(() => parsePsIsonoteTable(input)).toThrow(/unterminated/i);
  });

  it('attaches admission evidence to a successfully parsed table', () => {
    const parsed = parsePsIsonoteTable([
      'PS,NOTE',
      'PS-100001,ok',
    ].join('\n'));

    expect(parsed.admission).toMatchObject({
      evidenceProfileId: 'PS_ISONOTE_ADMISSION_EVIDENCE_V1',
      measuredRows: 2,
      measuredColumns: 2,
      measuredMappingCount: 1,
      measuredDiagnosticCount: 0,
      admissionOutcome: 'ADMITTED',
    });
    expect(Object.isFrozen(parsed.admission)).toBe(true);
  });

  it('rejects a table with more rows than the admission limit', () => {
    const rows = ['PS,NOTE'];
    for (let i = 0; i <= PS_ISONOTE_ADMISSION_LIMITS.maxRows; i += 1) {
      rows.push(`PS-1${String(i).padStart(6, '0')},ok`);
    }
    expect(() => parsePsIsonoteTable(rows.join('\n'))).toThrow(PsIsonoteAdmissionError);
  });

  it('rejects a table with more columns than the admission limit', () => {
    const header = Array.from({ length: PS_ISONOTE_ADMISSION_LIMITS.maxColumns + 1 }, (_, i) => `Col${i}`);
    const input = [header.join(','), header.map(() => 'x').join(',')].join('\n');
    expect(() => parsePsIsonoteTable(input)).toThrow(PsIsonoteAdmissionError);
  });

  it('rejects a cell larger than the admission limit', () => {
    const hugeCell = 'x'.repeat(PS_ISONOTE_ADMISSION_LIMITS.maxCellCodeUnits + 1);
    const input = ['PS,NOTE', `PS-1,${hugeCell}`].join('\n');
    expect(() => parsePsIsonoteTable(input)).toThrow(PsIsonoteAdmissionError);
  });

  it('rejects more unique mappings than the admission limit', () => {
    const rows = ['PS,NOTE'];
    for (let i = 0; i <= PS_ISONOTE_ADMISSION_LIMITS.maxMappingCount; i += 1) {
      rows.push(`PS-1${String(i).padStart(6, '0')},ok`);
    }
    expect(() => parsePsIsonoteTable(rows.join('\n'))).toThrow(PsIsonoteAdmissionError);
  });

  it('rejects more diagnostics than the admission limit', () => {
    const rows = ['PS,NOTE'];
    for (let i = 0; i <= PS_ISONOTE_ADMISSION_LIMITS.maxDiagnosticCount; i += 1) {
      rows.push(`PS-${i},`);
    }
    expect(() => parsePsIsonoteTable(rows.join('\n'))).toThrow(PsIsonoteAdmissionError);
  });

  it('honors cancellation while parsing', () => {
    const controller = new AbortController();
    controller.abort();
    const input = ['PS,NOTE', 'PS-100001,ok'].join('\n');
    expect(() => parsePsIsonoteTable(input, { signal: controller.signal })).toThrow(/cancelled/i);
  });
});
