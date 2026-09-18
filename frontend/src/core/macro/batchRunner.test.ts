import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileAdapter, type PickedPdfFileSource } from '@/adapters/file/FileAdapter';
import { DEFAULT_MACRO_RESOURCE_LIMITS } from './resourceBudget';
import type { MacroExecutionResult } from './executor';
import type { MacroRecipe } from './types';
import { runMacroBatch, type BatchRunResult } from './batchRunner';

const pdfMocks = vi.hoisted(() => ({
  countPages: vi.fn(),
}));

const macroMocks = vi.hoisted(() => ({
  executeMacroRecipe: vi.fn(),
}));

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    countPages: pdfMocks.countPages,
  },
}));

vi.mock('./executor', () => ({
  executeMacroRecipe: macroMocks.executeMacroRecipe,
}));

const RECIPE: MacroRecipe = {
  id: 'batch-test',
  name: 'Batch test',
  steps: [],
};

function pdfBytes(payloadSize = 8): Uint8Array {
  const prefix = new TextEncoder().encode('%PDF-1.7\n');
  const bytes = new Uint8Array(prefix.length + payloadSize);
  bytes.set(prefix);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function successResult(outputSize = 16, logs: string[] = []): MacroExecutionResult {
  return {
    status: 'success',
    success: true,
    outputFiles: [],
    stepResults: [],
    finalBytes: new Uint8Array(outputSize),
    logs,
    selectedPages: [],
  };
}

function failureResult(message = 'macro failed'): MacroExecutionResult {
  return {
    status: 'failed',
    success: false,
    outputFiles: [],
    stepResults: [],
    finalBytes: new Uint8Array(1),
    logs: [message],
    selectedPages: [],
  };
}

function createSource(
  name: string,
  bytes: Uint8Array = pdfBytes(),
  options: {
    readonly type?: string;
    readonly size?: number;
    readonly read?: () => Promise<ArrayBuffer>;
  } = {},
): PickedPdfFileSource {
  const file = new File([toArrayBuffer(bytes)], name, { type: options.type ?? 'application/pdf' });
  if (options.size !== undefined) {
    Object.defineProperty(file, 'size', { configurable: true, value: options.size });
  }
  if (options.read) {
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(options.read),
    });
  }
  return { file };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function containsBinary(value: unknown, seen = new Set<object>()): boolean {
  if (
    value instanceof Uint8Array
    || value instanceof ArrayBuffer
    || value instanceof Blob
    || value instanceof File
  ) {
    return true;
  }
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsBinary(item, seen));
  return Object.values(value).some((item) => containsBinary(item, seen));
}

function recordKeys(report: BatchRunResult): string[] {
  return Object.keys(report.records[0] ?? {}).sort();
}

