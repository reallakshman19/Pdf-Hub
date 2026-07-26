import { Inflate } from 'fflate';
import type { ZipArchiveEntryInventory, ZipArchiveInventory } from './zipTypes';
import type { ZipDeclaredResourceAdmission } from './zipDeclaredResourceAdmission';
import { declaredCompressionRatio } from './zipDeclaredResourceAdmission';
import {
  WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
  type ZipResourcePolicyV1,
} from './zipResourcePolicy';
import { ZipCrc32 } from './zipCrc32';
import {
  ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID,
  ZipBoundedExtractionError,
  freezeZipExtractionEvidence,
  type ZipBoundedExtractionEvidence,
  type ZipBoundedExtractionOutcome,
  type ZipExtractionDiagnostic,
  type ZipMemberClassification,
  type ZipMemberExtractionEvidence,
} from './zipExtractionEvidence';
import {
  BoundedZipMemberSet,
  classifyZipMember,
  type BoundedZipMember,
} from './zipMemberSet';

export interface ZipExtractionOperation {
  readonly operationId: string;
  readonly generation: number;
  readonly signal?: AbortSignal;
  readonly isCurrent: () => boolean;
  readonly isMounted: () => boolean;
}

export interface ZipInflater {
  push(chunk: Uint8Array, final: boolean): void;
  release(): void;
}

export type ZipInflaterFactory = (
  onData: (chunk: Uint8Array, final: boolean) => void,
) => ZipInflater;

export interface ZipBoundedExtractionOptions {
  readonly policy?: ZipResourcePolicyV1;
  readonly inflaterFactory?: ZipInflaterFactory;
}

export interface ZipBoundedExtractionResult {
  readonly memberSet: BoundedZipMemberSet;
  readonly evidence: ZipBoundedExtractionEvidence;
}

interface MemberProgress {
  actualExpandedBytes: number;
  actualCrc32: number | null;
  largestOutputChunkBytes: number;
  inputChunkCount: number;
  outputChunkCount: number;
  streamCompleted: boolean;
}

class PendingExtractionFailure extends Error {
  constructor(
    readonly outcome: ZipBoundedExtractionOutcome,
    readonly code: string,
    message: string,
    readonly cancellationStage?: string,
  ) {
    super(message);
    this.name = 'PendingExtractionFailure';
  }
}

