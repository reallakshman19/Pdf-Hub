import { FileAdapter, type PickedPdfFileSource } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { sortAdmissionDiagnostics } from './diagnostics';
import { createAdmissionPolicy, evaluateAdmissionMetric } from './policy';
import type {
  AdmissionDiagnostic,
  AdmissionEvidence,
  AdmissionMeasuredValue,
  AdmissionOutcomeCode,
  AdmissionPolicy,
  AdmissionPolicyAuthority,
} from './types';

export interface BatchPdfSourceMetadata {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly sourceBytes: number;
}

export interface BatchPdfPreflight {
  readonly sources: readonly PickedPdfFileSource[];
  readonly inputs: readonly BatchPdfSourceMetadata[];
  readonly selectedFileCount: number;
  readonly aggregateSourceBytes: number;
  readonly measurements: readonly AdmissionMeasuredValue[];
  readonly diagnostics: readonly AdmissionDiagnostic[];
}

export type BatchPdfPreflightResult =
  | {
      readonly outcome: 'ACCEPTED';
      readonly value: BatchPdfPreflight;
    }
  | {
      readonly outcome: Exclude<AdmissionOutcomeCode, 'ACCEPTED'>;
      readonly value: BatchPdfPreflight;
    };

export interface ValidatedBatchPdf {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly sourceBytes: number;
  readonly pageCount: number;
  readonly bytes: Uint8Array;
}

export type BatchPdfValidationResult =
  | {
      readonly outcome: 'ACCEPTED';
      readonly value: ValidatedBatchPdf;
      readonly measurements: readonly AdmissionMeasuredValue[];
      readonly diagnostics: readonly AdmissionDiagnostic[];
    }
  | {
      readonly outcome: 'REJECTED_INVALID_FORMAT';
      readonly measurements: readonly AdmissionMeasuredValue[];
      readonly diagnostics: readonly AdmissionDiagnostic[];
    };

export type BatchPdfRecordStatus = 'success' | 'failed' | 'cancelled' | 'not-run';

export interface BatchPdfEvidenceRecord {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly sourceBytes: number;
  readonly pageCount?: number;
  readonly status: BatchPdfRecordStatus;
}

export interface BatchPdfAdmissionEvidence extends AdmissionEvidence {
  readonly aggregateAuthority: AdmissionPolicyAuthority;
  readonly selectedFileCount: number;
  readonly aggregateSourceBytes: number;
  readonly processedCount: number;
  readonly failedCount: number;
  readonly unprocessedCount: number;
  readonly cancelled: boolean;
  readonly inputs: readonly BatchPdfEvidenceRecord[];
}

export const BATCH_PDF_AGGREGATE_POLICY_AUTHORITY: AdmissionPolicyAuthority = Object.freeze({
  kind: 'UNRESOLVED_POLICY',
  reason: 'No owner-approved global batch-file-count or aggregate-source-byte limit exists.',
});

export function getBatchPdfAdmissionPolicy(): AdmissionPolicy {
  return createAdmissionPolicy({
    profileId: 'PDF_BATCH',
    policyVersion: 'file-adapter-batch-pdf-100-mib-per-file-v1',
    authority: {
      kind: 'EXISTING_SOURCE_POLICY',
      sourceId: 'FileAdapter.MAX_PDF_SIZE_BYTES',
    },
    limits: {
      SOURCE_BYTES: FileAdapter.MAX_PDF_SIZE_BYTES,
    },
    archivePath: {
      caseMode: 'sensitive',
      unicodeMode: 'preserve',
    },
  });
}

