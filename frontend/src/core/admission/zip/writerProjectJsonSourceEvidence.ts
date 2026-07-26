import type { ZipResourcePolicyV1 } from './zipResourcePolicy';
import type { WriterProjectMemberClassification } from './writerProjectMemberEvidence';
import type { WriterProjectMemberProfileV1 } from './writerProjectMemberProfile';
import type {
  WriterProjectJsonSourcePath,
  WriterProjectJsonSourcePolicyV1,
} from './writerProjectJsonSourcePolicy';
import { ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID } from './zipExtractionEvidence';

export const WRITER_PROJECT_JSON_SOURCE_ADMISSION_EVIDENCE_PROFILE_ID =
  'WRITER_PROJECT_JSON_SOURCE_ADMISSION_EVIDENCE_V1' as const;

export type WriterProjectJsonSourceAdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED_PROFILE_MISMATCH'
  | 'REJECTED_MEMBER_METADATA_MISSING'
  | 'REJECTED_MEMBER_IDENTITY_MISMATCH'
  | 'REJECTED_JSON_SOURCE_COUNT'
  | 'REJECTED_JSON_MEMBER_BYTES'
  | 'REJECTED_TOTAL_JSON_BYTES'
  | 'REJECTED_UTF8'
  | 'CANCELLED'
  | 'STALE_OPERATION';

export type WriterProjectJsonByteAdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED'
  | 'NOT_EVALUATED';
export type WriterProjectJsonUtf8AdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED'
  | 'NOT_RUN';

export interface WriterProjectJsonSourceDiagnostic {
  readonly severity: 'error' | 'info';
  readonly code: string;
  readonly message: string;
  readonly entryOrdinals: readonly number[];
}

export interface WriterProjectJsonSourceRecord {
  readonly ordinal: number;
  readonly path: WriterProjectJsonSourcePath;
  readonly memberClassification: WriterProjectMemberClassification;
  readonly actualSourceBytes: number;
  readonly approvedByteLimit: number;
  readonly decodedCodeUnits: number;
  readonly hadUtf8Bom: boolean;
  readonly byteAdmissionOutcome: WriterProjectJsonByteAdmissionOutcome;
  readonly utf8AdmissionOutcome: WriterProjectJsonUtf8AdmissionOutcome;
}

export interface WriterProjectJsonSourceAdmissionEvidence {
  readonly evidenceProfileId: typeof WRITER_PROJECT_JSON_SOURCE_ADMISSION_EVIDENCE_PROFILE_ID;
  readonly policyProfileId: WriterProjectJsonSourcePolicyV1['profileId'];
  readonly policyAuthority: WriterProjectJsonSourcePolicyV1['authority'];
  readonly policyLimits: {
    readonly pathByteLimits: Readonly<
      Record<WriterProjectJsonSourcePath, number>
    >;
    readonly maxTotalJsonSourceBytes: number;
    readonly utf8DecodeChunkBytes: number;
    readonly maxJsonSourceCount: number;
  };
  readonly sourceMemberProfileId: WriterProjectMemberProfileV1['profileId'];
  readonly sourceExtractionPolicyId: ZipResourcePolicyV1['profileId'];
  readonly sourceExtractionEvidenceId: typeof ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID;
  readonly jsonSourceRecords: readonly WriterProjectJsonSourceRecord[];
  readonly presentJsonSourceCount: number;
  readonly aggregateJsonSourceBytes: number;
  readonly aggregateDecodedCodeUnits: number;
  readonly utf8BomCount: number;
  readonly diagnostics: readonly WriterProjectJsonSourceDiagnostic[];
  readonly admissionOutcome: WriterProjectJsonSourceAdmissionOutcome;
  readonly cancellationStage?: string;
}

export class WriterProjectJsonSourceAdmissionError extends Error {
  readonly outcome: WriterProjectJsonSourceAdmissionOutcome;
  readonly evidence: WriterProjectJsonSourceAdmissionEvidence;

  constructor(
    evidence: WriterProjectJsonSourceAdmissionEvidence,
    message?: string,
  ) {
    super(
      message ??
        evidence.diagnostics.at(-1)?.message ??
        'Writer project JSON source admission failed.',
    );
    this.name = 'WriterProjectJsonSourceAdmissionError';
    this.outcome = evidence.admissionOutcome;
    this.evidence = evidence;
  }
}

export function freezeWriterProjectJsonSourceAdmissionEvidence(
  evidence: WriterProjectJsonSourceAdmissionEvidence,
): WriterProjectJsonSourceAdmissionEvidence {
  return deepFreeze({
    ...evidence,
    policyLimits: {
      ...evidence.policyLimits,
      pathByteLimits: { ...evidence.policyLimits.pathByteLimits },
    },
    jsonSourceRecords: evidence.jsonSourceRecords.map((record) => ({
      ...record,
    })),
    diagnostics: evidence.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      entryOrdinals: [...diagnostic.entryOrdinals],
    })),
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
