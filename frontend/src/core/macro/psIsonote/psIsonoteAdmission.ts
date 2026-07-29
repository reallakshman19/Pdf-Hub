export const PS_ISONOTE_ADMISSION_LIMITS = Object.freeze({
  /** File.size, checked before File.text() is ever called. */
  maxUploadedSourceBytes: 5 * 1024 * 1024,
  /** UTF-16 code units, checked before typed/pasted text enters state. */
  maxPastedSourceCodeUnits: 2_000_000,
  maxRows: 50_000,
  maxColumns: 64,
  /** UTF-16 code units per raw cell, checked before any per-cell processing. */
  maxCellCodeUnits: 10_000,
  maxMappingCount: 50_000,
  maxDiagnosticCount: 10_000,
});

export type PsIsonoteAdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED_SOURCE_BYTES'
  | 'REJECTED_PASTED_CODE_UNITS'
  | 'REJECTED_ROW_COUNT'
  | 'REJECTED_COLUMN_COUNT'
  | 'REJECTED_CELL_SIZE'
  | 'REJECTED_MAPPING_COUNT'
  | 'REJECTED_DIAGNOSTIC_COUNT';

export interface PsIsonoteAdmissionMeasurement {
  readonly metric: string;
  readonly actual: number;
  readonly limit: number;
}

export class PsIsonoteAdmissionError extends Error {
  readonly outcome: PsIsonoteAdmissionOutcome;
  readonly measured: PsIsonoteAdmissionMeasurement;

  constructor(outcome: PsIsonoteAdmissionOutcome, measured: PsIsonoteAdmissionMeasurement) {
    super(
      `PS/ISONOTE admission rejected (${outcome}): ${measured.metric} measured ` +
      `${measured.actual}, limit is ${measured.limit}.`,
    );
    this.name = 'PsIsonoteAdmissionError';
    this.outcome = outcome;
    this.measured = Object.freeze({ ...measured });
  }
}

export const PS_ISONOTE_ADMISSION_EVIDENCE_PROFILE_ID = 'PS_ISONOTE_ADMISSION_EVIDENCE_V1' as const;

export interface PsIsonoteAdmissionEvidence {
  readonly evidenceProfileId: typeof PS_ISONOTE_ADMISSION_EVIDENCE_PROFILE_ID;
  readonly limits: typeof PS_ISONOTE_ADMISSION_LIMITS;
  readonly measuredRows: number;
  readonly measuredColumns: number;
  readonly measuredMaxCellCodeUnits: number;
  readonly measuredMappingCount: number;
  readonly measuredDiagnosticCount: number;
  readonly admissionOutcome: PsIsonoteAdmissionOutcome;
}

export function freezePsIsonoteAdmissionEvidence(
  evidence: PsIsonoteAdmissionEvidence,
): PsIsonoteAdmissionEvidence {
  return Object.freeze({ ...evidence });
}

/** Checked against File.size before File.text() is ever called. */
export function admitPsIsonoteUploadSize(file: { size: number }): void {
  const limit = PS_ISONOTE_ADMISSION_LIMITS.maxUploadedSourceBytes;
  if (file.size > limit) {
    throw new PsIsonoteAdmissionError('REJECTED_SOURCE_BYTES', {
      metric: 'uploadedSourceBytes',
      actual: file.size,
      limit,
    });
  }
}

/** Checked against typed/pasted text length before it enters component state. */
export function admitPastedPsIsonoteText(value: string): void {
  const limit = PS_ISONOTE_ADMISSION_LIMITS.maxPastedSourceCodeUnits;
  if (value.length > limit) {
    throw new PsIsonoteAdmissionError('REJECTED_PASTED_CODE_UNITS', {
      metric: 'pastedSourceCodeUnits',
      actual: value.length,
      limit,
    });
  }
}