describe('runMacroBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMocks.countPages.mockResolvedValue(2);
    macroMocks.executeMacroRecipe.mockResolvedValue(successResult());
  });

  it('rejects an over-100-MiB selection before any read', async () => {
    const source = createSource('large.pdf', pdfBytes(), {
      size: FileAdapter.MAX_PDF_SIZE_BYTES + 1,
    });
    const read = vi.spyOn(source.file, 'arrayBuffer');

    const report = await runMacroBatch({
      sources: [source],
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(report.outcome).toBe('rejected');
    expect(read).not.toHaveBeenCalled();
    expect(pdfMocks.countPages).not.toHaveBeenCalled();
    expect(macroMocks.executeMacroRecipe).not.toHaveBeenCalled();
  });

  it('rejects incompatible metadata before any read', async () => {
    const source = createSource('notes.txt', pdfBytes(), { type: 'text/plain' });
    const read = vi.spyOn(source.file, 'arrayBuffer');

    const report = await runMacroBatch({
      sources: [source],
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(report.outcome).toBe('rejected');
    expect(read).not.toHaveBeenCalled();
    expect(report.evidence.diagnostics[0]?.code).toBe('PDF_METADATA_TYPE_MISMATCH');
  });

  it('measures selected-file count and aggregate source bytes without an aggregate limit', async () => {
    const sources = [createSource('a.pdf'), createSource('b.pdf', pdfBytes(20))];

    const report = await runMacroBatch({
      sources,
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(report.evidence.selectedFileCount).toBe(2);
    expect(report.evidence.aggregateSourceBytes).toBe(
      sources[0].file.size + sources[1].file.size,
    );
    expect(report.evidence.aggregateAuthority.kind).toBe('UNRESOLVED_POLICY');
    const aggregate = report.evidence.measurements.find(
      (measurement) => measurement.metric === 'AGGREGATE_SOURCE_BYTES',
    );
    expect(aggregate?.limit).toBeUndefined();
  });

  it('reads and executes strictly in picker order with one active read', async () => {
    const firstRead = deferred<ArrayBuffer>();
    const firstMacro = deferred<MacroExecutionResult>();
    const events: string[] = [];
    let activeReads = 0;
    let maxActiveReads = 0;

    const first = createSource('first.pdf', pdfBytes(), {
      read: async () => {
        events.push('read:first');
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        const value = await firstRead.promise;
        activeReads -= 1;
        return value;
      },
    });
    const second = createSource('second.pdf', pdfBytes(), {
      read: async () => {
        events.push('read:second');
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        activeReads -= 1;
        return toArrayBuffer(pdfBytes());
      },
    });
    macroMocks.executeMacroRecipe
      .mockImplementationOnce(async () => {
        events.push('macro:first');
        return firstMacro.promise;
      })
      .mockImplementationOnce(async () => {
        events.push('macro:second');
        return successResult();
      });

    const run = runMacroBatch({
      sources: [first, second],
      recipe: RECIPE,
      continueOnError: true,
    });
    await vi.waitFor(() => expect(events).toEqual(['read:first']));
    expect(second.file.arrayBuffer).not.toHaveBeenCalled();

    firstRead.resolve(toArrayBuffer(pdfBytes()));
    await vi.waitFor(() => expect(events).toEqual(['read:first', 'macro:first']));
    expect(second.file.arrayBuffer).not.toHaveBeenCalled();

    firstMacro.resolve(successResult());
    const report = await run;

    expect(events).toEqual(['read:first', 'macro:first', 'read:second', 'macro:second']);
    expect(maxActiveReads).toBe(1);
    expect(report.records.map((record) => record.fileName)).toEqual(['first.pdf', 'second.pdf']);
  });

  it('reports a missing signature without page parsing and continues', async () => {
    const invalid = createSource('invalid.pdf', new Uint8Array([1, 2, 3]));
    const valid = createSource('valid.pdf');

    const report = await runMacroBatch({
      sources: [invalid, valid],
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(report.records.map((record) => record.status)).toEqual(['failed', 'success']);
    expect(pdfMocks.countPages).toHaveBeenCalledTimes(1);
    expect(macroMocks.executeMacroRecipe).toHaveBeenCalledTimes(1);
  });

  it('reports malformed PDF parsing deterministically', async () => {
    pdfMocks.countPages.mockRejectedValueOnce(new Error('parse failure'));

    const report = await runMacroBatch({
      sources: [createSource('broken.pdf')],
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(report.records[0]).toMatchObject({
      inputIndex: 0,
      fileName: 'broken.pdf',
      status: 'failed',
    });
    expect(report.evidence.diagnostics.some(
      (diagnostic) => diagnostic.code === 'PDF_PARSE_FAILED',
    )).toBe(true);
  });

  it.each([0, -1, 1.5])('rejects invalid page count %s', async (pageCount) => {
    pdfMocks.countPages.mockResolvedValueOnce(pageCount);

    const report = await runMacroBatch({
      sources: [createSource('pages.pdf')],
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(report.records[0]?.status).toBe('failed');
    expect(macroMocks.executeMacroRecipe).not.toHaveBeenCalled();
  });

  it('executes one macro for a valid PDF and records output length only', async () => {
    macroMocks.executeMacroRecipe.mockResolvedValueOnce(successResult(321, ['done']));

    const report = await runMacroBatch({
      sources: [createSource('valid.pdf')],
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(macroMocks.executeMacroRecipe).toHaveBeenCalledTimes(1);
    expect(report.records[0]).toEqual({
      inputIndex: 0,
      fileName: 'valid.pdf',
      inputBytes: expect.any(Number),
      pageCount: 2,
      outputBytes: 321,
      status: 'success',
      logs: ['done'],
    });
  });

  it('hands off successful output bytes without retaining them in the report', async () => {
    macroMocks.executeMacroRecipe.mockResolvedValueOnce(
      successResult(321, ['done']),
    );
    const outputs: Array<{
      inputIndex: number;
      fileName: string;
      bytes: Uint8Array;
    }> = [];

    const report = await runMacroBatch({
      sources: [createSource('valid.pdf')],
      recipe: RECIPE,
      continueOnError: true,
      onOutput: (output) => {
        outputs.push(output);
      },
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      inputIndex: 0,
      fileName: 'valid.pdf',
    });
    expect(outputs[0]?.bytes).toBeInstanceOf(Uint8Array);
    expect(outputs[0]?.bytes.byteLength).toBe(321);
    expect(containsBinary(report)).toBe(false);
    expect(report.records[0]).toMatchObject({
      status: 'success',
      outputBytes: 321,
    });
  });

  it('continues after macro failure when continueOnError is true', async () => {
    macroMocks.executeMacroRecipe
      .mockResolvedValueOnce(failureResult('first failed'))
      .mockResolvedValueOnce(successResult());

    const report = await runMacroBatch({
      sources: [createSource('first.pdf'), createSource('second.pdf')],
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(report.records.map((record) => record.status)).toEqual(['failed', 'success']);
    expect(report.summary).toMatchObject({ succeeded: 1, failed: 1, notRun: 0 });
  });

  it('stops before reading the next file when continueOnError is false', async () => {
    macroMocks.executeMacroRecipe.mockResolvedValueOnce(failureResult());
    const second = createSource('second.pdf');
    const secondRead = vi.spyOn(second.file, 'arrayBuffer');

    const report = await runMacroBatch({
      sources: [createSource('first.pdf'), second],
      recipe: RECIPE,
      continueOnError: false,
    });

    expect(report.outcome).toBe('stopped');
    expect(secondRead).not.toHaveBeenCalled();
    expect(report.records.map((record) => record.status)).toEqual(['failed', 'not-run']);
  });

  it('cancellation during file N prevents file N+1 from being read', async () => {
    const controller = new AbortController();
    const read = deferred<ArrayBuffer>();
    const first = createSource('first.pdf', pdfBytes(), { read: () => read.promise });
    const second = createSource('second.pdf');
    const secondRead = vi.spyOn(second.file, 'arrayBuffer');

    const run = runMacroBatch({
      sources: [first, second],
      recipe: RECIPE,
      continueOnError: true,
      abortSignal: controller.signal,
    });
    await vi.waitFor(() => expect(first.file.arrayBuffer).toHaveBeenCalledTimes(1));
    controller.abort('cancel read');
    read.resolve(toArrayBuffer(pdfBytes()));
    const report = await run;

    expect(report.outcome).toBe('cancelled');
    expect(secondRead).not.toHaveBeenCalled();
    expect(report.records.map((record) => record.status)).toEqual(['cancelled', 'not-run']);
  });

  it('cancellation during page counting prevents macro execution', async () => {
    const controller = new AbortController();
    const pageCount = deferred<number>();
    pdfMocks.countPages.mockImplementationOnce(() => pageCount.promise);

    const run = runMacroBatch({
      sources: [createSource('counting.pdf')],
      recipe: RECIPE,
      continueOnError: true,
      abortSignal: controller.signal,
    });
    await vi.waitFor(() => expect(pdfMocks.countPages).toHaveBeenCalledTimes(1));
    controller.abort('cancel count');
    pageCount.resolve(2);
    const report = await run;

    expect(macroMocks.executeMacroRecipe).not.toHaveBeenCalled();
    expect(report.records[0]?.status).toBe('cancelled');
  });

  it('cancellation during macro execution prevents a late success record', async () => {
    const controller = new AbortController();
    const execution = deferred<MacroExecutionResult>();
    macroMocks.executeMacroRecipe.mockImplementationOnce(() => execution.promise);

    const run = runMacroBatch({
      sources: [createSource('running.pdf')],
      recipe: RECIPE,
      continueOnError: true,
      abortSignal: controller.signal,
    });
    await vi.waitFor(() => expect(macroMocks.executeMacroRecipe).toHaveBeenCalledTimes(1));
    controller.abort('cancel macro');
    execution.resolve(successResult(999));
    const report = await run;

    expect(report.records[0]?.status).toBe('cancelled');
    expect(report.records.some((record) => record.status === 'success')).toBe(false);
  });

  it('contains no binary values and JSON has no byte-index representation', async () => {
    const report = await runMacroBatch({
      sources: [createSource('safe.pdf', pdfBytes(4096))],
      recipe: RECIPE,
      continueOnError: true,
    });
    const json = JSON.stringify(report);

    expect(containsBinary(report)).toBe(false);
    expect(json).not.toMatch(/"0"\s*:\s*\d+/);
    expect(json).not.toContain('%PDF-');
  });

  it('keeps report structure independent of input and output payload size', async () => {
    macroMocks.executeMacroRecipe.mockResolvedValueOnce(successResult(4));
    const small = await runMacroBatch({
      sources: [createSource('small.pdf', pdfBytes(4))],
      recipe: RECIPE,
      continueOnError: true,
    });
    macroMocks.executeMacroRecipe.mockResolvedValueOnce(successResult(1_000_000));
    const large = await runMacroBatch({
      sources: [createSource('large.pdf', pdfBytes(100_000))],
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(recordKeys(small)).toEqual(recordKeys(large));
    expect(Object.keys(small).sort()).toEqual(Object.keys(large).sort());
    expect(containsBinary(small)).toBe(false);
    expect(containsBinary(large)).toBe(false);
  });

  it('does not apply macro donor limits to batch input count or aggregate bytes', async () => {
    const sources = Array.from({ length: DEFAULT_MACRO_RESOURCE_LIMITS.maxDonorFiles + 1 }, (_, index) =>
      createSource(`input-${index}.pdf`, pdfBytes(), { size: 20 * 1024 * 1024 }),
    );

    const report = await runMacroBatch({
      sources,
      recipe: RECIPE,
      continueOnError: true,
    });

    expect(report.evidence.aggregateSourceBytes).toBeGreaterThan(
      DEFAULT_MACRO_RESOURCE_LIMITS.maxDonorBytes,
    );
    expect(report.summary.succeeded).toBe(sources.length);
    expect(macroMocks.executeMacroRecipe).toHaveBeenCalledTimes(sources.length);
  });

  it('passes donor files and cancellation authority into existing macro execution', async () => {
    const donorFiles = { donor: new Uint8Array([1]) };
    const controller = new AbortController();

    await runMacroBatch({
      sources: [createSource('macro.pdf')],
      recipe: RECIPE,
      continueOnError: true,
      donorFiles,
      abortSignal: controller.signal,
    });

    expect(macroMocks.executeMacroRecipe).toHaveBeenCalledWith(
      RECIPE,
      expect.objectContaining({
        donorFiles,
        options: { abortSignal: controller.signal },
      }),
    );
  });

  it('preserves every existing default macro resource limit', () => {
    expect(DEFAULT_MACRO_RESOURCE_LIMITS).toEqual({
      maxRecipeJsonBytes: 1 * 1024 * 1024,
      maxStoredRecipeJsonBytes: 4 * 1024 * 1024,
      maxRecipeNodes: 20_000,
      maxRecipeDepth: 48,
      maxRecipeSteps: 256,
      maxConditionalDepth: 12,
      maxStringBytes: 256 * 1024,
      maxEmbeddedDataBytes: 20 * 1024 * 1024,
      maxInputPdfBytes: 256 * 1024 * 1024,
      maxDonorFiles: 32,
      maxDonorBytes: 512 * 1024 * 1024,
      maxExecutionMs: 120_000,
      maxExecutedSteps: 256,
      maxWorkingPdfBytes: 512 * 1024 * 1024,
      maxOutputFiles: 64,
      maxOutputBytes: 512 * 1024 * 1024,
    });
  });
});
