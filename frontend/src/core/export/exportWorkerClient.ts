import type {
  ExportWorkerRequest,
  ExportWorkerResponse,
} from './exportWorkerTypes';
import {
  createExportWorkerRequestId,
  isExportWorkerResponse,
} from './exportWorkerTypes';
import type {
  FlattenWriterExportInput,
  FlattenWriterExportResult,
} from '../writer-v2/export/flattenedPdfExport';
import type {
  ExportPdfHubProjectInput,
  ExportPdfHubProjectResult,
  ImportPdfHubProjectResult,
} from '../writer-v2/export/projectZip';

export interface ExportWorkerLike {
  postMessage: (message: ExportWorkerRequest) => void;
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

export type ExportWorkerFactory = () => ExportWorkerLike;

export interface ExportWorkerClientOptions {
  workerFactory: ExportWorkerFactory;
  requestIdFactory?: () => string;
  requestTimeoutMs?: number;
}

export interface ExportWorkerRequestOptions {
  signal?: AbortSignal;
}

interface PendingRequest<T> {
  requestId: string;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId?: number;
  abortListener?: () => void;
}

export class ExportWorkerClient {
  private readonly worker: ExportWorkerLike;

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
      : 'Export worker failed.';

    this.rejectAll(new Error(message));
  };

  constructor(options: ExportWorkerClientOptions) {
    this.worker = options.workerFactory();
    this.requestIdFactory =
      options.requestIdFactory ?? (() => createExportWorkerRequestId());
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;

    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleError);
  }

  ping(options: ExportWorkerRequestOptions = {}): Promise<{
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
          throw new Error(`Unexpected export worker response: ${response.type}`);
        }

        return response.payload;
      },
    });
  }

  flattenPdf(
    payload: FlattenWriterExportInput,
    options: ExportWorkerRequestOptions = {},
  ): Promise<FlattenWriterExportResult> {
    const requestId = this.requestIdFactory();

    return this.sendRequest({
      request: {
        requestId,
        type: 'FLATTEN_PDF',
        payload,
      },
      signal: options.signal,
      resolveResponse: (response) => {
        if (response.type !== 'FLATTEN_RESULT') {
          throw new Error(`Unexpected export worker response: ${response.type}`);
        }

        return response.payload.result;
      },
    });
  }

  packProjectZip(
    payload: ExportPdfHubProjectInput,
    options: ExportWorkerRequestOptions = {},
  ): Promise<ExportPdfHubProjectResult> {
    const requestId = this.requestIdFactory();

    return this.sendRequest({
      request: {
        requestId,
        type: 'PACK_PROJECT_ZIP',
        payload,
      },
      signal: options.signal,
      resolveResponse: (response) => {
        if (response.type !== 'PACK_RESULT') {
          throw new Error(`Unexpected export worker response: ${response.type}`);
        }

        return response.payload.result;
      },
    });
  }

  unpackProjectZip(
    projectBytes: Uint8Array,
    options: ExportWorkerRequestOptions = {},
  ): Promise<ImportPdfHubProjectResult> {
    const requestId = this.requestIdFactory();

    return this.sendRequest({
      request: {
        requestId,
        type: 'UNPACK_PROJECT_ZIP',
        payload: { projectBytes },
      },
      signal: options.signal,
      resolveResponse: (response) => {
        if (response.type !== 'UNPACK_RESULT') {
          throw new Error(`Unexpected export worker response: ${response.type}`);
        }

        return response.payload.result;
      },
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

    this.rejectAll(new Error('Export worker client disposed.'));
    this.worker.terminate();
  }

  getPendingRequestCount(): number {
    return this.pending.size;
  }

  private sendRequest<T>(input: {
    request: ExportWorkerRequest;
    signal?: AbortSignal;
    resolveResponse: (response: ExportWorkerResponse) => T;
  }): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error('Export worker client is disposed.'));
    }

    if (input.signal?.aborted) {
      return Promise.reject(new Error('Export worker request aborted before start.'));
    }

    return new Promise<T>((resolve, reject) => {
      const requestId = input.request.requestId;

      const pending: PendingRequest<T> = {
        requestId,
        resolve,
        reject,
      };

      pending.timeoutId = window.setTimeout(() => {
        this.pending.delete(requestId);
        this.removeAbortListener(input.signal, pending);
        this.cancelRequest(requestId);
        reject(new Error(`Export worker request timed out: ${requestId}`));
      }, this.requestTimeoutMs);

      if (input.signal) {
        pending.abortListener = () => {
          this.pending.delete(requestId);
          this.clearPendingTimeout(pending);
          this.cancelRequest(requestId);
          reject(new Error(`Export worker request aborted: ${requestId}`));
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
            : new Error('Failed to post export worker request.'),
        );
      }
    }).then((value) => value);
  }

  private onWorkerMessage(data: unknown): void {
    if (!isExportWorkerResponse(data)) {
      return;
    }

    const response = data;
    const pending = this.pending.get(response.requestId);

    if (!pending) {
      return;
    }

    this.pending.delete(response.requestId);
    this.clearPendingTimeout(pending);
    this.removeAbortListener(undefined, pending);

    const responseType = response.type;

    if (responseType === 'ERROR') {
      pending.reject(
        new Error(response.payload.message || 'Export worker request failed.'),
      );
      return;
    }

    if (responseType === 'REQUEST_CANCELLED') {
      pending.reject(
        new Error(response.payload.reason || 'Export worker request cancelled.'),
      );
      return;
    }

    try {
      if (responseType === 'PONG') {
        pending.resolve(response.payload);
        return;
      }

      if (responseType === 'FLATTEN_RESULT') {
        pending.resolve(response.payload.result);
        return;
      }

      if (responseType === 'PACK_RESULT') {
        pending.resolve(response.payload.result);
        return;
      }

      if (responseType === 'UNPACK_RESULT') {
        pending.resolve(response.payload.result);
        return;
      }

      pending.reject(new Error(`Unhandled export worker response: ${responseType}`));
    } catch (error) {
      pending.reject(
        error instanceof Error
          ? error
          : new Error('Export worker response handling failed.'),
      );
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      this.clearPendingTimeout(pending);
      pending.reject(error);
    }

    this.pending.clear();
  }

  private clearPendingTimeout<T>(pending: PendingRequest<T>): void {
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

export function createBrowserExportWorkerFactory(
  workerUrl: URL,
): ExportWorkerFactory {
  return () =>
    new Worker(workerUrl, {
      type: 'module',
    }) as unknown as ExportWorkerLike;
}

export function createDefaultExportWorkerClient(
  options: {
    requestTimeoutMs?: number;
  } = {},
): ExportWorkerClient {
  return new ExportWorkerClient({
    workerFactory: createBrowserExportWorkerFactory(
      new URL('./exportWorkerEntrypoint.ts', import.meta.url),
    ),
    requestTimeoutMs: options.requestTimeoutMs,
  });
}
