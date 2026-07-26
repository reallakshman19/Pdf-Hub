export type PsIsonoteSampleId = 'csv-family' | 'tsv-basic' | 'pipe-table' | 'navis-tag-isonote';
export type PsIsonoteSampleMimeType =
  | 'text/csv;charset=utf-8'
  | 'text/tab-separated-values;charset=utf-8'
  | 'text/plain;charset=utf-8';

export interface PsIsonoteSample {
  readonly id: PsIsonoteSampleId;
  readonly label: string;
  readonly description: string;
  readonly fileName: string;
  readonly mimeType: PsIsonoteSampleMimeType;
  readonly content: string;
}

const CSV_FAMILY_SAMPLE = [
  'PS No.,Family,ISONOTE',
  'PS-11167.4,Guide,"GUIDE [Gap=10mm]"',
  'PS-11168.1,Rest,"REST(6kN)"',
  'PS-11169.2,Line Stop,"LINE STOP(15kN), GUIDE(4kN)"',
].join('\n');

const TSV_BASIC_SAMPLE = [
  'PS_NO\tISONOTE',
  'PS-11167.4\tGUIDE',
  'PS-11168.1\tREST(6kN)',
  'PS-11169.2\tLINE STOP(15kN)',
].join('\n');

const PIPE_TABLE_SAMPLE = [
  '| Support Number | Support ISONOTE |',
  '| --- | --- |',
  '| PS-11167.4 | GUIDE [Gap=10mm] |',
  '| PS-11168.1 | REST(6kN) |',
  '| PS-11169.2 | LINE STOP(15kN) |',
].join('\n');

const NAVIS_TAG_ISONOTE_SAMPLE = [
  'Name of the element\tPIPE\tPOS\tNavis Tag ID\tNavis Tag POS\tTag\tSupport ISONOTE\tconfidence\tBasis',
  '/PS-11168/DATUM\t/ASIM-1835-8"-P8810201-31441C4-PP\tE=174657.718;N=711772.6;EL=1197.04\t3\tE=174643.125;N=711777.444;EL=1252.615\tR+G+LS\t:/PS-11168/DATUM REST, GUIDE, LINE STOP\tMEDIUM\tDIRECT_TAG_PROXIMITY',
  '/PS-11167.4\t/ASIM-1835-4"-P8810203-31441C4-PP\tE=175057.718;N=714772.6;EL=1144.64\t1\tE=175055.654;N=714770.812;EL=1143.591\tR+G\t:/PS-11167.4 REST, GUIDE\tHIGH\tDIRECT_TAG_PROXIMITY',
  '/PS-11168.8\t/ASIM-1835-4"-P8810203-31441C4-PP\tE=175057.718;N=711772.6;EL=1144.64\t2\tE=175057.718;N=711772.6;EL=1144.64\tRemove Guide\t:/PS-11168.8 Remove Guide\tHIGH\tDIRECT_TAG_PROXIMITY',
].join('\n');

export const PS_ISONOTE_SAMPLES: readonly PsIsonoteSample[] = Object.freeze([
  Object.freeze({
    id: 'csv-family' as const,
    label: 'CSV',
    description: 'Comma-delimited sample with optional support family and quoted notes.',
    fileName: 'ps-isonote-sample.csv',
    mimeType: 'text/csv;charset=utf-8' as const,
    content: CSV_FAMILY_SAMPLE,
  }),
  Object.freeze({
    id: 'tsv-basic' as const,
    label: 'TSV',
    description: 'Tab-delimited two-column PS_NO and ISONOTE sample.',
    fileName: 'ps-isonote-sample.tsv',
    mimeType: 'text/tab-separated-values;charset=utf-8' as const,
    content: TSV_BASIC_SAMPLE,
  }),
  Object.freeze({
    id: 'pipe-table' as const,
    label: 'Pipe table',
    description: 'Paste-friendly Markdown pipe table using supported header aliases.',
    fileName: 'ps-isonote-sample.txt',
    mimeType: 'text/plain;charset=utf-8' as const,
    content: PIPE_TABLE_SAMPLE,
  }),
  Object.freeze({
    id: 'navis-tag-isonote' as const,
    label: 'Navis Tag Resolution Table',
    description: 'Tab-delimited resolution results table from XML/Navis Tag matching tool.',
    fileName: 'navis-tag-isonote-resolution.tsv',
    mimeType: 'text/tab-separated-values;charset=utf-8' as const,
    content: NAVIS_TAG_ISONOTE_SAMPLE,
  }),
]);
