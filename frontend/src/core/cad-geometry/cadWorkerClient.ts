import type {
  CadHarvestInput,
  CadHarvestProgress,
  CadHarvestResult,
  CadWorkerRequest,
  CadWorkerResponse,
  OperatorVectorsHarvestInput,
  OperatorVectorsHarvestResult,
  Pdf3DExtractInput,
  Piping3DClashInput,
  Piping3DClashResult,
} from './cadWorkerTypes';
import type { Pdf3DExtractResult } from '../cad-3d/pdf3dTypes';
import { createCadWorkerRequestId, isCadWorkerResponse } from './cadWorkerTypes';
import { dispatchCadWorkerRequest } from './cadWorkerEntrypoint';

export interface CadWorkerLike {
  postMessage: (message: CadWorkerRequest) => void;
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

export type CadWorkerFactory = () => CadWorkerLike;

export interface CadWorkerClientOptions {
  workerFactory?: CadWorkerFactory;
  requestIdFactory?: () => string;
  requestTimeoutMs?: number;
}

export interface CadHarvestRequestOptions {
  signal?: AbortSignal;
  onProgress?: (progress: CadHarvestProgress) => void;
}

interface PendingRequest<T> {
  requestId: string;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: CadHarvestProgress) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
  abortListener?: () => void;
}

/**
 * In-memory fallback worker for non-browser/test environments where Web Workers are unavailable.
 */
class InMemoryCadWorker implements CadWorkerLike {
  private messageListeners: Array<(event: MessageEvent) => void> = [];

  postMessage(message: CadWorkerRequest): void {
    queueMicrotask(() => {
      void dispatchCadWorkerRequest(message, (res) => this.emitMessage(res));
    });
  }

  terminate(): void {
    this.messageListeners = [];
  }

  addEventListener(type: 'message' | 'error', listener: (event: MessageEvent | ErrorEvent) => void): void {
    if (type === 'message') {
      this.messageListeners.push(listener as (event: MessageEvent) => void);
    }
  }

  removeEventListener(type: 'message' | 'error', listener: (event: MessageEvent | ErrorEvent) => void): void {
    if (type === 'message') {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    }
  }

  private emitMessage(data: CadWorkerResponse): void {
    const event = { data } as MessageEvent;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }
}

export function defaultCadWorkerFactory(): CadWorkerLike {
  if (typeof Worker !== 'undefined') {
    try {
      return new Worker(new URL('./cadWorkerEntrypoint.ts', import.meta.url), {
        type: 'module',
      }) as unknown as CadWorkerLike;
    } catch {
      return new InMemoryCadWorker();
    }
  }
  return new InMemoryCadWorker();
}

export class CadWorkerClient {
  private readonly worker: CadWorkerLike;
  private readonly requestIdFactory: () => string;
  private readonly requestTimeoutMs: number;
  private readonly pending = new Map<string, PendingRequest<unknown>>();
  private isTerminated = false;

  constructor(options: CadWorkerClientOptions = {}) {
    const factory = options.workerFactory ?? defaultCadWorkerFactory;
    this.worker = factory();
    this.requestIdFactory = options.requestIdFactory ?? createCadWorkerRequestId;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30000;

    this.onWorkerMessage = this.onWorkerMessage.bind(this);
    this.onWorkerError = this.onWorkerError.bind(this);

    this.worker.addEventListener('message', this.onWorkerMessage);
    this.worker.addEventListener('error', this.onWorkerError);
  }

  public async ping(options: { signal?: AbortSignal } = {}): Promise<void> {
    await this.sendRequest<void>({ type: 'PING' }, options);
  }

  public async harvestPageGeometry(
    input: CadHarvestInput,
    options: CadHarvestRequestOptions = {},
  ): Promise<CadHarvestResult> {
    return this.sendRequest<CadHarvestResult>(
      {
        type: 'HARVEST_PAGE_GEOMETRY',
        payload: input,
      } as CadWorkerRequest,
      options,
    );
  }

  public async harvestOperatorListVectors(
    input: OperatorVectorsHarvestInput,
    options: CadHarvestRequestOptions = {},
  ): Promise<OperatorVectorsHarvestResult> {
    return this.sendRequest<OperatorVectorsHarvestResult>(
      {
        type: 'HARVEST_OPERATOR_LIST',
        payload: input,
      } as CadWorkerRequest,
      options,
    );
  }

