import type { ZipArchiveMeasurements } from './zipTypes';
import type { ZipResourcePolicyV1 } from './zipResourcePolicy';

export const ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID =
  'ZIP_BOUNDED_EXTRACTION_EVIDENCE_V1' as const;

export type ZipBoundedExtractionOutcome =
  | 'ADMITTED'
  | 'REJECTED_SOURCE_BYTES'
  | 'REJECTED_SOURCE_METADATA_MISMATCH'
  | 'REJECTED_ENTRY_COUNT'
  | 'REJECTED_DECLARED_MEMBER_COMPRESSED_BYTES'
  | 'REJECTED_DECLARED_MEMBER_EXPANDED_BYTES'
  | 'REJECTED_DECLARED_ARCHIVE_EXPANDED_BYTES'
  | 'REJECTED_DECLARED_MEMBER_RATIO'
  | 'REJECTED_DECLARED_ARCHIVE_RATIO'
  | 'REJECTED_ACTUAL_MEMBER_BYTES'
  | 'REJECTED_ACTUAL_ARCHIVE_BYTES'
  | 'REJECTED_ACTIVE_EXTRACTION_BYTES'
  | 'REJECTED_OUTPUT_CHUNK_BYTES'
  | 'REJECTED_CRC_MISMATCH'
  | 'REJECTED_UTF8'
  | 'EXTRACTION_FAILED'
  | 'CANCELLED'
  | 'STALE_OPERATION';

export type ZipMemberClassification =
  | 'KNOWN_PROJECT_MEMBER'
  | 'ASSET_MEMBER'
  | 'OCR_COMPATIBILITY_MEMBER'
  | 'UNCLASSIFIED_MEMBER_POLICY_DEFERRED';

export type ZipMemberExtractionOutcome =
  | 'EXTRACTED'
  | 'SKIPPED_DIRECTORY'
  | Exclude<ZipBoundedExtractionOutcome, 'ADMITTED' | 'REJECTED_SOURCE_BYTES' | 'REJECTED_SOURCE_METADATA_MISMATCH' | 'REJECTED_ENTRY_COUNT' | 'REJECTED_DECLARED_ARCHIVE_EXPANDED_BYTES' | 'REJECTED_DECLARED_ARCHIVE_RATIO'>;

export interface ZipExtractionDiagnostic {
  readonly severity: 'error' | 'info';
  readonly code: string;
  readonly message: string;
  readonly entryOrdinals: readonly number[];
}

export interface ZipMemberExtractionEvidence {
  readonly ordinal: number;
  readonly path: string;
  readonly classification: ZipMemberClassification;
  readonly compressionMethod: 0 | 8;
  readonly declaredCompressedBytes: number;
  readonly declaredUncompressedBytes: number;
  readonly declaredRatio: number;
  readonly actualExpandedBytes: number;
  readonly declaredCrc32: number;
  readonly actualCrc32: number | null;
  readonly largestOutputChunkBytes: number;
  readonly inputChunkCount: number;
  readonly outputChunkCount: number;
  readonly outcome: ZipMemberExtractionOutcome;
}

export interface ZipBoundedExtractionEvidence {
  readonly profileId: typeof ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID;
  readonly policyProfileId: ZipResourcePolicyV1['profileId'];
  readonly policyAuthority: ZipResourcePolicyV1['authority'];
  readonly policyLimits: ZipResourcePolicyV1['limits'];
  readonly sourceBytes: number;
  readonly rawEntryCount: number;
  readonly declaredArchiveMeasurements: ZipArchiveMeasurements;
  readonly declaredAdmissionOutcome: ZipBoundedExtractionOutcome;
  readonly memberEvidence: readonly ZipMemberExtractionEvidence[];
  readonly actualExpandedArchiveBytes: number;
  readonly peakActiveExtractionBytes: number;
  readonly largestOutputChunkBytes: number;
  readonly extractedMemberCount: number;
  readonly skippedDirectoryCount: number;
  readonly classifiedMemberCounts: Readonly<Record<ZipMemberClassification, number>>;
  readonly diagnostics: readonly ZipExtractionDiagnostic[];
  readonly archiveOutcome: ZipBoundedExtractionOutcome;
  readonly cancellationStage?: string;
}

export function freezeZipExtractionEvidence(
  evidence: ZipBoundedExtractionEvidence,
): ZipBoundedExtractionEvidence {
  return deepFreeze({
    ...evidence,
    policyLimits: { ...evidence.policyLimits },
    declaredArchiveMeasurements: { ...evidence.declaredArchiveMeasurements },
    memberEvidence: evidence.memberEvidence.map((member) => ({ ...member })),
    classifiedMemberCounts: { ...evidence.classifiedMemberCounts },
    diagnostics: evidence.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      entryOrdinals: [...diagnostic.entryOrdinals],
    })),
  });
}

export function rejectZipExtractionEvidence(
  admittedEvidence: ZipBoundedExtractionEvidence,
  outcome: ZipBoundedExtractionOutcome,
  diagnostic: ZipExtractionDiagnostic,
): ZipBoundedExtractionEvidence {
  return freezeZipExtractionEvidence({
    ...admittedEvidence,
    diagnostics: [...admittedEvidence.diagnostics, diagnostic],
    archiveOutcome: outcome,
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
