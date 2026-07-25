export type AdmissionOutcomeCode =
  | 'ACCEPTED'
  | 'REJECTED_POLICY_LIMIT'
  | 'REJECTED_INVALID_FORMAT'
  | 'REJECTED_ARCHIVE_STRUCTURE'
  | 'REJECTED_UNSUPPORTED_FEATURE'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'FAILED_INTERNAL'
  | 'ROLLED_BACK';

export type AdmissionProfileId =
  | 'OPEN_PDF'
  | 'DONOR_PDF'
  | 'PDF_BATCH'
  | 'WRITER_PROJECT_ZIP'
  | 'ROUND_TRIP_PROJECT_PDF'
  | 'WRITER_IMAGE'
  | 'CLIPBOARD_IMAGE'
  | 'OCR_PDF'
  | 'PROJECT_ORIGINAL_PDF'
  | 'PROJECT_ASSET'
  | 'OUTPUT_SERIALIZATION';

export type AdmissionPhase =
  | 'METADATA_PREFLIGHT'
  | 'BOUNDED_READ'
  | 'FORMAT_IDENTIFICATION'
  | 'STRUCTURE_INSPECTION'
  | 'CONTENT_MEASUREMENT'
  | 'CROSS_REFERENCE_RECONCILIATION'
  | 'VALIDATION'
  | 'COMMIT'
  | 'ROLLBACK';

export type AdmissionMetric =
  | 'SOURCE_BYTES'
  | 'AGGREGATE_SOURCE_BYTES'
  | 'PDF_PAGE_COUNT'
  | 'PDF_PAGE_WIDTH'
  | 'PDF_PAGE_HEIGHT'
  | 'PDF_PAGE_AREA'
  | 'ZIP_ENTRY_COUNT'
  | 'ZIP_ENTRY_EXPANDED_BYTES'
  | 'ZIP_TOTAL_EXPANDED_BYTES'
  | 'ZIP_COMPRESSION_RATIO'
  | 'JSON_BYTES'
  | 'JSON_DEPTH'
  | 'JSON_NODE_COUNT'
  | 'IMAGE_WIDTH'
  | 'IMAGE_HEIGHT'
  | 'IMAGE_PIXELS'
  | 'IMAGE_DECODED_BYTES'
  | 'WRITER_ELEMENT_COUNT'
  | 'WRITER_ASSET_COUNT'
  | 'OCR_PAGE_COUNT'
  | 'OCR_BLOCK_COUNT'
  | 'OCR_WORD_COUNT'
  | 'OCR_CORRECTION_COUNT'
  | 'OCR_REGION_COUNT'
  | 'OCR_CANDIDATE_COUNT'
  | 'PROJECTED_OUTPUT_BYTES'
  | 'PEAK_RESIDENT_BYTES';

export type AdmissionDiagnosticSeverity = 'info' | 'warning' | 'error';

export type AdmissionDiagnosticCode =
  | 'POLICY_LIMIT_UNCONFIGURED'
  | 'POLICY_LIMIT_INVALID'
  | 'POLICY_LIMIT_EXCEEDED'
  | 'ADMISSION_MEASUREMENT_INVALID'
  | 'ARCHIVE_PATH_EMPTY'
  | 'ARCHIVE_PATH_CONTROL_CHARACTER'
  | 'ARCHIVE_PATH_ABSOLUTE'
  | 'ARCHIVE_PATH_DRIVE_QUALIFIED'
  | 'ARCHIVE_PATH_EMPTY_SEGMENT'
  | 'ARCHIVE_PATH_DOT_SEGMENT'
  | 'ARCHIVE_PATH_TRAVERSAL'
  | 'ARCHIVE_PATH_DUPLICATE'
  | 'ARCHIVE_PATH_COLLISION'
  | 'ARCHIVE_FILE_DIRECTORY_COLLISION'
  | 'ADMISSION_OPERATION_STALE'
  | 'ADMISSION_OPERATION_NOT_VALIDATED'
  | 'ADMISSION_OPERATION_ALREADY_COMMITTED'
  | 'ADMISSION_OPERATION_TERMINAL';

export interface AdmissionMeasuredValue {
  readonly metric: AdmissionMetric;
  readonly actual: number;
  readonly limit?: number;
  readonly unit: 'bytes' | 'count' | 'pixels' | 'ratio' | 'points' | 'nodes';
}

export interface AdmissionDiagnostic {
  readonly severity: AdmissionDiagnosticSeverity;
  readonly code: AdmissionDiagnosticCode;
  readonly phase: AdmissionPhase;
  readonly message: string;
  readonly inputIndex?: number;
  readonly path?: string;
  readonly measured?: AdmissionMeasuredValue;
}

export interface AdmissionPolicy {
  readonly profileId: AdmissionProfileId;
  readonly policyVersion: string;
  readonly limits: Readonly<Partial<Record<AdmissionMetric, number>>>;
  readonly archivePath: ArchivePathPolicy;
}

export interface ArchivePathPolicy {
  readonly caseMode: 'sensitive' | 'ascii-insensitive';
  readonly unicodeMode: 'preserve' | 'nfc';
}

export interface AdmissionEvidence {
  readonly profileId: AdmissionProfileId;
  readonly policyVersion: string;
  readonly measurements: readonly AdmissionMeasuredValue[];
  readonly diagnostics: readonly AdmissionDiagnostic[];
}

export interface AcceptedAdmissionResult<T> {
  readonly outcome: 'ACCEPTED';
  readonly value: T;
  readonly evidence: AdmissionEvidence;
}

export interface RejectedAdmissionResult {
  readonly outcome: Exclude<AdmissionOutcomeCode, 'ACCEPTED'>;
  readonly evidence: AdmissionEvidence;
}

export type AdmissionResult<T> =
  | AcceptedAdmissionResult<T>
  | RejectedAdmissionResult;

export interface AdmissionOperationIdentity {
  readonly operationId: string;
  readonly generation: number;
}
