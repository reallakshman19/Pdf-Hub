import type { OcrEnginePageInput } from '../engines/ocrEngineContract';
import type {
  OcrRasterWorkerProgressPayload,
  OcrRasterWorkerRequest,
  OcrRasterizePagesPayload,
  OcrRasterizeRegionPayload,
} from './ocrRasterWorkerTypes';
import {
  createOcrRasterWorkerRequestId,
  isOcrRasterWorkerResponse,
} from './ocrRasterWorkerTypes';

export interface OcrRasterWorkerLike {
  postMessage: (message: OcrRasterWorkerRequest) => void;
  terminate: () => void;
  addEventListener: (
    type: 'message' | 'error',
    listener: (event: MessageEvent | ErrorEvent) => void,
  ) => void;
  removeEventListener: (
    type: 'message' | 'error',
    listener: (event: MessageEvent | ErrorEvent) => void,
  ) => void;
}

export type OcrRasterWorkerFactory = () => OcrRasterWorkerLike;

export interface OcrRasterWorkerClientOptions {
  workerFactory: OcrRasterWorkerFactory;
  requestIdFactory?: () => string;
  requestTimeoutMs?: number;
}

export interface OcrRasterWorkerRequestOptions {
  signal?: AbortSignal;
  onProgress?: (progress: OcrRasterWorkerProgressPayload) => void;
}

interface PendingRequest<T> {
  requestId: string;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: OcrRasterWorkerProgressPayload) => void;
  timeoutId?: number;
  abortListener?: () => void;
  signal?: AbortSignal;
}

export class OcrRasterWorkerClient {
  private readonly worker: OcrRasterWorkerLike;

  private readonly requestIdFactory: () => string;

  private readonly requestTimeoutMs: number;

  private readonly pending = new Map<string, PendingRequest<unknown>>();

  private disposed = false;

  private readonly handleMessage = (event: MessageEvent | ErrorEvent) => {
    if ('data' in event) {
      this.onWorkerMessage(event.data);
    }
  };

  private readonly handleError = (event: MessageEvent | ErrorEvent) => {
    const message = 'message' in event && event.message
      ? event.message
      : 'OCR raster worker failed.';

    this.rejectAll(new Error(message));
  };

