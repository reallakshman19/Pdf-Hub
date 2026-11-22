import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useSessionStore } from '@/core/session/store';
import { runFinalOcrIntegrationJob } from '@/core/ocr/ocrFinalIntegration';
import { useOcrRunWorkflow } from './useOcrRunWorkflow';

vi.mock('@/core/ocr/ocrFinalIntegration', () => ({
  runFinalOcrIntegrationJob: vi.fn(),
}));

type FinishedJob = Awaited<ReturnType<typeof runFinalOcrIntegrationJob>>;

function pendingJob() {
  let resolve!: (value: FinishedJob) => void;
  const promise = new Promise<FinishedJob>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function completedJob(documentFingerprint: string): FinishedJob {
  return {
    id: 'late-job',
    documentFingerprint,
    mode: 'main',
    result: {
      documentFingerprint,
      createdAt: '2026-11-19T00:00:00.000Z',
      engineId: 'mock',
      profileId: 'clean-scan',
      pages: [],
      diagnostics: [],
    },
  } as unknown as FinishedJob;
}

const pageInputs = [{
  pageIndex: 0,
  imageBytes: new Uint8Array([1, 2, 3]),
  width: 595,
  height: 842,
  imageCount: 1,
}];

function mountOwner() {
  return renderHook(() => useOcrRunWorkflow({
    documentFingerprint: 'doc-A',
    pageCount: 1,
    selectedPageIndexes: [0],
    pages: pageInputs,
  }));
}

describe('WP-05 OCR async run owner and cancellation', () => {
  beforeEach(() => {
    vi.mocked(runFinalOcrIntegrationJob).mockReset();
    useSessionStore.getState().clearDocument();
    useOcrStore.getState().clearOcr();
    useSessionStore.setState({
      documentKey: 'doc-A',
      activeRevisionId: 'revision-A',
    });
  });

  it('does not commit a late successful result or overwrite cancellation feedback', async () => {
    const deferred = pendingJob();
    vi.mocked(runFinalOcrIntegrationJob).mockReturnValue(deferred.promise);
    const hook = mountOwner();
    act(() => { void hook.result.current.runSelectedOcr(); });
    expect(vi.mocked(runFinalOcrIntegrationJob)).toHaveBeenCalledTimes(1);

    act(() => { hook.result.current.cancelActiveOcr(); });
    expect(hook.result.current.isRunning).toBe(false);
    expect(hook.result.current.errorMessage).toBe('OCR job cancelled.');

    await act(async () => { deferred.resolve(completedJob('doc-A')); await deferred.promise; });
    expect(useOcrStore.getState().result).toBeNull();
    expect(hook.result.current.errorMessage).toBe('OCR job cancelled.');
    hook.unmount();
  });

  it('rejects late progress/completion when an unrelated document replaces the source', async () => {
    const deferred = pendingJob();
    vi.mocked(runFinalOcrIntegrationJob).mockReturnValue(deferred.promise);
    const hook = mountOwner();
    act(() => { void hook.result.current.runSelectedOcr(); });

    const call = vi.mocked(runFinalOcrIntegrationJob).mock.calls[0]?.[0];
    expect(call?.signal?.aborted).toBe(false);

    act(() => {
      useSessionStore.setState({
        documentKey: 'doc-B',
        activeRevisionId: 'revision-B',
      });
    });
    expect(call?.signal?.aborted).toBe(true);
    expect(hook.result.current.isRunning).toBe(false);

    act(() => {
      call?.onDiagnostic?.({
        level: 'info', code: 'OCR_FINAL_BATCH_RUN_COMPLETED',
        message: 'late old-document progress',
      });
    });
    await act(async () => { deferred.resolve(completedJob('doc-A')); await deferred.promise; });
    expect(useOcrStore.getState().result).toBeNull();
    expect(hook.result.current.pipelineMessages).not.toContain('late old-document progress');
    hook.unmount();
  });

  it('aborts when the working revision changes without changing the document key', async () => {
    const deferred = pendingJob();
    vi.mocked(runFinalOcrIntegrationJob).mockReturnValue(deferred.promise);
    const hook = mountOwner();
    act(() => { void hook.result.current.runSelectedOcr(); });
    const call = vi.mocked(runFinalOcrIntegrationJob).mock.calls[0]?.[0];

    act(() => {
      useSessionStore.setState({ activeRevisionId: 'revision-new' });
    });
    expect(call?.signal?.aborted).toBe(true);
    expect(hook.result.current.isRunning).toBe(false);
    await act(async () => { deferred.resolve(completedJob('doc-A')); await deferred.promise; });
    expect(useOcrStore.getState().result).toBeNull();
    hook.unmount();
  });

  it('aborts on unmount and refuses an engine that settles after its view disappears', async () => {
    const deferred = pendingJob();
    vi.mocked(runFinalOcrIntegrationJob).mockReturnValue(deferred.promise);
    const hook = mountOwner();
    act(() => { void hook.result.current.runSelectedOcr(); });
    const call = vi.mocked(runFinalOcrIntegrationJob).mock.calls[0]?.[0];
    hook.unmount();
    expect(call?.signal?.aborted).toBe(true);
    await act(async () => { deferred.resolve(completedJob('doc-A')); await deferred.promise; });
    expect(useOcrStore.getState().result).toBeNull();
  });
});