export function preflightBatchPdfSources(
  sources: readonly PickedPdfFileSource[],
  signal?: AbortSignal,
): BatchPdfPreflightResult {
  const policy = getBatchPdfAdmissionPolicy();
  const diagnostics: AdmissionDiagnostic[] = [];
  const inputs = sources.map((source, inputIndex) => ({
    inputIndex,
    fileName: source.file.name,
    sourceBytes: source.file.size,
  }));
  const aggregateSourceBytes = inputs.reduce((total, input) => total + input.sourceBytes, 0);
  const measurements: AdmissionMeasuredValue[] = inputs.map((input) => ({
    metric: 'SOURCE_BYTES',
    actual: input.sourceBytes,
    limit: FileAdapter.MAX_PDF_SIZE_BYTES,
    unit: 'bytes',
    inputIndex: input.inputIndex,
    fileName: input.fileName,
  }));
  measurements.push(
    {
      metric: 'SELECTED_FILE_COUNT',
      actual: inputs.length,
      unit: 'count',
    },
    {
      metric: 'AGGREGATE_SOURCE_BYTES',
      actual: aggregateSourceBytes,
      unit: 'bytes',
    },
  );

  try {
    throwIfAborted(signal, 'batch metadata preflight');
    for (const input of inputs) {
      const sizeDiagnostic = evaluateAdmissionMetric(
        policy,
        'SOURCE_BYTES',
        input.sourceBytes,
        'bytes',
      );
      if (sizeDiagnostic) {
        diagnostics.push({
          ...sizeDiagnostic,
          phase: 'METADATA_PREFLIGHT',
          inputIndex: input.inputIndex,
          measured: sizeDiagnostic.measured
            ? {
                ...sizeDiagnostic.measured,
                inputIndex: input.inputIndex,
                fileName: input.fileName,
              }
            : undefined,
        });
      }

      const file = sources[input.inputIndex].file;
      const hasPdfExtension = input.fileName.toLowerCase().endsWith('.pdf');
      const hasPdfMime = file.type.toLowerCase() === 'application/pdf';
      if (!hasPdfExtension && !hasPdfMime) {
        diagnostics.push({
          severity: 'error',
          code: 'PDF_METADATA_TYPE_MISMATCH',
          phase: 'METADATA_PREFLIGHT',
          inputIndex: input.inputIndex,
          message: `File ${input.fileName || '(unnamed)'} is not identified as a PDF by extension or MIME type.`,
        });
        continue;
      }
      if (!hasPdfExtension) {
        diagnostics.push({
          severity: 'warning',
          code: 'PDF_EXTENSION_MISMATCH',
          phase: 'METADATA_PREFLIGHT',
          inputIndex: input.inputIndex,
          message: `File ${input.fileName || '(unnamed)'} has PDF MIME metadata but no .pdf extension.`,
        });
      }
      if (!hasPdfMime) {
        diagnostics.push({
          severity: 'warning',
          code: 'PDF_MIME_MISMATCH',
          phase: 'METADATA_PREFLIGHT',
          inputIndex: input.inputIndex,
          message: `File ${input.fileName || '(unnamed)'} has a .pdf extension but MIME type ${file.type || 'unknown'}.`,
        });
      }
    }
    throwIfAborted(signal, 'batch metadata completion');
  } catch (error) {
    if (!isOperationCancelledError(error)) throw error;
    diagnostics.push({
      severity: 'info',
      code: 'ADMISSION_CANCELLED',
      phase: 'METADATA_PREFLIGHT',
      message: 'Batch PDF metadata preflight was cancelled.',
    });
  }

  const value: BatchPdfPreflight = Object.freeze({
    sources: Object.freeze([...sources]),
    inputs: Object.freeze(inputs.map((input) => Object.freeze({ ...input }))),
    selectedFileCount: inputs.length,
    aggregateSourceBytes,
    measurements: freezeMeasurements(measurements),
    diagnostics: freezeDiagnostics(diagnostics),
  });

  if (signal?.aborted) {
    return Object.freeze({ outcome: 'CANCELLED', value });
  }
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length === 0) {
    return Object.freeze({ outcome: 'ACCEPTED', value });
  }
  const outcome = errors.some((diagnostic) => diagnostic.code === 'POLICY_LIMIT_EXCEEDED')
    ? 'REJECTED_POLICY_LIMIT'
    : 'REJECTED_INVALID_FORMAT';
  return Object.freeze({ outcome, value });
}

