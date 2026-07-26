import type { ZipArchiveInventory } from './zipTypes';
import {
  WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
  type ZipResourcePolicyV1,
} from './zipResourcePolicy';
import type {
  ZipBoundedExtractionOutcome,
  ZipExtractionDiagnostic,
} from './zipExtractionEvidence';

export interface ZipDeclaredEntryMeasurement {
  readonly ordinal: number;
  readonly path: string;
  readonly declaredRatio: number;
}

export interface ZipDeclaredResourceAdmission {
  readonly outcome: 'ADMITTED';
  readonly archiveDeclaredRatio: number;
  readonly entries: readonly ZipDeclaredEntryMeasurement[];
}

export class ZipResourceAdmissionError extends Error {
  readonly outcome: ZipBoundedExtractionOutcome;
  readonly diagnostic: ZipExtractionDiagnostic;

  constructor(
    outcome: ZipBoundedExtractionOutcome,
    diagnostic: ZipExtractionDiagnostic,
  ) {
    super(diagnostic.message);
    this.name = 'ZipResourceAdmissionError';
    this.outcome = outcome;
    this.diagnostic = diagnostic;
  }
}

export function admitZipSourceMetadata(
  sourceBytes: number,
  policy: ZipResourcePolicyV1 = WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
): void {
  if (sourceBytes > policy.limits.MAX_SOURCE_ARCHIVE_BYTES) {
    reject(
      'REJECTED_SOURCE_BYTES',
      'ZIP_SOURCE_BYTES_EXCEEDED',
      `Writer project archive exceeds the ${formatMiB(policy.limits.MAX_SOURCE_ARCHIVE_BYTES)} source-size limit.`,
    );
  }
}

export function admitZipSourceBytes(
  metadataBytes: number,
  actualBytes: number,
  policy: ZipResourcePolicyV1 = WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
): void {
  if (metadataBytes !== actualBytes) {
    reject(
      'REJECTED_SOURCE_METADATA_MISMATCH',
      'ZIP_SOURCE_METADATA_MISMATCH',
      `Writer project archive metadata reports ${metadataBytes} bytes, but ${actualBytes} bytes were read.`,
    );
  }
  admitZipSourceMetadata(actualBytes, policy);
}

