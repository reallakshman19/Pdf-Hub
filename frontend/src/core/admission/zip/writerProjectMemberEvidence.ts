import type { ZipResourcePolicyV1 } from './zipResourcePolicy';
import type { ZipStructuralAdmissionOutcome } from './zipTypes';
import type {
  WriterProjectMemberProfileV1,
  WriterProjectOptionalRootFile,
  WriterProjectRequiredRootFile,
} from './writerProjectMemberProfile';

export const WRITER_PROJECT_MEMBER_ADMISSION_EVIDENCE_PROFILE_ID =
  'WRITER_PROJECT_MEMBER_ADMISSION_EVIDENCE_V1' as const;

export type WriterProjectMemberClassification =
  | 'REQUIRED_ROOT_MEMBER'
  | 'OPTIONAL_ROOT_MEMBER'
  | 'ASSET_DIRECTORY'
  | 'ASSET_MEMBER'
  | 'OCR_DIRECTORY'
  | 'OCR_COMPATIBILITY_MEMBER'
  | 'UNKNOWN_MEMBER';

export type WriterProjectMemberAdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED_UNKNOWN_MEMBER'
  | 'REJECTED_INVALID_ASSET_NAMESPACE'
  | 'REJECTED_INVALID_OCR_NAMESPACE'
  | 'REJECTED_UNEXPECTED_DIRECTORY'
  | 'REJECTED_REQUIRED_MEMBER_MISSING'
  | 'REJECTED_MEMBER_KIND'
  | 'CANCELLED'
  | 'STALE_OPERATION';

export interface WriterProjectMemberAdmissionDiagnostic {
  readonly severity: 'error' | 'info';
  readonly code: string;
  readonly message: string;
  readonly entryOrdinals: readonly number[];
}

export interface WriterProjectMemberAdmissionRecord {
  readonly ordinal: number;
  readonly normalizedPath: string;
  readonly decodedPath: string;
  readonly directory: boolean;
  readonly classification: WriterProjectMemberClassification;
  readonly role?: string;
  readonly admissionOutcome: WriterProjectMemberAdmissionOutcome;
}

export interface WriterProjectRequiredRoleStatus {
  readonly role: WriterProjectRequiredRootFile;
  readonly present: boolean;
  readonly ordinal?: number;
}

export interface WriterProjectOptionalRoleStatus {
  readonly role: WriterProjectOptionalRootFile;
  readonly present: boolean;
  readonly ordinal?: number;
}

export interface WriterProjectMemberAdmissionEvidence {
  readonly evidenceProfileId: typeof WRITER_PROJECT_MEMBER_ADMISSION_EVIDENCE_PROFILE_ID;
  readonly profileId: WriterProjectMemberProfileV1['profileId'];
  readonly profileAuthority: WriterProjectMemberProfileV1['authority'];
  readonly sourceStructuralProfileId: 'ZIP_STRUCTURAL_ADMISSION_V1';
  readonly sourceStructuralOutcome: ZipStructuralAdmissionOutcome;
  readonly sourceExtractionPolicyProfileId: ZipResourcePolicyV1['profileId'];
  readonly rawEntryCount: number;
  readonly memberRecords: readonly WriterProjectMemberAdmissionRecord[];
  readonly classificationCounts: Readonly<
    Record<WriterProjectMemberClassification, number>
  >;
  readonly requiredRoleStatus: readonly WriterProjectRequiredRoleStatus[];
  readonly optionalRoleStatus: readonly WriterProjectOptionalRoleStatus[];
  readonly assetMemberCount: number;
  readonly ocrCompatibilityMemberCount: number;
  readonly unknownMemberCount: number;
  readonly diagnostics: readonly WriterProjectMemberAdmissionDiagnostic[];
  readonly admissionOutcome: WriterProjectMemberAdmissionOutcome;
  readonly cancellationStage?: string;
}

export class WriterProjectMemberAdmissionError extends Error {
  readonly outcome: WriterProjectMemberAdmissionOutcome;
  readonly evidence: WriterProjectMemberAdmissionEvidence;

  constructor(
    evidence: WriterProjectMemberAdmissionEvidence,
    message?: string,
  ) {
    super(
      message ??
        evidence.diagnostics.at(-1)?.message ??
        'Writer project member admission failed.',
    );
    this.name = 'WriterProjectMemberAdmissionError';
    this.outcome = evidence.admissionOutcome;
    this.evidence = evidence;
  }
}

export function freezeWriterProjectMemberAdmissionEvidence(
  evidence: WriterProjectMemberAdmissionEvidence,
): WriterProjectMemberAdmissionEvidence {
  return deepFreeze({
    ...evidence,
    memberRecords: evidence.memberRecords.map((record) => ({ ...record })),
    classificationCounts: { ...evidence.classificationCounts },
    requiredRoleStatus: evidence.requiredRoleStatus.map((status) => ({
      ...status,
    })),
    optionalRoleStatus: evidence.optionalRoleStatus.map((status) => ({
      ...status,
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
