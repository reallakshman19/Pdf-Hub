import { FileAdapter, type PickedPdfFileSource } from '@/adapters/file/FileAdapter';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { log, error as logError, warn } from '@/core/logger/service';
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

export type DonorCommandTarget = 'MERGE_PDF' | 'INSERT_PAGES' | 'REPLACE_PAGE';

export type DonorInputSource =
  | 'TOOLBAR_ORGANIZE'
  | 'THUMBNAIL_CONTEXT_MENU'
  | 'COMMAND_CALLER';

export interface AdmittedDonorPdf {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly sourceBytes: number;
  readonly pageCount: number;
  readonly ownerDocumentKey: string;
  readonly commandTarget: DonorCommandTarget;
  readonly handle: FileSystemFileHandle | null;
}

export interface DonorAdmissionInputEvidence {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly sourceBytes: number;
  readonly pageCount?: number;
  readonly outcome: AdmissionOutcomeCode;
  readonly diagnostics: readonly AdmissionDiagnostic[];
}

export interface DonorAdmissionEvidence extends AdmissionEvidence {
  readonly commandTarget: DonorCommandTarget;
  readonly aggregateAuthority: AdmissionPolicyAuthority;
  readonly aggregateSourceBytes: number;
  readonly inputs: readonly DonorAdmissionInputEvidence[];
}

export interface AdmittedDonorSet {
  readonly source: DonorInputSource;
  readonly commandTarget: DonorCommandTarget;
  readonly ownerDocumentKey: string;
  readonly generation: number;
  readonly donors: readonly AdmittedDonorPdf[];
  readonly aggregateSourceBytes: number;
}

export type DonorAdmissionResult =
  | {
      readonly outcome: 'ACCEPTED';
      readonly value: AdmittedDonorSet;
      readonly evidence: DonorAdmissionEvidence;
    }
  | {
      readonly outcome: Exclude<AdmissionOutcomeCode, 'ACCEPTED'>;
      readonly evidence: DonorAdmissionEvidence;
    };

export interface DonorAdmissionOptions {
  readonly signal?: AbortSignal;
  readonly ownerDocumentKey: string;
  readonly isContextCurrent?: () => boolean;
}

export interface DonorDispatchCheckpointOptions {
  readonly signal?: AbortSignal;
  readonly ownerDocumentKey: string;
  readonly isContextCurrent?: () => boolean;
}

export interface ResolvedAdmittedDonorPdf {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly sourceBytes: number;
  readonly pageCount: number;
  readonly ownerDocumentKey: string;
  readonly commandTarget: DonorCommandTarget;
  readonly bytes: Uint8Array;
  readonly handle: FileSystemFileHandle | null;
}

interface StagedDonorPdf {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly sourceBytes: number;
  readonly pageCount: number;
  readonly bytes: Uint8Array;
  readonly handle: FileSystemFileHandle | null;
}

interface DonorSetLifecycle {
  readonly donorCount: number;
  consumedCount: number;
  revoked: boolean;
  signal?: AbortSignal;
  abortHandler?: () => void;
}

interface RegisteredDonorPdf extends ResolvedAdmittedDonorPdf {
  readonly generation: number;
  readonly lifecycle: DonorSetLifecycle;
}

class StaleDonorAdmissionError extends Error {
  readonly inputIndex?: number;

  constructor(message: string, inputIndex?: number) {
    super(message);
    this.name = 'StaleDonorAdmissionError';
    this.inputIndex = inputIndex;
  }
}

export class DonorAdmissionBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DonorAdmissionBoundaryError';
  }
}

const admittedDonorRegistry = new WeakMap<AdmittedDonorPdf, RegisteredDonorPdf>();
const consumedDonorRegistry = new WeakSet<AdmittedDonorPdf>();
const revokedDonorRegistry = new WeakSet<AdmittedDonorPdf>();
let latestDonorAdmissionGeneration = 0;

export const DONOR_AGGREGATE_POLICY_AUTHORITY: AdmissionPolicyAuthority = Object.freeze({
  kind: 'UNRESOLVED_POLICY',
  reason: 'No owner-approved global aggregate donor-byte limit exists for ordinary donor commands.',
});