export async function extractZipMembersBounded(
  sourceBytes: Uint8Array,
  inventory: ZipArchiveInventory,
  declaredAdmission: ZipDeclaredResourceAdmission,
  operation: ZipExtractionOperation,
  options: ZipBoundedExtractionOptions = {},
): Promise<ZipBoundedExtractionResult> {
  const policy = options.policy ?? WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1;
  const inflaterFactory = options.inflaterFactory ?? createFflateInflater;
  const memberEvidence: ZipMemberExtractionEvidence[] = [];
  const diagnostics: ZipExtractionDiagnostic[] = [];
  const ownedMembers: BoundedZipMember[] = [];
  const classifiedMemberCounts = emptyClassificationCounts();
  let archiveActualExpandedBytes = 0;
  let peakActiveExtractionBytes = 0;
  let largestOutputChunkBytes = 0;
  let extractedMemberCount = 0;
  let skippedDirectoryCount = 0;

  const orderedEntries = [...inventory.entries].sort(
    (left, right) => left.ordinal - right.ordinal,
  );

  try {
    assertOperationCurrent(operation, 'before first ZIP member');

    for (const entry of orderedEntries) {
      assertOperationCurrent(operation, `before ZIP member ${entry.ordinal}`);
      const classification = classifyZipMember(entry.normalizedFilename);
      const declaredRatio = declaredCompressionRatio(
        entry.compressedSize,
        entry.uncompressedSize,
      );

      if (entry.directory) {
        skippedDirectoryCount += 1;
        memberEvidence.push(freezeMemberEvidence({
          ordinal: entry.ordinal,
          path: entry.normalizedFilename,
          classification,
          compressionMethod: compressionMethod(entry),
          declaredCompressedBytes: entry.compressedSize,
          declaredUncompressedBytes: entry.uncompressedSize,
          declaredRatio,
          actualExpandedBytes: 0,
          declaredCrc32: entry.crc32,
          actualCrc32: null,
          largestOutputChunkBytes: 0,
          inputChunkCount: 0,
          outputChunkCount: 0,
          outcome: 'SKIPPED_DIRECTORY',
        }));
        continue;
      }

      const progress: MemberProgress = {
        actualExpandedBytes: 0,
        actualCrc32: null,
        largestOutputChunkBytes: 0,
        inputChunkCount: 0,
        outputChunkCount: 0,
        streamCompleted: entry.compressionMethod === 0,
      };

      try {
        const bytes = extractRegularMember(
          sourceBytes,
          entry,
          operation,
          policy,
          inflaterFactory,
          progress,
          () => archiveActualExpandedBytes,
          (nextArchiveBytes) => {
            archiveActualExpandedBytes = nextArchiveBytes;
          },
          (activeBytes) => {
            peakActiveExtractionBytes = Math.max(
              peakActiveExtractionBytes,
              activeBytes,
            );
          },
          (outputChunkBytes) => {
            largestOutputChunkBytes = Math.max(
              largestOutputChunkBytes,
              outputChunkBytes,
            );
          },
        );

        const actualCrc32 = progress.actualCrc32 ?? 0;
        ownedMembers.push(Object.freeze({
          ordinal: entry.ordinal,
          path: entry.normalizedFilename,
          compressionMethod: compressionMethod(entry),
          declaredCompressedBytes: entry.compressedSize,
          declaredUncompressedBytes: entry.uncompressedSize,
          actualExpandedBytes: progress.actualExpandedBytes,
          declaredCrc32: entry.crc32,
          actualCrc32,
          bytes,
        }));
        classifiedMemberCounts[classification] += 1;
        extractedMemberCount += 1;
        memberEvidence.push(freezeMemberEvidence({
          ordinal: entry.ordinal,
          path: entry.normalizedFilename,
          classification,
          compressionMethod: compressionMethod(entry),
          declaredCompressedBytes: entry.compressedSize,
          declaredUncompressedBytes: entry.uncompressedSize,
          declaredRatio,
          actualExpandedBytes: progress.actualExpandedBytes,
          declaredCrc32: entry.crc32,
          actualCrc32,
          largestOutputChunkBytes: progress.largestOutputChunkBytes,
          inputChunkCount: progress.inputChunkCount,
          outputChunkCount: progress.outputChunkCount,
          outcome: 'EXTRACTED',
        }));
      } catch (error) {
        const failure = normalizeFailure(error, entry);
        memberEvidence.push(freezeMemberEvidence({
          ordinal: entry.ordinal,
          path: entry.normalizedFilename,
          classification,
          compressionMethod: compressionMethod(entry),
          declaredCompressedBytes: entry.compressedSize,
          declaredUncompressedBytes: entry.uncompressedSize,
          declaredRatio,
          actualExpandedBytes: progress.actualExpandedBytes,
          declaredCrc32: entry.crc32,
          actualCrc32: progress.actualCrc32,
          largestOutputChunkBytes: progress.largestOutputChunkBytes,
          inputChunkCount: progress.inputChunkCount,
          outputChunkCount: progress.outputChunkCount,
          outcome: failure.outcome,
        }));
        diagnostics.push(Object.freeze({
          severity: 'error' as const,
          code: failure.code,
          message: failure.message,
          entryOrdinals: Object.freeze([entry.ordinal]),
        }));
        throw new ZipBoundedExtractionError(
          buildEvidence(
            inventory,
            policy,
            memberEvidence,
            diagnostics,
            archiveActualExpandedBytes,
            peakActiveExtractionBytes,
            largestOutputChunkBytes,
            extractedMemberCount,
            skippedDirectoryCount,
            classifiedMemberCounts,
            failure.outcome,
            failure.cancellationStage,
          ),
          failure.message,
        );
      }
    }

    assertOperationCurrent(operation, 'before completed ZIP member-set registration');
    const evidence = buildEvidence(
      inventory,
      policy,
      memberEvidence,
      diagnostics,
      archiveActualExpandedBytes,
      peakActiveExtractionBytes,
      largestOutputChunkBytes,
      extractedMemberCount,
      skippedDirectoryCount,
      classifiedMemberCounts,
      'ADMITTED',
    );
    const memberSet = BoundedZipMemberSet.create(ownedMembers, evidence);
    return Object.freeze({ memberSet, evidence });
  } catch (error) {
    if (error instanceof ZipBoundedExtractionError) throw error;
    const failure = normalizeFailure(error);
    diagnostics.push(Object.freeze({
      severity: 'error' as const,
      code: failure.code,
      message: failure.message,
      entryOrdinals: Object.freeze([]),
    }));
    throw new ZipBoundedExtractionError(
      buildEvidence(
        inventory,
        policy,
        memberEvidence,
        diagnostics,
        archiveActualExpandedBytes,
        peakActiveExtractionBytes,
        largestOutputChunkBytes,
        extractedMemberCount,
        skippedDirectoryCount,
        classifiedMemberCounts,
        failure.outcome,
        failure.cancellationStage,
      ),
      failure.message,
    );
  } finally {
    if (memberEvidence.some((member) => member.outcome !== 'EXTRACTED' && member.outcome !== 'SKIPPED_DIRECTORY')) {
      ownedMembers.length = 0;
    }
  }
}

