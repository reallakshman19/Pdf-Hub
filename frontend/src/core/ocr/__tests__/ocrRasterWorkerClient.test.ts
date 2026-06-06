import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  OcrRasterWorkerRequest,
  OcrRasterWorkerResponse,
} from '../workers/ocrRasterWorkerTypes';
import type {
  OcrRasterWorkerLike,
} from '../workers/ocrRasterWorkerClient';
import {
  OcrRasterWorkerClient,
} from '../workers/ocrRasterWorkerClient';

describe('OcrRasterWorkerClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends ping and receives pong', async () => {
    const worker = new FakeOcrRasterWorker();
    const client = new OcrRasterWorkerClient({
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
        workerVersion: 'raster-test',
      },
    });

    await expect(promise).resolves.toEqual({
      ok: true,
      workerVersion: 'raster-test',
    });

    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });

  it('rasterizes pages and returns page inputs', async () => {
    const worker = new FakeOcrRasterWorker();
    const client = new OcrRasterWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.rasterizePages({
      pdfBytes: new Uint8Array([1, 2, 3]),
      pageIndexes: [0],
      scale: 2,
      maxCanvasPixels: 16_000_000,
      mimeType: 'image/png',
    });

    expect(worker.messages[0].type).toBe('RASTERIZE_PAGES');

    worker.emit({
      requestId: 'req-1',
      type: 'RASTERIZE_RESULT',
      payload: {
        pages: [
          {
            pageIndex: 0,
            imageBytes: new Uint8Array([9, 9, 9]),
            width: 595,
            height: 842,
          },
        ],
      },
    });

    const pages = await promise;

    expect(pages).toHaveLength(1);
    expect(pages[0].pageIndex).toBe(0);

    client.dispose();
  });

  it('forwards progress events', async () => {
    const worker = new FakeOcrRasterWorker();
    const messages: string[] = [];

    const client = new OcrRasterWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.rasterizePages(
      {
        pdfBytes: new Uint8Array([1, 2, 3]),
        pageIndexes: [0],
        scale: 2,
        maxCanvasPixels: 16_000_000,
        mimeType: 'image/png',
      },
      {
        onProgress: (progress) => {
          messages.push(progress.message ?? '');
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
        message: 'Raster running.',
      },
    });

    expect(messages).toEqual(['Raster running.']);

    worker.emit({
      requestId: 'req-1',
      type: 'RASTERIZE_RESULT',
      payload: {
        pages: [],
      },
    });

    await expect(promise).resolves.toEqual([]);

    client.dispose();
  });

  it('rejects on error response', async () => {
    const worker = new FakeOcrRasterWorker();
    const client = new OcrRasterWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.ping();

    worker.emit({
      requestId: 'req-1',
      type: 'ERROR',
      payload: {
        message: 'Raster failed.',
      },
    });

    await expect(promise).rejects.toThrow('Raster failed.');

    client.dispose();
  });

  it('cancels request on AbortSignal', async () => {
    const worker = new FakeOcrRasterWorker();
    const controller = new AbortController();

    const client = new OcrRasterWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.rasterizePages(
      {
        pdfBytes: new Uint8Array([1, 2, 3]),
        pageIndexes: [0],
        scale: 2,
        maxCanvasPixels: 16_000_000,
        mimeType: 'image/png',
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

    client.dispose();
  });

  it('times out request and sends cancel request', async () => {
    vi.useFakeTimers();

    const worker = new FakeOcrRasterWorker();
    const client = new OcrRasterWorkerClient({
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

    client.dispose();
  });

  it('rejects pending requests on dispose', async () => {
    const worker = new FakeOcrRasterWorker();
    const client = new OcrRasterWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.ping();

    client.dispose();

    await expect(promise).rejects.toThrow('disposed');
    expect(worker.terminated).toBe(true);
  });
});

class FakeOcrRasterWorker implements OcrRasterWorkerLike {
  messages: OcrRasterWorkerRequest[] = [];

  terminated = false;

  private listeners = new Map<string, Set<(event: MessageEvent | ErrorEvent) => void>>();

  postMessage(message: OcrRasterWorkerRequest): void {
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

  emit(response: OcrRasterWorkerResponse): void {
    const event = {
      data: response,
    } as MessageEvent;

    for (const listener of this.listeners.get('message') ?? []) {
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