export async function readAndValidateBatchPdfSource(
  source: PickedPdfFileSource,
  inputIndex: number,
  signal?: AbortSignal,
): Promise<BatchPdfValidationResult> {
  const diagnostics: AdmissionDiagnostic[] = [];
  const measurements: AdmissionMeasuredValue[] = [];
  throwIfAborted(signal, `batch input ${inputIndex}: before read`);
  const arrayBuffer = await raceWithAbort(
    source.file.arrayBuffer(),
    signal,
    `batch input ${inputIndex}: read`,
  );
  throwIfAborted(signal, `batch input ${inputIndex}: after read`);
  const bytes = new Uint8Array(arrayBuffer);

  if (!hasPdfSignature(bytes)) {
    diagnostics.push({
      severity: 'error',
      code: 'PDF_SIGNATURE_MISSING',
      phase: 'FORMAT_IDENTIFICATION',
      inputIndex,
      message: `File ${source.file.name || '(unnamed)'} does not contain a PDF header signature.`,
    });
    return Object.freeze({
      outcome: 'REJECTED_INVALID_FORMAT',
      measurements: freezeMeasurements(measurements),
      diagnostics: freezeDiagnostics(diagnostics),
    });
  }

  throwIfAborted(signal, `batch input ${inputIndex}: before page count`);
  let pageCount: number;
  try {
    pageCount = await PdfEditAdapter.countPages(bytes, { signal });
  } catch (error) {
    if (isOperationCancelledError(error)) throw error;
    diagnostics.push({
      severity: 'error',
      code: 'PDF_PARSE_FAILED',
      phase: 'VALIDATION',
      inputIndex,
      message: `File ${source.file.name || '(unnamed)'} could not be parsed as a PDF.`,
    });
    return Object.freeze({
      outcome: 'REJECTED_INVALID_FORMAT',
      measurements: freezeMeasurements(measurements),
      diagnostics: freezeDiagnostics(diagnostics),
    });
  }
  throwIfAborted(signal, `batch input ${inputIndex}: after page count`);

  measurements.push({
    metric: 'PDF_PAGE_COUNT',
    actual: pageCount,
    unit: 'count',
    inputIndex,
    fileName: source.file.name,
  });
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    diagnostics.push({
      severity: 'error',
      code: 'PDF_PAGE_COUNT_INVALID',
      phase: 'VALIDATION',
      inputIndex,
      message: `File ${source.file.name || '(unnamed)'} does not contain a valid page count.`,
    });
    return Object.freeze({
      outcome: 'REJECTED_INVALID_FORMAT',
      measurements: freezeMeasurements(measurements),
      diagnostics: freezeDiagnostics(diagnostics),
    });
  }

  return Object.freeze({
    outcome: 'ACCEPTED',
    value: Object.freeze({
      inputIndex,
      fileName: source.file.name,
      sourceBytes: source.file.size,
      pageCount,
      bytes,
    }),
    measurements: freezeMeasurements(measurements),
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

export function createBatchPdfAdmissionEvidence(input: {
  readonly preflight: BatchPdfPreflight;
  readonly records: readonly BatchPdfEvidenceRecord[];
  readonly measurements: readonly AdmissionMeasuredValue[];
  readonly diagnostics: readonly AdmissionDiagnostic[];
  readonly cancelled: boolean;
}): BatchPdfAdmissionEvidence {
  const policy = getBatchPdfAdmissionPolicy();
  const processedCount = input.records.filter((record) => record.status !== 'not-run').length;
  const failedCount = input.records.filter((record) => record.status === 'failed').length;
  const unprocessedCount = input.records.filter((record) => record.status === 'not-run').length;
  return Object.freeze({
    profileId: policy.profileId,
    policyVersion: policy.policyVersion,
    authority: policy.authority,
    aggregateAuthority: BATCH_PDF_AGGREGATE_POLICY_AUTHORITY,
    selectedFileCount: input.preflight.selectedFileCount,
    aggregateSourceBytes: input.preflight.aggregateSourceBytes,
    processedCount,
    failedCount,
    unprocessedCount,
    cancelled: input.cancelled,
    measurements: freezeMeasurements(input.measurements),
    diagnostics: freezeDiagnostics(input.diagnostics),
    inputs: Object.freeze(input.records.map((record) => Object.freeze({ ...record }))),
  });
}

function freezeMeasurements(
  measurements: readonly AdmissionMeasuredValue[],
): readonly AdmissionMeasuredValue[] {
  return Object.freeze(measurements.map((measurement) => Object.freeze({ ...measurement })));
}

function freezeDiagnostics(
  diagnostics: readonly AdmissionDiagnostic[],
): readonly AdmissionDiagnostic[] {
  return Object.freeze(
    sortAdmissionDiagnostics(diagnostics).map((diagnostic) => Object.freeze({ ...diagnostic })),
  );
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const searchLength = Math.min(bytes.length, 1024);
  for (let index = 0; index <= searchLength - signature.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < signature.length; offset += 1) {
      if (bytes[index + offset] !== signature[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}