function extractRegularMember(
  sourceBytes: Uint8Array,
  entry: ZipArchiveEntryInventory,
  operation: ZipExtractionOperation,
  policy: ZipResourcePolicyV1,
  inflaterFactory: ZipInflaterFactory,
  progress: MemberProgress,
  getArchiveActualBytes: () => number,
  setArchiveActualBytes: (bytes: number) => void,
  recordActiveBytes: (bytes: number) => void,
  recordOutputChunkBytes: (bytes: number) => void,
): Uint8Array {
  const range = entry.compressedDataRange;
  if (!range) {
    throw new PendingExtractionFailure(
      'EXTRACTION_FAILED',
      'ZIP_COMPRESSED_RANGE_MISSING',
      `Writer project member "${entry.normalizedFilename}" has no admitted compressed-data range.`,
    );
  }

  const destination = new Uint8Array(entry.uncompressedSize);
  if (destination.byteLength > policy.limits.MAX_ACTIVE_EXTRACTION_BYTES) {
    throw new PendingExtractionFailure(
      'REJECTED_ACTIVE_EXTRACTION_BYTES',
      'ZIP_ACTIVE_EXTRACTION_BYTES_EXCEEDED',
      `Writer project member "${entry.normalizedFilename}" exceeded the active extraction-byte limit.`,
    );
  }
  recordActiveBytes(destination.byteLength);

  const crc = new ZipCrc32();
  const compressed = sourceBytes.subarray(range.start, range.end);

  const retainOutput = (chunk: Uint8Array): void => {
    assertOperationCurrent(operation, `before retaining output for ZIP member ${entry.ordinal}`);
    if (chunk.byteLength > policy.limits.MAX_INFLATE_OUTPUT_CHUNK_BYTES) {
      throw new PendingExtractionFailure(
        'REJECTED_OUTPUT_CHUNK_BYTES',
        'ZIP_OUTPUT_CHUNK_BYTES_EXCEEDED',
        `Writer project member "${entry.normalizedFilename}" emitted an output chunk larger than ${formatMiB(policy.limits.MAX_INFLATE_OUTPUT_CHUNK_BYTES)}.`,
      );
    }

    const nextMemberActual = progress.actualExpandedBytes + chunk.byteLength;
    const nextArchiveActual = getArchiveActualBytes() + chunk.byteLength;
    const nextActiveExtraction = destination.byteLength + chunk.byteLength;

    if (nextMemberActual > policy.limits.MAX_ACTUAL_EXPANDED_MEMBER_BYTES) {
      throw new PendingExtractionFailure(
        'REJECTED_ACTUAL_MEMBER_BYTES',
        'ZIP_ACTUAL_MEMBER_BYTES_EXCEEDED',
        `Writer project member "${entry.normalizedFilename}" exceeded the ${formatMiB(policy.limits.MAX_ACTUAL_EXPANDED_MEMBER_BYTES)} actual expansion limit.`,
      );
    }
    if (nextArchiveActual > policy.limits.MAX_ACTUAL_EXPANDED_ARCHIVE_BYTES) {
      throw new PendingExtractionFailure(
        'REJECTED_ACTUAL_ARCHIVE_BYTES',
        'ZIP_ACTUAL_ARCHIVE_BYTES_EXCEEDED',
        `Writer project archive exceeded the ${formatMiB(policy.limits.MAX_ACTUAL_EXPANDED_ARCHIVE_BYTES)} actual expansion limit.`,
      );
    }
    if (nextActiveExtraction > policy.limits.MAX_ACTIVE_EXTRACTION_BYTES) {
      throw new PendingExtractionFailure(
        'REJECTED_ACTIVE_EXTRACTION_BYTES',
        'ZIP_ACTIVE_EXTRACTION_BYTES_EXCEEDED',
        `Writer project member "${entry.normalizedFilename}" exceeded the active extraction-byte limit.`,
      );
    }
    if (nextMemberActual > destination.byteLength) {
      throw new PendingExtractionFailure(
        'EXTRACTION_FAILED',
        'ZIP_ACTUAL_SIZE_EXCEEDS_DECLARATION',
        `Writer project member "${entry.normalizedFilename}" expanded beyond its declared size.`,
      );
    }

    destination.set(chunk, progress.actualExpandedBytes);
    crc.update(chunk);
    progress.actualExpandedBytes = nextMemberActual;
    progress.largestOutputChunkBytes = Math.max(
      progress.largestOutputChunkBytes,
      chunk.byteLength,
    );
    progress.outputChunkCount += 1;
    setArchiveActualBytes(nextArchiveActual);
    recordActiveBytes(nextActiveExtraction);
    recordOutputChunkBytes(chunk.byteLength);
  };

  if (entry.compressionMethod === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      throw new PendingExtractionFailure(
        'EXTRACTION_FAILED',
        'ZIP_STORED_SIZE_MISMATCH',
        `Writer project stored member "${entry.normalizedFilename}" has unequal compressed and expanded declarations.`,
      );
    }
    for (
      let offset = 0;
      offset < compressed.byteLength;
      offset += policy.limits.COMPRESSED_INPUT_CHUNK_BYTES
    ) {
      assertOperationCurrent(operation, `before stored input chunk for ZIP member ${entry.ordinal}`);
      const end = Math.min(
        compressed.byteLength,
        offset + policy.limits.COMPRESSED_INPUT_CHUNK_BYTES,
      );
      progress.inputChunkCount += 1;
      retainOutput(compressed.subarray(offset, end));
    }
  } else if (entry.compressionMethod === 8) {
    let inflater: ZipInflater | null = null;
    try {
      inflater = inflaterFactory((chunk, final) => {
        retainOutput(chunk);
        if (final) progress.streamCompleted = true;
        assertOperationCurrent(operation, `after inflater callback for ZIP member ${entry.ordinal}`);
      });
      if (compressed.byteLength === 0) {
        assertOperationCurrent(operation, `before empty DEFLATE input for ZIP member ${entry.ordinal}`);
        progress.inputChunkCount += 1;
        inflater.push(new Uint8Array(), true);
      } else {
        for (
          let offset = 0;
          offset < compressed.byteLength;
          offset += policy.limits.COMPRESSED_INPUT_CHUNK_BYTES
        ) {
          assertOperationCurrent(operation, `before DEFLATE input chunk for ZIP member ${entry.ordinal}`);
          const end = Math.min(
            compressed.byteLength,
            offset + policy.limits.COMPRESSED_INPUT_CHUNK_BYTES,
          );
          progress.inputChunkCount += 1;
          inflater.push(compressed.subarray(offset, end), end === compressed.byteLength);
          assertOperationCurrent(operation, `after DEFLATE input chunk for ZIP member ${entry.ordinal}`);
        }
      }
    } finally {
      inflater?.release();
      inflater = null;
    }
  } else {
    throw new PendingExtractionFailure(
      'EXTRACTION_FAILED',
      'ZIP_COMPRESSION_METHOD_UNEXPECTED',
      `Writer project member "${entry.normalizedFilename}" reached extraction with an unsupported compression method.`,
    );
  }

  assertOperationCurrent(operation, `before finalizing ZIP member ${entry.ordinal}`);
  if (!progress.streamCompleted) {
    throw new PendingExtractionFailure(
      'EXTRACTION_FAILED',
      'ZIP_DEFLATE_STREAM_INCOMPLETE',
      `Writer project member "${entry.normalizedFilename}" did not reach a complete DEFLATE stream.`,
    );
  }
  if (progress.actualExpandedBytes !== entry.uncompressedSize) {
    throw new PendingExtractionFailure(
      'EXTRACTION_FAILED',
      'ZIP_ACTUAL_SIZE_MISMATCH',
      `Writer project member "${entry.normalizedFilename}" expanded to ${progress.actualExpandedBytes} bytes instead of its declared ${entry.uncompressedSize} bytes.`,
    );
  }

  progress.actualCrc32 = crc.digest();
  if (progress.actualCrc32 !== entry.crc32) {
    throw new PendingExtractionFailure(
      'REJECTED_CRC_MISMATCH',
      'ZIP_MEMBER_CRC32_MISMATCH',
      `Writer project member "${entry.normalizedFilename}" failed CRC-32 verification.`,
    );
  }
  return destination;
}