export function admitDeclaredZipResources(
  inventory: ZipArchiveInventory,
  actualSourceBytes: number,
  policy: ZipResourcePolicyV1 = WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
): ZipDeclaredResourceAdmission {
  const measurements = inventory.measurements;

  if (
    inventory.sourceBytes !== actualSourceBytes ||
    measurements.SOURCE_BYTES !== actualSourceBytes
  ) {
    reject(
      'REJECTED_SOURCE_METADATA_MISMATCH',
      'ZIP_INVENTORY_SOURCE_BYTES_MISMATCH',
      'Writer project archive source bytes disagree with the structural inventory.',
    );
  }

  if (actualSourceBytes > policy.limits.MAX_SOURCE_ARCHIVE_BYTES) {
    reject(
      'REJECTED_SOURCE_BYTES',
      'ZIP_SOURCE_BYTES_EXCEEDED',
      `Writer project archive exceeds the ${formatMiB(policy.limits.MAX_SOURCE_ARCHIVE_BYTES)} source-size limit.`,
    );
  }

  if (measurements.RAW_ENTRY_COUNT > policy.limits.MAX_RAW_ENTRY_COUNT) {
    reject(
      'REJECTED_ENTRY_COUNT',
      'ZIP_RAW_ENTRY_COUNT_EXCEEDED',
      `Writer project archive contains more than ${policy.limits.MAX_RAW_ENTRY_COUNT.toLocaleString('en-US')} entries.`,
    );
  }

  const entryMeasurements: ZipDeclaredEntryMeasurement[] = [];
  const orderedEntries = [...inventory.entries].sort(
    (left, right) => left.ordinal - right.ordinal,
  );

  for (const entry of orderedEntries) {
    if (entry.compressedSize > policy.limits.MAX_ENTRY_COMPRESSED_BYTES) {
      reject(
        'REJECTED_DECLARED_MEMBER_COMPRESSED_BYTES',
        'ZIP_DECLARED_MEMBER_COMPRESSED_BYTES_EXCEEDED',
        `Writer project member "${displayPath(entry.normalizedFilename)}" declares more than ${formatMiB(policy.limits.MAX_ENTRY_COMPRESSED_BYTES)} of compressed data.`,
        [entry.ordinal],
      );
    }

    if (
      entry.uncompressedSize >
      policy.limits.MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES
    ) {
      reject(
        'REJECTED_DECLARED_MEMBER_EXPANDED_BYTES',
        'ZIP_DECLARED_MEMBER_EXPANDED_BYTES_EXCEEDED',
        `Writer project member "${displayPath(entry.normalizedFilename)}" declares more than ${formatMiB(policy.limits.MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES)} of expanded data.`,
        [entry.ordinal],
      );
    }

    const declaredRatio = declaredCompressionRatio(
      entry.compressedSize,
      entry.uncompressedSize,
    );
    entryMeasurements.push(Object.freeze({
      ordinal: entry.ordinal,
      path: entry.normalizedFilename,
      declaredRatio,
    }));

    if (declaredRatio > policy.limits.MAX_DECLARED_ENTRY_COMPRESSION_RATIO) {
      reject(
        'REJECTED_DECLARED_MEMBER_RATIO',
        'ZIP_DECLARED_MEMBER_RATIO_EXCEEDED',
        `Writer project member "${displayPath(entry.normalizedFilename)}" exceeds the declared compression-ratio limit of ${policy.limits.MAX_DECLARED_ENTRY_COMPRESSION_RATIO}.`,
        [entry.ordinal],
      );
    }
  }

  if (
    measurements.TOTAL_UNCOMPRESSED_BYTES_DECLARED >
    policy.limits.MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES
  ) {
    reject(
      'REJECTED_DECLARED_ARCHIVE_EXPANDED_BYTES',
      'ZIP_DECLARED_ARCHIVE_EXPANDED_BYTES_EXCEEDED',
      `Writer project archive declares more than ${formatMiB(policy.limits.MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES)} of expanded data.`,
    );
  }

  const archiveDeclaredRatio = declaredCompressionRatio(
    measurements.TOTAL_COMPRESSED_BYTES_DECLARED,
    measurements.TOTAL_UNCOMPRESSED_BYTES_DECLARED,
  );
  if (
    archiveDeclaredRatio >
    policy.limits.MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO
  ) {
    reject(
      'REJECTED_DECLARED_ARCHIVE_RATIO',
      'ZIP_DECLARED_ARCHIVE_RATIO_EXCEEDED',
      `Writer project archive exceeds the declared compression-ratio limit of ${policy.limits.MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO}.`,
    );
  }

  return Object.freeze({
    outcome: 'ADMITTED' as const,
    archiveDeclaredRatio,
    entries: Object.freeze(entryMeasurements),
  });
}

export function declaredCompressionRatio(
  compressedBytes: number,
  uncompressedBytes: number,
): number {
  if (compressedBytes === 0) {
    return uncompressedBytes === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return uncompressedBytes / compressedBytes;
}

function reject(
  outcome: ZipBoundedExtractionOutcome,
  code: string,
  message: string,
  entryOrdinals: readonly number[] = [],
): never {
  throw new ZipResourceAdmissionError(
    outcome,
    Object.freeze({
      severity: 'error',
      code,
      message,
      entryOrdinals: Object.freeze([...entryOrdinals]),
    }),
  );
}

function formatMiB(bytes: number): string {
  return `${bytes / 1_048_576} MiB`;
}

function displayPath(path: string): string {
  return path.replaceAll('"', '\\"');
}
