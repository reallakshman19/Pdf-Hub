import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  OcrWorkerRequest,
  OcrWorkerResponse,
} from '../workers/ocrWorkerTypes';
import type {
  OcrWorkerLike,
} from '../workers/ocrWorkerClient';
import {
  OcrWorkerClient,
} from '../workers/ocrWorkerClient';
import type {
  OcrDocumentResult,
} from '../types';

describe('OcrWorkerClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends ping and receives pong', async () => {
    const worker = new FakeOcrWorker();
    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.ping();

    expect(worker.messages[0]).toEqual({
      requestId: 'req-1',
      type: 'PING',
    });

    worker.emit({
      requestId: 'req-1',
      type: 'PONG',
      payload: {
        ok: true,
        workerVersion: 'test-worker',
      },
    });

    await expect(promise).resolves.toEqual({
      ok: true,
      workerVersion: 'test-worker',
    });

    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });

  it('recognizes pages and returns OCR document result', async () => {
    const worker = new FakeOcrWorker();
    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.recognizePages({
      documentFingerprint: 'doc-worker',
      engineId: 'mock',
      profileId: 'clean-scan',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    expect(worker.messages[0].type).toBe('RECOGNIZE_PAGES');

    const result = makeOcrResult();

    worker.emit({
      requestId: 'req-1',
      type: 'RECOGNIZE_RESULT',
      payload: {
        result,
      },
    });

    await expect(promise).resolves.toBe(result);

    client.dispose();
  });

  it('forwards progress events without resolving request', async () => {
    const worker = new FakeOcrWorker();
    const progressMessages: string[] = [];

    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.recognizePages(
      {
        documentFingerprint: 'doc-worker',
        engineId: 'mock',
        profileId: 'clean-scan',
        pages: [],
      },
      {
        onProgress: (progress) => {
          progressMessages.push(progress.message ?? '');
        },
      },
    );

    worker.emit({
      requestId: 'req-1',
      type: 'PROGRESS',
      payload: {
        status: 'running',
        completedPages: 0,
        totalPages: 1,
        activePageIndex: 0,
        message: 'Running page 1',
      },
    });

    expect(progressMessages).toEqual(['Running page 1']);
    expect(client.getPendingRequestCount()).toBe(1);

    const result = makeOcrResult();

    worker.emit({
      requestId: 'req-1',
      type: 'RECOGNIZE_RESULT',
      payload: {
        result,
      },
    });

    await expect(promise).resolves.toBe(result);

    client.dispose();
  });

  it('rejects on worker error response', async () => {
    const worker = new FakeOcrWorker();
    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.ping();

    worker.emit({
      requestId: 'req-1',
      type: 'ERROR',
      payload: {
        message: 'Synthetic worker failure.',
        code: 'SYNTHETIC',
      },
    });

    await expect(promise).rejects.toThrow('Synthetic worker failure.');
    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });

  it('rejects on worker cancellation response', async () => {
    const worker = new FakeOcrWorker();
    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.ping();

    worker.emit({
      requestId: 'req-1',
      type: 'REQUEST_CANCELLED',
      payload: {
        reason: 'Cancelled by test.',
      },
    });

    await expect(promise).rejects.toThrow('Cancelled by test.');
    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });

  it('cancels request when AbortSignal aborts', async () => {
    const worker = new FakeOcrWorker();
    const controller = new AbortController();

    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.recognizePages(
      {
        documentFingerprint: 'doc-worker',
        engineId: 'mock',
        profileId: 'clean-scan',
        pages: [],
      },
      {
        signal: controller.signal,
      },
    );

    controller.abort();

    await expect(promise).rejects.toThrow('aborted');

    expect(worker.messages[1]).toEqual({
      requestId: 'req-2',
      type: 'CANCEL_REQUEST',
      targetRequestId: 'req-1',
    });

    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });

  it('rejects immediately when signal is already aborted', async () => {
    const worker = new FakeOcrWorker();
    const controller = new AbortController();

    controller.abort();

    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    await expect(
      client.ping({
        signal: controller.signal,
      }),
    ).rejects.toThrow('aborted before start');

    expect(worker.messages).toHaveLength(0);

    client.dispose();
  });

  it('times out request and posts cancel message', async () => {
    vi.useFakeTimers();

    const worker = new FakeOcrWorker();
    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
      requestTimeoutMs: 1000,
    });

    const promise = client.ping();

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('timed out');

    expect(worker.messages[1]).toEqual({
      requestId: 'req-2',
      type: 'CANCEL_REQUEST',
      targetRequestId: 'req-1',
    });

    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });

  it('rejects pending requests on worker error event', async () => {
    const worker = new FakeOcrWorker();
    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.ping();

    worker.emitError('Worker crashed.');

    await expect(promise).rejects.toThrow('Worker crashed.');
    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });

  it('rejects pending requests and terminates worker on dispose', async () => {
    const worker = new FakeOcrWorker();
    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.ping();

    client.dispose();

    await expect(promise).rejects.toThrow('disposed');
    expect(worker.terminated).toBe(true);
    expect(client.getPendingRequestCount()).toBe(0);
  });

  it('ignores malformed or unknown responses', () => {
    const worker = new FakeOcrWorker();
    const client = new OcrWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    worker.emitRaw({
      bad: true,
    });

    worker.emit({
      requestId: 'missing',
      type: 'PONG',
      payload: {
        ok: true,
        workerVersion: 'test-worker',
      },
    });

    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });
});

class FakeOcrWorker implements OcrWorkerLike {
  messages: OcrWorkerRequest[] = [];

  terminated = false;

  private listeners = new Map<string, Set<(event: MessageEvent | ErrorEvent) => void>>();

  postMessage(message: OcrWorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(response: OcrWorkerResponse): void {
    this.emitRaw(response);
  }

  emitRaw(data: unknown): void {
    const event = {
      data,
    } as MessageEvent;

    for (const listener of this.listeners.get('message') ?? []) {
      listener(event);
    }
  }

  emitError(message: string): void {
    const event = {
      message,
    } as ErrorEvent;

    for (const listener of this.listeners.get('error') ?? []) {
      listener(event);
    }
  }
}

function createSequentialIds(): () => string {
  let counter = 0;

  return () => {
    counter += 1;
    return `req-${counter}`;
  };
}

function makeOcrResult(): OcrDocumentResult {
  return {
    documentFingerprint: 'doc-worker',
    createdAt: '2026-01-01T00:00:00.000Z',
    engineId: 'mock',
    profileId: 'clean-scan',
    pages: [
      {
        pageIndex: 0,
        pageNumber: 1,
        status: 'success',
        pageType: 'scanned',
        orientationDeg: 0,
        languageHints: ['eng'],
        width: 595,
        height: 842,
        words: [],
        lines: [],
        blocks: [],
        diagnostics: [],
      },
    ],
    diagnostics: [],
  };
}