export function getDonorPdfAdmissionPolicy(): AdmissionPolicy {
  return createAdmissionPolicy({
    profileId: 'DONOR_PDF',
    policyVersion: 'file-adapter-donor-pdf-100-mib-per-file-v1',
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

export async function admitDonorPdfFiles(
  sources: readonly PickedPdfFileSource[],
  source: DonorInputSource,
  commandTarget: DonorCommandTarget,
  options: DonorAdmissionOptions,
): Promise<DonorAdmissionResult> {
  const generation = ++latestDonorAdmissionGeneration;
  const policy = getDonorPdfAdmissionPolicy();
  const diagnostics: AdmissionDiagnostic[] = [];
  const pageCounts = new Map<number, number>();
  const aggregateSourceBytes = sources.reduce((total, item) => total + item.file.size, 0);
  const measurements: AdmissionMeasuredValue[] = sources.map((item, inputIndex) => ({
    metric: 'SOURCE_BYTES',
    actual: item.file.size,
    limit: FileAdapter.MAX_PDF_SIZE_BYTES,
    unit: 'bytes',
    inputIndex,
    fileName: item.file.name,
  }));
  measurements.push({
    metric: 'AGGREGATE_SOURCE_BYTES',
    actual: aggregateSourceBytes,
    unit: 'bytes',
  });

  for (let inputIndex = 0; inputIndex < sources.length; inputIndex += 1) {
    const file = sources[inputIndex].file;
    const sizeDiagnostic = evaluateAdmissionMetric(
      policy,
      'SOURCE_BYTES',
      file.size,
      'bytes',
    );
    if (sizeDiagnostic) {
      diagnostics.push({
        ...sizeDiagnostic,
        phase: 'METADATA_PREFLIGHT',
        inputIndex,
        measured: sizeDiagnostic.measured
          ? {
              ...sizeDiagnostic.measured,
              inputIndex,
              fileName: file.name,
            }
          : undefined,
      });
    }

    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    const hasPdfMime = file.type.toLowerCase() === 'application/pdf';
    if (!hasPdfExtension && !hasPdfMime) {
      diagnostics.push({
        severity: 'error',
        code: 'PDF_METADATA_TYPE_MISMATCH',
        phase: 'METADATA_PREFLIGHT',
        inputIndex,
        message: `File ${file.name || '(unnamed)'} is not identified as a PDF by extension or MIME type.`,
      });
    } else {
      if (!hasPdfExtension) {
        diagnostics.push({
          severity: 'warning',
          code: 'PDF_EXTENSION_MISMATCH',
          phase: 'METADATA_PREFLIGHT',
          inputIndex,
          message: `File ${file.name || '(unnamed)'} has PDF MIME metadata but no .pdf extension.`,
        });
      }
      if (!hasPdfMime) {
        diagnostics.push({
          severity: 'warning',
          code: 'PDF_MIME_MISMATCH',
          phase: 'METADATA_PREFLIGHT',
          inputIndex,
          message: `File ${file.name || '(unnamed)'} has a .pdf extension but MIME type ${file.type || 'unknown'}.`,
        });
      }
    }
  }

  if (hasAdmissionErrors(diagnostics)) {
    const outcome = diagnostics.some((item) => item.code === 'POLICY_LIMIT_EXCEEDED')
      ? 'REJECTED_POLICY_LIMIT'
      : 'REJECTED_INVALID_FORMAT';
    return rejectDonorAdmission(
      outcome,
      source,
      commandTarget,
      options.ownerDocumentKey,
      sources,
      aggregateSourceBytes,
      measurements,
      diagnostics,
      pageCounts,
    );
  }

  const staged: StagedDonorPdf[] = [];
  let currentInputIndex: number | undefined;
  let registeredSet: AdmittedDonorSet | null = null;

  try {
    for (let inputIndex = 0; inputIndex < sources.length; inputIndex += 1) {
      currentInputIndex = inputIndex;
      const picked = sources[inputIndex];
      checkpoint(generation, options, `donor ${inputIndex}: before read`, inputIndex);
      const arrayBuffer = await raceWithAbort(
        picked.file.arrayBuffer(),
        options.signal,
        `donor ${inputIndex}: read`,
      );
      checkpoint(generation, options, `donor ${inputIndex}: after read`, inputIndex);
      const bytes = new Uint8Array(arrayBuffer);

      if (!hasPdfSignature(bytes)) {
        diagnostics.push({
          severity: 'error',
          code: 'PDF_SIGNATURE_MISSING',
          phase: 'FORMAT_IDENTIFICATION',
          inputIndex,
          message: `File ${picked.file.name || '(unnamed)'} does not contain a PDF header signature.`,
        });
        return rejectDonorAdmission(
          'REJECTED_INVALID_FORMAT',
          source,
          commandTarget,
          options.ownerDocumentKey,
          sources,
          aggregateSourceBytes,
          measurements,
          diagnostics,
          pageCounts,
        );
      }

      checkpoint(generation, options, `donor ${inputIndex}: before page count`, inputIndex);
      let pageCount: number;
      try {
        pageCount = await PdfEditAdapter.countPages(bytes, { signal: options.signal });
      } catch (error) {
        if (isOperationCancelledError(error)) throw error;
        diagnostics.push({
          severity: 'error',
          code: 'PDF_PARSE_FAILED',
          phase: 'VALIDATION',
          inputIndex,
          message: `File ${picked.file.name || '(unnamed)'} could not be parsed as a PDF.`,
        });
        return rejectDonorAdmission(
          'REJECTED_INVALID_FORMAT',
          source,
          commandTarget,
          options.ownerDocumentKey,
          sources,
          aggregateSourceBytes,
          measurements,
          diagnostics,
          pageCounts,
        );
      }
      checkpoint(generation, options, `donor ${inputIndex}: after page count`, inputIndex);

      measurements.push({
        metric: 'PDF_PAGE_COUNT',
        actual: pageCount,
        unit: 'count',
        inputIndex,
        fileName: picked.file.name,
      });
      pageCounts.set(inputIndex, pageCount);
      if (!Number.isInteger(pageCount) || pageCount < 1) {
        diagnostics.push({
          severity: 'error',
          code: 'PDF_PAGE_COUNT_INVALID',
          phase: 'VALIDATION',
          inputIndex,
          message: `File ${picked.file.name || '(unnamed)'} does not contain a valid page count.`,
        });
        return rejectDonorAdmission(
          'REJECTED_INVALID_FORMAT',
          source,
          commandTarget,
          options.ownerDocumentKey,
          sources,
          aggregateSourceBytes,
          measurements,
          diagnostics,
          pageCounts,
        );
      }

      staged.push({
        inputIndex,
        fileName: picked.file.name,
        sourceBytes: picked.file.size,
        pageCount,
        bytes,
        handle: picked.handle ?? null,
      });
    }

    currentInputIndex = undefined;
    checkpoint(generation, options, 'donor set: before staging', undefined);
    const lifecycle: DonorSetLifecycle = {
      donorCount: staged.length,
      consumedCount: 0,
      revoked: false,
    };
    const donors = staged.map((item) =>
      registerAdmittedDonor(
        item,
        generation,
        options.ownerDocumentKey,
        commandTarget,
        lifecycle,
      ),
    );
    const value: AdmittedDonorSet = Object.freeze({
      source,
      commandTarget,
      ownerDocumentKey: options.ownerDocumentKey,
      generation,
      donors: Object.freeze(donors),
      aggregateSourceBytes,
    });
    registeredSet = value;
    bindDonorSetAbort(value, lifecycle, options.signal);
    checkpoint(generation, options, 'donor set: after staging', undefined);
    const evidence = createDonorEvidence(
      'ACCEPTED',
      commandTarget,
      sources,
      aggregateSourceBytes,
      measurements,
      diagnostics,
      pageCounts,
    );

    log('session', 'Donor PDF set admitted', {
      source,
      commandTarget,
      donorCount: donors.length,
      aggregateSourceBytes,
      ownerDocumentKey: options.ownerDocumentKey,
    });

    return Object.freeze({
      outcome: 'ACCEPTED',
      value,
      evidence,
    });
  } catch (error) {
    if (registeredSet) revokeAdmittedDonorSet(registeredSet);
    if (isOperationCancelledError(error)) {
      diagnostics.push({
        severity: 'info',
        code: 'ADMISSION_CANCELLED',
        phase: 'COMMIT',
        inputIndex: currentInputIndex,
        message: 'Donor PDF admission was cancelled before command dispatch.',
      });
      return rejectDonorAdmission(
        'CANCELLED',
        source,
        commandTarget,
        options.ownerDocumentKey,
        sources,
        aggregateSourceBytes,
        measurements,
        diagnostics,
        pageCounts,
      );
    }
    if (error instanceof StaleDonorAdmissionError) {
      diagnostics.push({
        severity: 'info',
        code: 'ADMISSION_STALE_OPERATION',
        phase: 'COMMIT',
        inputIndex: error.inputIndex,
        message: error.message,
      });
      return rejectDonorAdmission(
        'CANCELLED',
        source,
        commandTarget,
        options.ownerDocumentKey,
        sources,
        aggregateSourceBytes,
        measurements,
        diagnostics,
        pageCounts,
      );
    }

    diagnostics.push({
      severity: 'error',
      code: 'ADMISSION_INTERNAL_FAILURE',
      phase: 'VALIDATION',
      inputIndex: currentInputIndex,
      message: error instanceof Error ? error.message : String(error),
    });
    logError('session', 'Donor PDF admission failed', {
      source,
      commandTarget,
      error: String(error),
    });
    return rejectDonorAdmission(
      'FAILED_INTERNAL',
      source,
      commandTarget,
      options.ownerDocumentKey,
      sources,
      aggregateSourceBytes,
      measurements,
      diagnostics,
      pageCounts,
    );
  }
}

export function assertAdmittedDonorSetDispatchAllowed(
  admittedSet: AdmittedDonorSet,
  options: DonorDispatchCheckpointOptions,
): void {
  throwIfAborted(options.signal, `dispatch ${admittedSet.commandTarget}`);
  if (options.isContextCurrent && !options.isContextCurrent()) {
    throw new DonorAdmissionBoundaryError(
      'The active document changed before the donor command could be dispatched.',
    );
  }
  if (admittedSet.ownerDocumentKey !== options.ownerDocumentKey) {
    throw new DonorAdmissionBoundaryError(
      'The admitted donor set belongs to a different document context.',
    );
  }
  if (admittedSet.generation !== latestDonorAdmissionGeneration) {
    throw new DonorAdmissionBoundaryError(
      'A newer donor operation superseded this admitted donor set.',
    );
  }
  inspectAdmittedDonorPdfs(
    admittedSet.commandTarget,
    admittedSet.donors,
    options.ownerDocumentKey,
  );
}

export function inspectAdmittedDonorPdfs(
  commandTarget: DonorCommandTarget,
  donors: readonly AdmittedDonorPdf[],
  ownerDocumentKey: string | null,
): readonly ResolvedAdmittedDonorPdf[] {
  if (!ownerDocumentKey) {
    throw new DonorAdmissionBoundaryError(
      'Donor commands require an active document identity.',
    );
  }

  return donors.map((donor) => {
    if (revokedDonorRegistry.has(donor)) {
      throw new DonorAdmissionBoundaryError(
        `Donor PDF ${donor.fileName} was revoked because its owning operation was abandoned.`,
      );
    }
    if (consumedDonorRegistry.has(donor)) {
      throw new DonorAdmissionBoundaryError(
        `Donor PDF ${donor.fileName} has already been consumed by a command.`,
      );
    }
    const registered = admittedDonorRegistry.get(donor);
    if (!registered) {
      throw new DonorAdmissionBoundaryError(
        'Donor PDF bytes were not produced by the shared admission boundary.',
      );
    }
    if (registered.lifecycle.revoked) {
      throw new DonorAdmissionBoundaryError(
        `Donor PDF ${registered.fileName} was revoked because its owning operation was abandoned.`,
      );
    }
    if (registered.commandTarget !== commandTarget) {
      throw new DonorAdmissionBoundaryError(
        `Donor PDF ${registered.fileName} was admitted for ${registered.commandTarget}, not ${commandTarget}.`,
      );
    }
    if (registered.ownerDocumentKey !== ownerDocumentKey) {
      throw new DonorAdmissionBoundaryError(
        `Donor PDF ${registered.fileName} belongs to a stale document context.`,
      );
    }
    if (registered.generation !== latestDonorAdmissionGeneration) {
      throw new DonorAdmissionBoundaryError(
        `Donor PDF ${registered.fileName} was superseded by a newer donor operation.`,
      );
    }
    return registered;
  });
}

export function consumeAdmittedDonorPdfs(
  commandTarget: DonorCommandTarget,
  donors: readonly AdmittedDonorPdf[],
  ownerDocumentKey: string | null,
): readonly ResolvedAdmittedDonorPdf[] {
  const resolved = inspectAdmittedDonorPdfs(commandTarget, donors, ownerDocumentKey);
  const lifecycles = new Set<DonorSetLifecycle>();
  donors.forEach((donor) => {
    const registered = admittedDonorRegistry.get(donor);
    if (!registered) return;
    registered.lifecycle.consumedCount += 1;
    lifecycles.add(registered.lifecycle);
    consumedDonorRegistry.add(donor);
    admittedDonorRegistry.delete(donor);
  });
  lifecycles.forEach((lifecycle) => {
    if (lifecycle.consumedCount >= lifecycle.donorCount) {
      detachDonorSetAbort(lifecycle);
    }
  });
  return resolved;
}

export function revokeAdmittedDonorSet(admittedSet: AdmittedDonorSet): void {
  const lifecycle = findDonorSetLifecycle(admittedSet.donors);
  if (!lifecycle || lifecycle.revoked) return;
  lifecycle.revoked = true;
  detachDonorSetAbort(lifecycle);
  admittedSet.donors.forEach((donor) => {
    if (consumedDonorRegistry.has(donor)) return;
    revokedDonorRegistry.add(donor);
    admittedDonorRegistry.delete(donor);
  });
  log('session', 'Admitted donor set revoked', {
    source: admittedSet.source,
    commandTarget: admittedSet.commandTarget,
    donorCount: admittedSet.donors.length,
    ownerDocumentKey: admittedSet.ownerDocumentKey,
  });
}

export function isDonorAdmissionBoundaryError(
  error: unknown,
): error is DonorAdmissionBoundaryError {
  return error instanceof DonorAdmissionBoundaryError;
}

export function firstDonorAdmissionErrorMessage(
  result: DonorAdmissionResult,
): string | null {
  return result.evidence.diagnostics.find((item) => item.severity === 'error')?.message
    ?? null;
}

function registerAdmittedDonor(
  staged: StagedDonorPdf,
  generation: number,
  ownerDocumentKey: string,
  commandTarget: DonorCommandTarget,
  lifecycle: DonorSetLifecycle,
): AdmittedDonorPdf {
  const publicValue: AdmittedDonorPdf = Object.freeze({
    inputIndex: staged.inputIndex,
    fileName: staged.fileName,
    sourceBytes: staged.sourceBytes,
    pageCount: staged.pageCount,
    ownerDocumentKey,
    commandTarget,
    handle: staged.handle,
  });
  admittedDonorRegistry.set(publicValue, {
    ...publicValue,
    bytes: staged.bytes,
    generation,
    lifecycle,
  });
  return publicValue;
}

function bindDonorSetAbort(
  admittedSet: AdmittedDonorSet,
  lifecycle: DonorSetLifecycle,
  signal: AbortSignal | undefined,
): void {
  if (!signal) return;
  const abortHandler = () => revokeAdmittedDonorSet(admittedSet);
  lifecycle.signal = signal;
  lifecycle.abortHandler = abortHandler;
  signal.addEventListener('abort', abortHandler, { once: true });
  if (signal.aborted) abortHandler();
}

function detachDonorSetAbort(lifecycle: DonorSetLifecycle): void {
  if (lifecycle.signal && lifecycle.abortHandler) {
    lifecycle.signal.removeEventListener('abort', lifecycle.abortHandler);
  }
  lifecycle.signal = undefined;
  lifecycle.abortHandler = undefined;
}

function findDonorSetLifecycle(
  donors: readonly AdmittedDonorPdf[],
): DonorSetLifecycle | null {
  for (const donor of donors) {
    const registered = admittedDonorRegistry.get(donor);
    if (registered) return registered.lifecycle;
  }
  return null;
}

function checkpoint(
  generation: number,
  options: DonorAdmissionOptions,
  operation: string,
  inputIndex: number | undefined,
): void {
  throwIfAborted(options.signal, operation);
  if (generation !== latestDonorAdmissionGeneration) {
    throw new StaleDonorAdmissionError(
      'A newer donor operation superseded this result before staging.',
      inputIndex,
    );
  }
  if (options.isContextCurrent && !options.isContextCurrent()) {
    throw new StaleDonorAdmissionError(
      'The active document changed before donor staging completed.',
      inputIndex,
    );
  }
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

function hasAdmissionErrors(diagnostics: readonly AdmissionDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error');
}

function rejectDonorAdmission(
  outcome: Exclude<AdmissionOutcomeCode, 'ACCEPTED'>,
  source: DonorInputSource,
  commandTarget: DonorCommandTarget,
  ownerDocumentKey: string,
  sources: readonly PickedPdfFileSource[],
  aggregateSourceBytes: number,
  measurements: readonly AdmissionMeasuredValue[],
  diagnostics: readonly AdmissionDiagnostic[],
  pageCounts: ReadonlyMap<number, number>,
): DonorAdmissionResult {
  const evidence = createDonorEvidence(
    outcome,
    commandTarget,
    sources,
    aggregateSourceBytes,
    measurements,
    diagnostics,
    pageCounts,
  );
  warn('session', 'Donor PDF admission did not dispatch', {
    source,
    commandTarget,
    ownerDocumentKey,
    outcome,
    diagnostics: evidence.diagnostics.map((item) => item.code),
  });
  return Object.freeze({ outcome, evidence });
}

function createDonorEvidence(
  outcome: AdmissionOutcomeCode,
  commandTarget: DonorCommandTarget,
  sources: readonly PickedPdfFileSource[],
  aggregateSourceBytes: number,
  measurements: readonly AdmissionMeasuredValue[],
  diagnostics: readonly AdmissionDiagnostic[],
  pageCounts: ReadonlyMap<number, number>,
): DonorAdmissionEvidence {
  const policy = getDonorPdfAdmissionPolicy();
  const sortedDiagnostics = sortAdmissionDiagnostics(diagnostics)
    .map((item) => Object.freeze({ ...item }));
  const inputs = sources.map((item, inputIndex) => {
    const inputDiagnostics = sortedDiagnostics.filter(
      (diagnostic) => diagnostic.inputIndex === inputIndex,
    );
    const inputOutcome: AdmissionOutcomeCode = inputDiagnostics.some(
      (diagnostic) => diagnostic.severity === 'error',
    )
      ? outcome
      : outcome === 'ACCEPTED'
        ? 'ACCEPTED'
        : 'CANCELLED';
    const pageCount = pageCounts.get(inputIndex);
    return Object.freeze({
      inputIndex,
      fileName: item.file.name,
      sourceBytes: item.file.size,
      ...(typeof pageCount === 'number' ? { pageCount } : {}),
      outcome: inputOutcome,
      diagnostics: Object.freeze(inputDiagnostics),
    });
  });

  return Object.freeze({
    profileId: policy.profileId,
    policyVersion: policy.policyVersion,
    authority: policy.authority,
    aggregateAuthority: DONOR_AGGREGATE_POLICY_AUTHORITY,
    commandTarget,
    aggregateSourceBytes,
    measurements: Object.freeze(
      measurements.map((measurement) => Object.freeze({ ...measurement })),
    ),
    diagnostics: Object.freeze(sortedDiagnostics),
    inputs: Object.freeze(inputs),
  });
}
