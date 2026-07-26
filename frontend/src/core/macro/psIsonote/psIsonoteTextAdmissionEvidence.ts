import type {
  PsIsonoteTextAdmissionLimits,
  PsIsonoteTextAdmissionPolicyV1,
} from './psIsonoteTextAdmissionPolicy';

export const PS_ISONOTE_TEXT_ADMISSION_EVIDENCE_PROFILE_ID =
  'PS_ISONOTE_TEXT_ADMISSION_EVIDENCE_V1' as const;

export type PsIsonoteTextInputKind = 'FILE' | 'PASTE' | 'SAMPLE';
export type PsIsonoteDelimiter = ',' | '\t' | ';' | '|';

export type PsIsonoteTextAdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED_SOURCE_TYPE'
  | 'REJECTED_SOURCE_BYTES'
  | 'REJECTED_UTF8'
  | 'REJECTED_ROW_COUNT'
  | 'REJECTED_COLUMN_COUNT'
  | 'REJECTED_CELL_BYTES'
  | 'REJECTED_MAPPING_COUNT';

export interface PsIsonoteTextAdmissionDiagnostic {
  readonly code: PsIsonoteTextAdmissionOutcome | 'SEMANTIC_PARSE_ERROR';
  readonly message: string;
  readonly observed?: number;
  readonly limit?: number;
}

export interface PsIsonoteTextAdmissionEvidenceV1 {
  readonly evidenceProfileId: typeof PS_ISONOTE_TEXT_ADMISSION_EVIDENCE_PROFILE_ID;
  readonly policyProfileId: PsIsonoteTextAdmissionPolicyV1['profileId'];
  readonly policyAuthority: PsIsonoteTextAdmissionPolicyV1['authority'];
  readonly limits: PsIsonoteTextAdmissionLimits;
  readonly inputKind: PsIsonoteTextInputKind;
  readonly sourceName?: string;
  readonly sourceUtf8Bytes: number;
  readonly decodedCodeUnits: number;
  readonly hadUtf8Bom: boolean;
  readonly detectedDelimiter: PsIsonoteDelimiter;
  readonly logicalRowCount: number;
  readonly maximumObservedColumns: number;
  readonly maximumObservedCellUtf8Bytes: number;
  readonly uniqueMappingCount: number;
  readonly totalWarningCount: number;
  readonly retainedWarningCount: number;
  readonly admissionOutcome: PsIsonoteTextAdmissionOutcome;
  readonly diagnostics: readonly PsIsonoteTextAdmissionDiagnostic[];
}

export interface PsIsonoteTextAdmissionEvidenceInput {
  readonly policy: PsIsonoteTextAdmissionPolicyV1;
  readonly inputKind: PsIsonoteTextInputKind;
  readonly sourceName?: string;
  readonly sourceUtf8Bytes: number;
  readonly decodedCodeUnits: number;
  readonly hadUtf8Bom: boolean;
  readonly detectedDelimiter: PsIsonoteDelimiter;
  readonly logicalRowCount: number;
  readonly maximumObservedColumns: number;
  readonly maximumObservedCellUtf8Bytes: number;
  readonly uniqueMappingCount: number;
  readonly totalWarningCount: number;
  readonly retainedWarningCount: number;
  readonly admissionOutcome: PsIsonoteTextAdmissionOutcome;
  readonly diagnostics?: readonly PsIsonoteTextAdmissionDiagnostic[];
}

export function freezePsIsonoteTextAdmissionEvidence(
  input: PsIsonoteTextAdmissionEvidenceInput,
): PsIsonoteTextAdmissionEvidenceV1 {
  const diagnostics = Object.freeze(
    (input.diagnostics ?? []).map((diagnostic) => Object.freeze({ ...diagnostic })),
  );
  return Object.freeze({
    evidenceProfileId: PS_ISONOTE_TEXT_ADMISSION_EVIDENCE_PROFILE_ID,
    policyProfileId: input.policy.profileId,
    policyAuthority: input.policy.authority,
    limits: Object.freeze({ ...input.policy.limits }),
    inputKind: input.inputKind,
    ...(input.sourceName ? { sourceName: input.sourceName } : {}),
    sourceUtf8Bytes: input.sourceUtf8Bytes,
    decodedCodeUnits: input.decodedCodeUnits,
    hadUtf8Bom: input.hadUtf8Bom,
    detectedDelimiter: input.detectedDelimiter,
    logicalRowCount: input.logicalRowCount,
    maximumObservedColumns: input.maximumObservedColumns,
    maximumObservedCellUtf8Bytes: input.maximumObservedCellUtf8Bytes,
    uniqueMappingCount: input.uniqueMappingCount,
    totalWarningCount: input.totalWarningCount,
    retainedWarningCount: input.retainedWarningCount,
    admissionOutcome: input.admissionOutcome,
    diagnostics,
  });
}