function createFflateInflater(
  onData: (chunk: Uint8Array, final: boolean) => void,
): ZipInflater {
  let inflater: Inflate | null = new Inflate(onData);
  return {
    push(chunk, final) {
      if (!inflater) throw new Error('ZIP inflater was already released.');
      inflater.push(chunk, final);
    },
    release() {
      inflater = null;
    },
  };
}

function assertOperationCurrent(
  operation: ZipExtractionOperation,
  stage: string,
): void {
  const reason = operation.signal?.reason;
  if (operation.signal?.aborted) {
    const superseded = typeof reason === 'string' && /supersed/i.test(reason);
    throw new PendingExtractionFailure(
      superseded ? 'STALE_OPERATION' : 'CANCELLED',
      superseded ? 'ZIP_EXTRACTION_STALE_OPERATION' : 'ZIP_EXTRACTION_CANCELLED',
      superseded
        ? 'Writer project ZIP extraction was superseded by a newer operation.'
        : 'Writer project ZIP extraction was cancelled.',
      stage,
    );
  }
  if (!operation.isMounted()) {
    throw new PendingExtractionFailure(
      'CANCELLED',
      'ZIP_EXTRACTION_COMPONENT_UNMOUNTED',
      'Writer project ZIP extraction was cancelled because the component unmounted.',
      stage,
    );
  }
  if (!operation.isCurrent()) {
    throw new PendingExtractionFailure(
      'STALE_OPERATION',
      'ZIP_EXTRACTION_STALE_OPERATION',
      'Writer project ZIP extraction was superseded by a newer operation.',
      stage,
    );
  }
}