  constructor(options: OcrRasterWorkerClientOptions) {
    this.worker = options.workerFactory();
    this.requestIdFactory =
      options.requestIdFactory ?? (() => createOcrRasterWorkerRequestId());
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;

    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleError);
  }

  ping(options: { signal?: AbortSignal } = {}): Promise<{
    ok: true;
    workerVersion: string;
  }> {
    const requestId = this.requestIdFactory();

    return this.sendRequest({
      request: {
        requestId,
        type: 'PING',
      },
      signal: options.signal,
    });
  }

  rasterizePages(
    payload: OcrRasterizePagesPayload,
    options: OcrRasterWorkerRequestOptions = {},
  ): Promise<OcrEnginePageInput[]> {
    const requestId = this.requestIdFactory();

    return this.sendRequest({
      request: {
        requestId,
        type: 'RASTERIZE_PAGES',
        payload,
      },
      signal: options.signal,
      onProgress: options.onProgress,
    });
  }

  rasterizeRegion(
    payload: OcrRasterizeRegionPayload,
    options: OcrRasterWorkerRequestOptions = {},
  ): Promise<OcrEnginePageInput[]> {
    const requestId = this.requestIdFactory();

    return this.sendRequest({
      request: {
        requestId,
        type: 'RASTERIZE_REGION',
        payload,
      },
      signal: options.signal,
      onProgress: options.onProgress,
    });
  }

  cancelRequest(requestId: string): void {
    if (this.disposed) {
      return;
    }

    this.worker.postMessage({
      requestId: this.requestIdFactory(),
      type: 'CANCEL_REQUEST',
      targetRequestId: requestId,
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleError);

    this.rejectAll(new Error('OCR raster worker client disposed.'));
    this.worker.terminate();
  }

  getPendingRequestCount(): number {
    return this.pending.size;
  }

  private sendRequest<T>(input: {
    request: OcrRasterWorkerRequest;
    signal?: AbortSignal;
    onProgress?: (progress: OcrRasterWorkerProgressPayload) => void;
  }): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error('OCR raster worker client is disposed.'));
    }

    if (input.signal?.aborted) {
      return Promise.reject(new Error('OCR raster worker request aborted before start.'));
    }

    return new Promise<T>((resolve, reject) => {
      const requestId = input.request.requestId;

      const pending: PendingRequest<T> = {
        requestId,
        resolve,
        reject,
        onProgress: input.onProgress,
        signal: input.signal,
      };

      pending.timeoutId = window.setTimeout(() => {
        this.pending.delete(requestId);
        this.removeAbortListener(pending);
        this.cancelRequest(requestId);
        reject(new Error(`OCR raster worker request timed out: ${requestId}`));
      }, this.requestTimeoutMs);

      if (input.signal) {
        pending.abortListener = () => {
          this.pending.delete(requestId);
          this.clearPendingTimeout(pending);
          this.cancelRequest(requestId);
          reject(new Error(`OCR raster worker request aborted: ${requestId}`));
        };

        input.signal.addEventListener('abort', pending.abortListener, {
          once: true,
        });
      }

      this.pending.set(requestId, pending as PendingRequest<unknown>);

      try {
        this.worker.postMessage(input.request);
      } catch (error) {
        this.pending.delete(requestId);
        this.clearPendingTimeout(pending);
        this.removeAbortListener(pending);
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to post OCR raster worker request.'),
        );
      }
    });
  }

  private onWorkerMessage(data: unknown): void {
    if (!isOcrRasterWorkerResponse(data)) {
      return;
    }

    const response = data;
    const pending = this.pending.get(response.requestId);

    if (!pending) {
      return;
    }

    const responseType = response.type;
    if (responseType === 'PROGRESS') {
      pending.onProgress?.(response.payload);
      return;
    }

    this.pending.delete(response.requestId);
    this.clearPendingTimeout(pending);
    this.removeAbortListener(pending);

    if (responseType === 'ERROR') {
      pending.reject(new Error(response.payload.message || 'OCR raster worker request failed.'));
      return;
    }

    if (responseType === 'REQUEST_CANCELLED') {
      pending.reject(new Error(response.payload.reason || 'OCR raster worker request cancelled.'));
      return;
    }

    if (responseType === 'PONG') {
      pending.resolve(response.payload);
      return;
    }

    if (responseType === 'RASTERIZE_RESULT') {
      pending.resolve(response.payload.pages);
      return;
    }

    pending.reject(new Error(`Unhandled OCR raster worker response: ${responseType}`));
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      this.clearPendingTimeout(pending);
      this.removeAbortListener(pending);
      pending.reject(error);
    }

    this.pending.clear();
  }

  private clearPendingTimeout<T>(pending: PendingRequest<T>): void {
    if (pending.timeoutId !== undefined) {
      window.clearTimeout(pending.timeoutId);
    }
  }

  private removeAbortListener<T>(pending: PendingRequest<T>): void {
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
  }
}

export function createBrowserOcrRasterWorkerFactory(
  workerUrl: URL,
): OcrRasterWorkerFactory {
  return () =>
    new Worker(workerUrl, {
      type: 'module',
    }) as unknown as OcrRasterWorkerLike;
}

export function createDefaultOcrRasterWorkerClient(
  options: {
    requestTimeoutMs?: number;
  } = {},
): OcrRasterWorkerClient {
  return new OcrRasterWorkerClient({
    workerFactory: createBrowserOcrRasterWorkerFactory(
      new URL('./ocrRasterWorkerEntrypoint.ts', import.meta.url),
    ),
    requestTimeoutMs: options.requestTimeoutMs,
  });
}
