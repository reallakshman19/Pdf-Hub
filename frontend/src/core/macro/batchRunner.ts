import type { PickedPdfFileSource } from '@/adapters/file/FileAdapter';
import {
  createBatchPdfAdmissionEvidence,
  preflightBatchPdfSources,
  readAndValidateBatchPdfSource,
  type BatchPdfAdmissionEvidence,
  type BatchPdfEvidenceRecord,
  type BatchPdfPreflight,
  type BatchPdfRecordStatus,
  type ValidatedBatchPdf,
} from '@/core/admission/batchPdf';
import type { AdmissionDiagnostic, AdmissionMeasuredValue } from '@/core/admission/types';
import {
  isOperationCancelledError,
  raceWithAbort,
  throwIfAborted,
} from '@/core/cancellation/operationCancellation';
import { log } from '@/core/logger/service';
import { executeMacroRecipe } from './executor';
import type { MacroRecipe } from './types';

export interface BatchOutputArtifact {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface BatchRunOptions {
  readonly sources: readonly PickedPdfFileSource[];
  readonly recipe: MacroRecipe;
  readonly continueOnError: boolean;
  readonly donorFiles?: Record<string, Uint8Array>;
  readonly abortSignal?: AbortSignal;
  readonly onOutput?: (
    output: BatchOutputArtifact,
  ) => void | Promise<void>;
}

interface BatchFileRecordBase {
  readonly inputIndex: number;
  readonly fileName: string;
  readonly inputBytes: number;
  readonly status: BatchPdfRecordStatus;
  readonly logs: readonly string[];
}

export interface BatchFileSuccessRecord extends BatchFileRecordBase {
  readonly status: 'success';
  readonly pageCount: number;
  readonly outputBytes: number;
}

export interface BatchFileFailureRecord extends BatchFileRecordBase {
  readonly status: 'failed';
  readonly pageCount?: number;
  readonly error: string;
}

export interface BatchFileCancelledRecord extends BatchFileRecordBase {
  readonly status: 'cancelled';
  readonly pageCount?: number;
  readonly error: string;
}

export interface BatchFileNotRunRecord extends BatchFileRecordBase {
  readonly status: 'not-run';
  readonly reason: string;
}

export type BatchFileResultRecord =
  | BatchFileSuccessRecord
  | BatchFileFailureRecord
  | BatchFileCancelledRecord
  | BatchFileNotRunRecord;

export type BatchRunOutcome = 'completed' | 'rejected' | 'cancelled' | 'stopped';

export interface BatchRunResult {
  readonly outcome: BatchRunOutcome;
  readonly cancelled: boolean;
  readonly records: readonly BatchFileResultRecord[];
  readonly summary: {
    readonly selected: number;
    readonly processed: number;
    readonly succeeded: number;
    readonly failed: number;
    readonly cancelled: number;
    readonly notRun: number;
  };
  readonly metadata: {
    readonly recipeId: string;
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly evidence: BatchPdfAdmissionEvidence;
}

export async function runMacroBatch(options: BatchRunOptions): Promise<BatchRunResult> {
  const startedAt = new Date().toISOString();
  const preflightResult = preflightBatchPdfSources(options.sources, options.abortSignal);
  const preflight = preflightResult.value;
  const measurements: AdmissionMeasuredValue[] = [...preflight.measurements];
  const diagnostics: AdmissionDiagnostic[] = [...preflight.diagnostics];
  const records: BatchFileResultRecord[] = [];

  if (preflightResult.outcome !== 'ACCEPTED') {
    const cancelled = preflightResult.outcome === 'CANCELLED';
    appendPreflightRejectionRecords(records, diagnostics, preflight, cancelled);
    return finishBatchRun({
      outcome: cancelled ? 'cancelled' : 'rejected',
      cancelled,
      records,
      measurements,
      diagnostics,
      preflight,
      recipeId: options.recipe.id,
      startedAt,
    });
  }

  let outcome: BatchRunOutcome = 'completed';
  let cancelled = false;
  let nextInputIndex = 0;

  for (; nextInputIndex < preflight.sources.length; nextInputIndex += 1) {
    const source = preflight.sources[nextInputIndex];
    try {
      throwIfAborted(options.abortSignal, `batch input ${nextInputIndex}: before processing`);
      const validation = await readAndValidateBatchPdfSource(
        source,
        nextInputIndex,
        options.abortSignal,
      );
      measurements.push(...validation.measurements);
      diagnostics.push(...validation.diagnostics);

      if (validation.outcome !== 'ACCEPTED') {
        const error = firstDiagnosticMessage(validation.diagnostics, 'The selected PDF is invalid.');
        records.push(freezeRecord({
          inputIndex: nextInputIndex,
          fileName: source.file.name,
          inputBytes: source.file.size,
          status: 'failed',
          error,
          logs: [],
        }));
        if (!options.continueOnError) {
          outcome = 'stopped';
          nextInputIndex += 1;
          break;
        }
        if (options.abortSignal?.aborted) {
        cancelled = true;
        outcome = 'cancelled';
        diagnostics.push({
          severity: 'info',
          code: 'ADMISSION_CANCELLED',
          phase: 'COMMIT',
          inputIndex: nextInputIndex,
          message: 'Batch execution was cancelled after the current input completed.',
        });
        nextInputIndex += 1;
        break;
      }
        continue;
      }

      const record = await executeValidatedBatchPdf(
        validation.value,
        options,
      );
      records.push(record);

      if (record.status === 'cancelled') {
        cancelled = true;
        outcome = 'cancelled';
        diagnostics.push({
          severity: 'info',
          code: 'ADMISSION_CANCELLED',
          phase: 'COMMIT',
          inputIndex: record.inputIndex,
          message: record.error,
        });
        nextInputIndex += 1;
        break;
      }
      if (record.status === 'failed') {
        diagnostics.push({
          severity: 'error',
          code: 'BATCH_MACRO_EXECUTION_FAILED',
          phase: 'VALIDATION',
          inputIndex: record.inputIndex,
          message: record.error,
        });
        if (!options.continueOnError) {
          outcome = 'stopped';
          nextInputIndex += 1;
          break;
        }
      }
      throwIfAborted(options.abortSignal, `batch input ${nextInputIndex}: before advancing`);
    } catch (error) {
      if (isOperationCancelledError(error)) {
        cancelled = true;
        outcome = 'cancelled';
        const message = error.message;
        records.push(freezeRecord({
          inputIndex: nextInputIndex,
          fileName: source.file.name,
          inputBytes: source.file.size,
          status: 'cancelled',
          error: message,
          logs: [],
        }));
        diagnostics.push({
          severity: 'info',
          code: 'ADMISSION_CANCELLED',
          phase: 'COMMIT',
          inputIndex: nextInputIndex,
          message,
        });
        nextInputIndex += 1;
        break;
      }

      const message = error instanceof Error ? error.message : String(error);
      records.push(freezeRecord({
        inputIndex: nextInputIndex,
        fileName: source.file.name,
        inputBytes: source.file.size,
        status: 'failed',
        error: message,
        logs: [],
      }));
      diagnostics.push({
        severity: 'error',
        code: 'ADMISSION_INTERNAL_FAILURE',
        phase: 'VALIDATION',
        inputIndex: nextInputIndex,
        message,
      });
      if (!options.continueOnError) {
        outcome = 'stopped';
        nextInputIndex += 1;
        break;
      }
    }
  }

  if (nextInputIndex < preflight.inputs.length) {
    const reason = cancelled
      ? 'Batch execution was cancelled before this input was read.'
      : 'Batch execution stopped after the first file failure.';
    appendNotRunRecords(records, diagnostics, preflight, nextInputIndex, reason);
  }

  return finishBatchRun({
    outcome,
    cancelled,
    records,
    measurements,
    diagnostics,
    preflight,
    recipeId: options.recipe.id,
    startedAt,
  });
}

async function executeValidatedBatchPdf(
  input: ValidatedBatchPdf,
  options: BatchRunOptions,
): Promise<BatchFileSuccessRecord | BatchFileFailureRecord | BatchFileCancelledRecord> {
  throwIfAborted(options.abortSignal, `batch input ${input.inputIndex}: before macro execution`);
  const execution = await raceWithAbort(
    executeMacroRecipe(
      options.recipe,
      {
        workingBytes: input.bytes,
        pageCount: input.pageCount,
        selectedPages: [],
        currentPage: 1,
        fileName: input.fileName,
        donorFiles: options.donorFiles ?? {},
        now: new Date(),
        options: {
          abortSignal: options.abortSignal,
        },
      },
    ),
    options.abortSignal,
    `batch input ${input.inputIndex}: macro execution`,
  );
  throwIfAborted(options.abortSignal, `batch input ${input.inputIndex}: after macro execution`);

  const logs = Object.freeze([...execution.logs]);
  if (execution.status === 'cancelled') {
    return freezeRecord({
      inputIndex: input.inputIndex,
      fileName: input.fileName,
      inputBytes: input.sourceBytes,
      pageCount: input.pageCount,
      status: 'cancelled',
      error: execution.logs.at(-1) ?? 'Batch macro execution was cancelled.',
      logs,
    });
  }
  if (!execution.success) {
    return freezeRecord({
      inputIndex: input.inputIndex,
      fileName: input.fileName,
      inputBytes: input.sourceBytes,
      pageCount: input.pageCount,
      status: 'failed',
      error: execution.logs.at(-1) ?? `Macro ${execution.status ?? 'failed'}.`,
      logs,
    });
  }

  const outputBytes = execution.finalBytes.byteLength;
  throwIfAborted(options.abortSignal, `batch input ${input.inputIndex}: before output handoff`);
  await options.onOutput?.({
    inputIndex: input.inputIndex,
    fileName: input.fileName,
    bytes: execution.finalBytes,
  });
  return freezeRecord({
    inputIndex: input.inputIndex,
    fileName: input.fileName,
    inputBytes: input.sourceBytes,
    pageCount: input.pageCount,
    outputBytes,
    status: 'success',
    logs,
  });
}

function appendPreflightRejectionRecords(
  records: BatchFileResultRecord[],
  diagnostics: AdmissionDiagnostic[],
  preflight: BatchPdfPreflight,
  cancelled: boolean,
): void {
  for (const input of preflight.inputs) {
    const inputErrors = preflight.diagnostics.filter(
      (diagnostic) => diagnostic.inputIndex === input.inputIndex && diagnostic.severity === 'error',
    );
    if (!cancelled && inputErrors.length > 0) {
      records.push(freezeRecord({
        inputIndex: input.inputIndex,
        fileName: input.fileName,
        inputBytes: input.sourceBytes,
        status: 'failed',
        error: firstDiagnosticMessage(inputErrors, 'Batch metadata preflight failed.'),
        logs: [],
      }));
      continue;
    }
    const reason = cancelled
      ? 'Batch execution was cancelled during metadata preflight.'
      : 'The complete selection was rejected during metadata preflight.';
    records.push(freezeRecord({
      inputIndex: input.inputIndex,
      fileName: input.fileName,
      inputBytes: input.sourceBytes,
      status: 'not-run',
      reason,
      logs: [],
    }));
    diagnostics.push({
      severity: 'info',
      code: 'BATCH_FILE_NOT_RUN',
      phase: 'METADATA_PREFLIGHT',
      inputIndex: input.inputIndex,
      message: reason,
    });
  }
}

function appendNotRunRecords(
  records: BatchFileResultRecord[],
  diagnostics: AdmissionDiagnostic[],
  preflight: BatchPdfPreflight,
  startIndex: number,
  reason: string,
): void {
  for (let inputIndex = startIndex; inputIndex < preflight.inputs.length; inputIndex += 1) {
    const input = preflight.inputs[inputIndex];
    records.push(freezeRecord({
      inputIndex,
      fileName: input.fileName,
      inputBytes: input.sourceBytes,
      status: 'not-run',
      reason,
      logs: [],
    }));
    diagnostics.push({
      severity: 'info',
      code: 'BATCH_FILE_NOT_RUN',
      phase: 'COMMIT',
      inputIndex,
      message: reason,
    });
  }
}

function finishBatchRun(input: {
  readonly outcome: BatchRunOutcome;
  readonly cancelled: boolean;
  readonly records: readonly BatchFileResultRecord[];
  readonly measurements: readonly AdmissionMeasuredValue[];
  readonly diagnostics: readonly AdmissionDiagnostic[];
  readonly preflight: BatchPdfPreflight;
  readonly recipeId: string;
  readonly startedAt: string;
}): BatchRunResult {
  const records = Object.freeze([...input.records]);
  const summary = Object.freeze({
    selected: input.preflight.selectedFileCount,
    processed: records.filter((record) => record.status !== 'not-run').length,
    succeeded: records.filter((record) => record.status === 'success').length,
    failed: records.filter((record) => record.status === 'failed').length,
    cancelled: records.filter((record) => record.status === 'cancelled').length,
    notRun: records.filter((record) => record.status === 'not-run').length,
  });
  const evidenceRecords: BatchPdfEvidenceRecord[] = records.map((record) => ({
    inputIndex: record.inputIndex,
    fileName: record.fileName,
    sourceBytes: record.inputBytes,
    ...(record.status !== 'not-run' && 'pageCount' in record && typeof record.pageCount === 'number'
      ? { pageCount: record.pageCount }
      : {}),
    status: record.status,
  }));
  const evidence = createBatchPdfAdmissionEvidence({
    preflight: input.preflight,
    records: evidenceRecords,
    measurements: input.measurements,
    diagnostics: input.diagnostics,
    cancelled: input.cancelled,
  });
  const result: BatchRunResult = Object.freeze({
    outcome: input.outcome,
    cancelled: input.cancelled,
    records,
    summary,
    metadata: Object.freeze({
      recipeId: input.recipeId,
      startedAt: input.startedAt,
      endedAt: new Date().toISOString(),
    }),
    evidence,
  });

  log('macro', 'Batch macro run completed', {
    recipeId: input.recipeId,
    outcome: input.outcome,
    selected: summary.selected,
    succeeded: summary.succeeded,
    failed: summary.failed,
    cancelled: summary.cancelled,
    notRun: summary.notRun,
    aggregateSourceBytes: input.preflight.aggregateSourceBytes,
  });
  return result;
}

function firstDiagnosticMessage(
  diagnostics: readonly AdmissionDiagnostic[],
  fallback: string,
): string {
  return diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ?? fallback;
}

function freezeRecord<T extends BatchFileResultRecord>(record: T): T {
  return Object.freeze({
    ...record,
    logs: Object.freeze([...record.logs]),
  }) as unknown as T;
}