  public async buildPiping3DAndAuditClashes(
    input: Piping3DClashInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<Piping3DClashResult> {
    return this.sendRequest<Piping3DClashResult>(
      {
        type: 'BUILD_PIPING_3D_AND_AUDIT_CLASHES',
        payload: input,
      } as CadWorkerRequest,
      options,
    );
  }

  public async parsePdf3DAnnotations(
    input: Pdf3DExtractInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<Pdf3DExtractResult> {
    return this.sendRequest<Pdf3DExtractResult>(
      {
        type: 'PARSE_PDF_3D_ANNOTATIONS',
        payload: input,
      } as CadWorkerRequest,
      options,
    );
  }

  public terminate(): void {
    if (this.isTerminated) return;
    this.isTerminated = true;

    for (const [requestId, request] of this.pending.entries()) {
      if (request.timeoutId) clearTimeout(request.timeoutId);
      request.reject(new Error(`CadWorkerClient terminated while request ${requestId} was pending.`));
    }
    this.pending.clear();

    this.worker.removeEventListener('message', this.onWorkerMessage);
    this.worker.removeEventListener('error', this.onWorkerError);
    this.worker.terminate();
  }

  private sendRequest<T>(
    request: CadWorkerRequest | { type: 'PING' },
    options: CadHarvestRequestOptions = {},
  ): Promise<T> {
    if (this.isTerminated) {
      return Promise.reject(new Error('CadWorkerClient has been terminated.'));
    }

    const requestId = this.requestIdFactory();
    const fullRequest = { ...request, requestId } as CadWorkerRequest;

    return new Promise<T>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (this.requestTimeoutMs > 0) {
        timeoutId = setTimeout(() => {
          this.cancelPendingRequest(requestId, new Error(`CadWorker request ${requestId} timed out.`));
        }, this.requestTimeoutMs);
      }

      let abortListener: (() => void) | undefined;
      if (options.signal) {
        if (options.signal.aborted) {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new Error('Request aborted before dispatch.'));
          return;
        }

        abortListener = () => {
          this.cancelPendingRequest(requestId, new Error('Request aborted by caller.'));
        };
        options.signal.addEventListener('abort', abortListener, { once: true });
      }

      const pendingRecord: PendingRequest<unknown> = {
        requestId,
        resolve: resolve as (val: unknown) => void,
        reject,
        onProgress: options.onProgress,
        timeoutId,
        abortListener,
      };

      this.pending.set(requestId, pendingRecord);

      try {
        this.worker.postMessage(fullRequest);
      } catch (err) {
        this.cancelPendingRequest(
          requestId,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    });
  }

  private onWorkerMessage(event: MessageEvent | ErrorEvent): void {
    if (!('data' in event) || !isCadWorkerResponse(event.data)) {
      return;
    }

    const response = event.data;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;

    if (response.type === 'HARVEST_PROGRESS') {
      pending.onProgress?.(response.payload);
      return;
    }

    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    this.pending.delete(response.requestId);

    if (response.type === 'PONG') {
      pending.resolve(undefined);
      return;
    }

    if (
      response.type === 'HARVEST_RESULT' ||
      response.type === 'OPERATOR_VECTORS_RESULT' ||
      response.type === 'PIPING_3D_CLASH_RESULT' ||
      response.type === 'PDF_3D_EXTRACT_RESULT'
    ) {
      pending.resolve(response.payload);
      return;
    }

    if (response.type === 'ERROR') {
      pending.reject(new Error(response.error));
      return;
    }

    if (response.type === 'REQUEST_CANCELLED') {
      pending.reject(new Error(`Request ${response.requestId} was cancelled.`));
    }
  }

  private onWorkerError(event: MessageEvent | ErrorEvent): void {
    const errorMsg = 'message' in event ? event.message : 'Unknown worker error';
    for (const request of this.pending.values()) {
      if (request.timeoutId) clearTimeout(request.timeoutId);
      request.reject(new Error(`Worker error: ${errorMsg}`));
    }
    this.pending.clear();
  }

  private cancelPendingRequest(requestId: string, error: Error): void {
    const request = this.pending.get(requestId);
    if (!request) return;

    if (request.timeoutId) clearTimeout(request.timeoutId);
    this.pending.delete(requestId);
    request.reject(error);
  }
}