function normalizeFailure(
  error: unknown,
  entry?: ZipArchiveEntryInventory,
): PendingExtractionFailure {
  if (error instanceof PendingExtractionFailure) return error;
  return new PendingExtractionFailure(
    'EXTRACTION_FAILED',
    'ZIP_MEMBER_EXTRACTION_FAILED',
    entry
      ? `Writer project member "${entry.normalizedFilename}" could not be extracted: ${errorMessage(error)}`
      : `Writer project archive extraction failed: ${errorMessage(error)}`,
  );
}

function buildEvidence(
  inventory: ZipArchiveInventory,
  policy: ZipResourcePolicyV1,
  memberEvidence: readonly ZipMemberExtractionEvidence[],
  diagnostics: readonly ZipExtractionDiagnostic[],
  actualExpandedArchiveBytes: number,
  peakActiveExtractionBytes: number,
  largestOutputChunkBytes: number,
  extractedMemberCount: number,
  skippedDirectoryCount: number,
  classifiedMemberCounts: Readonly<Record<ZipMemberClassification, number>>,
  archiveOutcome: ZipBoundedExtractionOutcome,
  cancellationStage?: string,
): ZipBoundedExtractionEvidence {
  return freezeZipExtractionEvidence({
    profileId: ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID,
    policyProfileId: policy.profileId,
    policyAuthority: policy.authority,
    policyLimits: policy.limits,
    sourceBytes: inventory.sourceBytes,
    rawEntryCount: inventory.measurements.RAW_ENTRY_COUNT,
    declaredArchiveMeasurements: inventory.measurements,
    declaredAdmissionOutcome: 'ADMITTED',
    memberEvidence,
    actualExpandedArchiveBytes,
    peakActiveExtractionBytes,
    largestOutputChunkBytes,
    extractedMemberCount,
    skippedDirectoryCount,
    classifiedMemberCounts,
    diagnostics,
    archiveOutcome,
    ...(cancellationStage ? { cancellationStage } : {}),
  });
}

function freezeMemberEvidence(
  evidence: ZipMemberExtractionEvidence,
): ZipMemberExtractionEvidence {
  return Object.freeze({ ...evidence });
}

function compressionMethod(entry: ZipArchiveEntryInventory): 0 | 8 {
  if (entry.compressionMethod === 0 || entry.compressionMethod === 8) {
    return entry.compressionMethod;
  }
  throw new Error(`Unsupported compression method ${entry.compressionMethod}.`);
}

function emptyClassificationCounts(): Record<ZipMemberClassification, number> {
  return {
    KNOWN_PROJECT_MEMBER: 0,
    ASSET_MEMBER: 0,
    OCR_COMPATIBILITY_MEMBER: 0,
    UNCLASSIFIED_MEMBER_POLICY_DEFERRED: 0,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatMiB(bytes: number): string {
  return `${bytes / 1_048_576} MiB`;
}
