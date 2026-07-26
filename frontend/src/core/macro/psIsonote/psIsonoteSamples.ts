export type PsIsonoteSampleId = 'csv-family' | 'tsv-basic' | 'pipe-table';

export interface PsIsonoteSample {
  readonly id: PsIsonoteSampleId;
  readonly label: string;
  readonly description: string;
  readonly fileName: string;
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

export const PS_ISONOTE_SAMPLES: readonly PsIsonoteSample[] = Object.freeze([
  Object.freeze({
    id: 'csv-family' as const,
    label: 'CSV',
    description: 'Comma-delimited sample with optional support family and quoted notes.',
    fileName: 'ps-isonote-sample.csv',
    content: CSV_FAMILY_SAMPLE,
  }),
  Object.freeze({
    id: 'tsv-basic' as const,
    label: 'TSV',
    description: 'Tab-delimited two-column PS_NO and ISONOTE sample.',
    fileName: 'ps-isonote-sample.tsv',
    content: TSV_BASIC_SAMPLE,
  }),
  Object.freeze({
    id: 'pipe-table' as const,
    label: 'Pipe table',
    description: 'Paste-friendly Markdown pipe table using supported header aliases.',
    fileName: 'ps-isonote-sample.txt',
    content: PIPE_TABLE_SAMPLE,
  }),
]);
