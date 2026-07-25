import { FileAdapter } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { log, error as logError, warn } from '@/core/logger/service';
import type { OpenDocumentPayload } from '@/core/session/store';
import { useSessionStore } from '@/core/session/store';
import { sortAdmissionDiagnostics } from './diagnostics';
import { assertAdmissionCommitAllowed } from './operation';
import { createAdmissionPolicy, evaluateAdmissionMetric } from './policy';
import type {
  AdmissionDiagnostic,
  AdmissionEvidence,
  AdmissionMeasuredValue,
  AdmissionOutcomeCode,
  AdmissionResult,
} from './types';

export type PrimaryPdfInputSource =
  | 'LANDING_DROP'
  | 'TOOLBAR_PICKER'
  | 'WORKSPACE_PICKER'
  | 'FILE_ADAPTER';

export interface OpenedPdfDocument {
  readonly source: PrimaryPdfInputSource;
  readonly documentKey: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly pageCount: number;
  readonly saveHandle: FileSystemFileHandle | null;
}

export interface OpenPdfFileOptions {
  readonly signal?: AbortSignal;
  readonly saveHandle?: FileSystemFileHandle | null;
  readonly commit?: (payload: OpenDocumentPayload) => void;
}

export const PRIMARY_PDF_OPEN_POLICY = createAdmissionPolicy({
  profileId: 'OPEN_PDF',
  policyVersion: 'file-adapter-single-pdf-100-mib-v1',
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

let latestOpenGeneration = 0;

export async function admitAndOpenPdfFile(
  file: File,
  source: PrimaryPdfInputSource,
  options: OpenPdfFileOptions = {},
): Promise<AdmissionResult<OpenedPdfDocument>> {
  const generation = ++latestOpenGeneration;
  const measurements: AdmissionMeasuredValue[] = [
    {
      metric: 'SOURCE_BYTES',
      actual: file.size,
      limit: FileAdapter.MAX_PDF_SIZE_BYTES,
      unit: 'bytes',
    },
  ];
  const diagnostics: AdmissionDiagnostic[] = [];

  const sizeDiagnostic = evaluateAdmissionMetric(
    PRIMARY_PDF_OPEN_POLICY,
    'SOURCE_BYTES',
    file.size,
    'bytes',
  );
  if (sizeDiagnostic) {
    diagnostics.push({ ...sizeDiagnostic, phase: 'METADATA_PREFLIGHT' });
    return reject('REJECTED_POLICY_LIMIT', source, measurements, diagnostics);
  }

  const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
  const hasPdfMime = file.type.toLowerCase() === 'application/pdf';
  if (!hasPdfExtension && !hasPdfMime) {
    diagnostics.push({
      severity: 'error',
      code: 'PDF_METADATA_TYPE_MISMATCH',
      phase: 'METADATA_PREFLIGHT',
      message: `File ${file.name || '(unnamed)'} is not identified as a PDF by extension or MIME type.`,
    });
    return reject('REJECTED_INVALID_FORMAT', source, measurements, diagnostics);
  }
  if (!hasPdfExtension) {
    diagnostics.push({
      severity: 'warning',
      code: 'PDF_EXTENSION_MISMATCH',
      phase: 'METADATA_PREFLIGHT',
      message: `File ${file.name || '(unnamed)'} has PDF MIME metadata but no .pdf extension.`,
    });
  }
  if (!hasPdfMime) {
    diagnostics.push({
      severity: 'warning',
      code: 'PDF_MIME_MISMATCH',
      phase: 'METADATA_PREFLIGHT',
      message: `File ${file.name || '(unnamed)'} has a .pdf extension but MIME type ${file.type || 'unknown'}.`,
    });
  }

  try {
    throwIfAborted(options.signal, 'open PDF: metadata preflight');
    const arrayBuffer = await raceWithAbort(
      file.arrayBuffer(),
      options.signal,
      'open PDF: bounded read',
    );
    const bytes = new Uint8Array(arrayBuffer);

    if (!hasPdfSignature(bytes)) {
      diagnostics.push({
        severity: 'error',
        code: 'PDF_SIGNATURE_MISSING',
        phase: 'FORMAT_IDENTIFICATION',
        message: `File ${file.name || '(unnamed)'} does not contain a PDF header signature.`,
      });
      return reject('REJECTED_INVALID_FORMAT', source, measurements, diagnostics);
    }

    let pageCount: number;
    try {
      pageCount = await PdfEditAdapter.countPages(bytes, { signal: options.signal });
    } catch (error) {
      if (isOperationCancelledError(error)) throw error;
      diagnostics.push({
        severity: 'error',
        code: 'PDF_PARSE_FAILED',
        phase: 'VALIDATION',
        message: `File ${file.name || '(unnamed)'} could not be parsed as a PDF.`,
      });
      return reject('REJECTED_INVALID_FORMAT', source, measurements, diagnostics);
    }

    measurements.push({
      metric: 'PDF_PAGE_COUNT',
      actual: pageCount,
      unit: 'count',
    });
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      diagnostics.push({
        severity: 'error',
        code: 'PDF_PAGE_COUNT_INVALID',
        phase: 'VALIDATION',
        message: `File ${file.name || '(unnamed)'} does not contain a valid page count.`,
      });
      return reject('REJECTED_INVALID_FORMAT', source, measurements, diagnostics);
    }

    const documentKey = await raceWithAbort(
      FileAdapter.hashBytes(bytes),
      options.signal,
      'open PDF: hash document',
    );

    assertAdmissionCommitAllowed(options.signal, 'open admitted PDF');
    if (generation !== latestOpenGeneration) {
      diagnostics.push({
        severity: 'info',
        code: 'ADMISSION_STALE_OPERATION',
        phase: 'COMMIT',
        message: 'A newer PDF open operation superseded this result before commit.',
      });
      return reject('CANCELLED', source, measurements, diagnostics);
    }

    const saveHandle = options.saveHandle ?? null;
    const payload: OpenDocumentPayload = {
      documentKey,
      fileName: file.name,
      bytes,
      pageCount,
      saveHandle,
    };
    const commit = options.commit ?? useSessionStore.getState().openDocument;
    commit(payload);

    const value: OpenedPdfDocument = Object.freeze({
      source,
      documentKey,
      fileName: file.name,
      bytes,
      pageCount,
      saveHandle,
    });
    const evidence = createEvidence(measurements, diagnostics);

    log('session', 'Primary PDF admitted and opened', {
      source,
      fileName: file.name,
      sourceBytes: file.size,
      pageCount,
      documentKey,
    });

    return Object.freeze({
      outcome: 'ACCEPTED',
      value,
      evidence,
    });
  } catch (error) {
    if (isOperationCancelledError(error)) {
      diagnostics.push({
        severity: 'info',
        code: 'ADMISSION_CANCELLED',
        phase: 'COMMIT',
        message: 'PDF opening was cancelled before session commit.',
      });
      return reject('CANCELLED', source, measurements, diagnostics);
    }

    diagnostics.push({
      severity: 'error',
      code: 'ADMISSION_INTERNAL_FAILURE',
      phase: 'VALIDATION',
      message: error instanceof Error ? error.message : String(error),
    });
    logError('session', 'Primary PDF admission failed', {
      source,
      fileName: file.name,
      error: String(error),
    });
    return reject('FAILED_INTERNAL', source, measurements, diagnostics);
  }
}

export function firstAdmissionErrorMessage(
  result: AdmissionResult<unknown>,
): string | null {
  return result.evidence.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message
    ?? null;
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

function reject(
  outcome: Exclude<AdmissionOutcomeCode, 'ACCEPTED'>,
  source: PrimaryPdfInputSource,
  measurements: readonly AdmissionMeasuredValue[],
  diagnostics: readonly AdmissionDiagnostic[],
): AdmissionResult<never> {
  const evidence = createEvidence(measurements, diagnostics);
  warn('session', 'Primary PDF admission did not commit', {
    source,
    outcome,
    diagnostics: evidence.diagnostics.map((diagnostic) => diagnostic.code),
  });
  return Object.freeze({ outcome, evidence });
}

function createEvidence(
  measurements: readonly AdmissionMeasuredValue[],
  diagnostics: readonly AdmissionDiagnostic[],
): AdmissionEvidence {
  return Object.freeze({
    profileId: PRIMARY_PDF_OPEN_POLICY.profileId,
    policyVersion: PRIMARY_PDF_OPEN_POLICY.policyVersion,
    authority: PRIMARY_PDF_OPEN_POLICY.authority,
    measurements: Object.freeze(measurements.map((measurement) => Object.freeze({ ...measurement }))),
    diagnostics: Object.freeze(
      sortAdmissionDiagnostics(diagnostics).map((diagnostic) => Object.freeze({ ...diagnostic })),
    ),
  });
}
