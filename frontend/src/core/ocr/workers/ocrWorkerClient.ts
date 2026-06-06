import type {
  OcrWorkerProgressPayload,
  OcrWorkerRecognizePagesPayload,
  OcrWorkerRequest,
  OcrWorkerResponse,
} from './ocrWorkerTypes';
import {
  createOcrWorkerRequestId,
  isOcrWorkerResponse,
} from './ocrWorkerTypes';
import type { OcrDocumentResult } from '../types';

export interface OcrWorkerLike {
  postMessage: (message: OcrWorkerRequest) => void;
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

export type OcrWorkerFactory = () => OcrWorkerLike;

export interface OcrWorkerClientOptions {
  workerFactory: OcrWorkerFactory;
  requestIdFactory?: () => string;
  requestTimeoutMs?: number;
}

export interface OcrWorkerRecognizeOptions {
  signal?: AbortSignal;
  onProgress?: (progress: OcrWorkerProgressPayload) => void;
}

interface PendingRequest<T> {
  requestId: string;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: OcrWorkerProgressPayload) => void;
  timeoutId?: number;
  abortListener?: () => void;
}

export class OcrWorkerClient {
  private readonly worker: OcrWorkerLike;

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
      : 'OCR worker failed.';

    this.rejectAll(new Error(message));
  };

  constructor(options: OcrWorkerClientOptions) {
    this.worker = options.workerFactory();
    this.requestIdFactory =
      options.requestIdFactory ?? (() => createOcrWorkerRequestId());
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;

    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleError);
  }

  ping(options: {
    signal?: AbortSignal;
  } = {}): Promise<{
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
      resolveResponse: (response) => {
        if (response.type !== 'PONG') {
          throw new Error(`Unexpected OCR worker response: ${response.type}`);
        }

        return response.payload;
      },
    });
  }

  recognizePages(
    payload: OcrWorkerRecognizePagesPayload,
    options: OcrWorkerRecognizeOptions = {},
  ): Promise<OcrDocumentResult> {
    const requestId = this.requestIdFactory();

    return this.sendRequest({
      request: {
        requestId,
        type: 'RECOGNIZE_PAGES',
        payload,
      },
      signal: options.signal,
      onProgress: options.onProgress,
      resolveResponse: (response) => {
        if (response.type !== 'RECOGNIZE_RESULT') {
          throw new Error(`Unexpected OCR worker response: ${response.type}`);
        }

        return response.payload.result;
      },
    });
  }

  cancelRequest(
    requestId: string,
  ): void {
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

    this.rejectAll(new Error('OCR worker client disposed.'));
    this.worker.terminate();
  }

  getPendingRequestCount(): number {
    return this.pending.size;
  }

  private sendRequest<T>(input: {
    request: OcrWorkerRequest;
    signal?: AbortSignal;
    onProgress?: (progress: OcrWorkerProgressPayload) => void;
    resolveResponse: (response: OcrWorkerResponse) => T;
  }): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error('OCR worker client is disposed.'));
    }

    if (input.signal?.aborted) {
      return Promise.reject(new Error('OCR worker request aborted before start.'));
    }

    return new Promise<T>((resolve, reject) => {
      const requestId = input.request.requestId;

      const pending: PendingRequest<T> = {
        requestId,
        resolve,
        reject,
        onProgress: input.onProgress,
      };

      pending.timeoutId = window.setTimeout(() => {
        this.pending.delete(requestId);
        this.removeAbortListener(input.signal, pending);
        this.cancelRequest(requestId);
        reject(new Error(`OCR worker request timed out: ${requestId}`));
      }, this.requestTimeoutMs);

      if (input.signal) {
        pending.abortListener = () => {
          this.pending.delete(requestId);
          this.clearPendingTimeout(pending);
          this.cancelRequest(requestId);
          reject(new Error(`OCR worker request aborted: ${requestId}`));
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
        this.removeAbortListener(input.signal, pending);
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to post OCR worker request.'),
        );
      }
    }).then((value) => value);
  }

  private onWorkerMessage(
    data: unknown,
  ): void {
    if (!isOcrWorkerResponse(data)) {
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
    this.removeAbortListener(undefined, pending);

    if (responseType === 'ERROR') {
      pending.reject(
        new Error(response.payload.message || 'OCR worker request failed.'),
      );
      return;
    }

    if (responseType === 'REQUEST_CANCELLED') {
      pending.reject(
        new Error(response.payload.reason || 'OCR worker request cancelled.'),
      );
      return;
    }

    try {
      if (responseType === 'PONG') {
        pending.resolve(response.payload);
        return;
      }

      if (responseType === 'RECOGNIZE_RESULT') {
        pending.resolve(response.payload.result);
        return;
      }

      pending.reject(new Error(`Unhandled OCR worker response: ${responseType}`));
    } catch (error) {
      pending.reject(
        error instanceof Error
          ? error
          : new Error('OCR worker response handling failed.'),
      );
    }
  }

  private rejectAll(
    error: Error,
  ): void {
    for (const pending of this.pending.values()) {
      this.clearPendingTimeout(pending);
      pending.reject(error);
    }

    this.pending.clear();
  }

  private clearPendingTimeout<T>(
    pending: PendingRequest<T>,
  ): void {
    if (pending.timeoutId !== undefined) {
      window.clearTimeout(pending.timeoutId);
    }
  }

  private removeAbortListener<T>(
    signal: AbortSignal | undefined,
    pending: PendingRequest<T>,
  ): void {
    if (signal && pending.abortListener) {
      signal.removeEventListener('abort', pending.abortListener);
    }
  }
}

export function createBrowserOcrWorkerFactory(
  workerUrl: URL,
): OcrWorkerFactory {
  return () =>
    new Worker(workerUrl, {
      type: 'module',
    }) as unknown as OcrWorkerLike;
}

export function createDefaultOcrWorkerClient(
  options: {
    requestTimeoutMs?: number;
  } = {},
): OcrWorkerClient {
  return new OcrWorkerClient({
    workerFactory: createBrowserOcrWorkerFactory(
      new URL('./ocrWorkerEntrypoint.ts', import.meta.url),
    ),
    requestTimeoutMs: options.requestTimeoutMs,
  });
}
