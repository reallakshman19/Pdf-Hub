import type {
  OcrEngine,
  OcrEngineInput,
  OcrEngineRegistry,
} from '../engines/ocrEngineContract';
import {
  defaultOcrEngineRegistry,
} from '../engines/ocrEngineRegistry';
import {
  getOcrProfile,
} from '../ocrProfiles';
import type {
  OcrDocumentResult,
  OcrPageResult,
} from '../types';
import type {
  OcrWorkerProgressPayload,
  OcrWorkerRequest,
  OcrWorkerResponse,
} from './ocrWorkerTypes';

export interface OcrWorkerScopeLike {
  postMessage: (message: OcrWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<OcrWorkerRequest>) => void,
  ) => void;
}

export interface CreateOcrWorkerHandlerOptions {
  registry?: OcrEngineRegistry;
  workerVersion?: string;
  now?: () => string;
}

export interface OcrWorkerRuntimeState {
  activeRequests: Map<string, AbortController>;
}

export function installOcrWorkerEntrypoint(
  scope: OcrWorkerScopeLike = self as unknown as OcrWorkerScopeLike,
  options: CreateOcrWorkerHandlerOptions = {},
): OcrWorkerRuntimeState {
  const state: OcrWorkerRuntimeState = {
    activeRequests: new Map(),
  };

  const handler = createOcrWorkerMessageHandler({
    ...options,
    state,
    postMessage: (response) => {
      scope.postMessage(response);
    },
  });

  scope.addEventListener('message', (event) => {
    void handler(event.data);
  });

  return state;
}

export interface CreateOcrWorkerMessageHandlerInput extends CreateOcrWorkerHandlerOptions {
  state?: OcrWorkerRuntimeState;
  postMessage: (response: OcrWorkerResponse) => void;
}

export function createOcrWorkerMessageHandler(
  input: CreateOcrWorkerMessageHandlerInput,
): (request: OcrWorkerRequest) => Promise<void> {
  const registry = input.registry ?? defaultOcrEngineRegistry;
  const workerVersion = input.workerVersion ?? 'ocr-worker-v1';
  const state = input.state ?? {
    activeRequests: new Map<string, AbortController>(),
  };

  return async (request: OcrWorkerRequest): Promise<void> => {
    try {
      if (request.type === 'PING') {
        input.postMessage({
          requestId: request.requestId,
          type: 'PONG',
          payload: {
            ok: true,
            workerVersion,
          },
        });
        return;
      }

      if (request.type === 'CANCEL_REQUEST') {
        const controller = state.activeRequests.get(request.targetRequestId);

        if (controller) {
          controller.abort();
          state.activeRequests.delete(request.targetRequestId);

          input.postMessage({
            requestId: request.targetRequestId,
            type: 'REQUEST_CANCELLED',
            payload: {
              reason: 'OCR worker request cancelled.',
            },
          });
        }

        return;
      }

      if (request.type === 'RECOGNIZE_PAGES') {
        await handleRecognizePagesRequest({
          request,
          registry,
          state,
          postMessage: input.postMessage,
        });
        return;
      }

      const reqAsBasic = request as unknown as { requestId: string; type: string };
      input.postMessage({
        requestId: reqAsBasic.requestId,
        type: 'ERROR',
        payload: {
          message: `Unsupported OCR worker request type: ${reqAsBasic.type}`,
          code: 'UNSUPPORTED_OCR_WORKER_REQUEST',
        },
      });
    } catch (error) {
      input.postMessage({
        requestId: request.requestId,
        type: 'ERROR',
        payload: {
          message: error instanceof Error
            ? error.message
            : 'OCR worker request failed.',
          code: 'OCR_WORKER_REQUEST_FAILED',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  };
}

async function handleRecognizePagesRequest(input: {
  request: Extract<OcrWorkerRequest, { type: 'RECOGNIZE_PAGES' }>;
  registry: OcrEngineRegistry;
  state: OcrWorkerRuntimeState;
  postMessage: (response: OcrWorkerResponse) => void;
}): Promise<void> {
  const { request } = input;
  const controller = new AbortController();

  input.state.activeRequests.set(request.requestId, controller);

  try {
    const engine = input.registry.getEngine(request.payload.engineId);

    if (!engine) {
      throw new Error(`OCR worker engine not found: ${request.payload.engineId}`);
    }

    input.postMessage({
      requestId: request.requestId,
      type: 'PROGRESS',
      payload: {
        status: 'queued',
        completedPages: 0,
        totalPages: request.payload.pages.length,
        message: 'OCR worker request queued.',
      },
    });

    const result = await recognizePagesWithProgress({
      engine,
      payload: request.payload,
      signal: controller.signal,
      postProgress: (progress) => {
        input.postMessage({
          requestId: request.requestId,
          type: 'PROGRESS',
          payload: progress,
        });
      },
    });

    throwIfAborted(controller.signal);

    input.postMessage({
      requestId: request.requestId,
      type: 'PROGRESS',
      payload: {
        status: 'completed',
        completedPages: result.pages.length,
        totalPages: request.payload.pages.length,
        message: 'OCR worker request completed.',
      },
    });

    input.postMessage({
      requestId: request.requestId,
      type: 'RECOGNIZE_RESULT',
      payload: {
        result,
      },
    });
  } catch (error) {
    if (isAbortLikeError(error) || controller.signal.aborted) {
      input.postMessage({
        requestId: request.requestId,
        type: 'REQUEST_CANCELLED',
        payload: {
          reason: 'OCR worker request cancelled.',
        },
      });
      return;
    }

    input.postMessage({
      requestId: request.requestId,
      type: 'ERROR',
      payload: {
        message: error instanceof Error
          ? error.message
          : 'OCR worker page recognition failed.',
        code: 'OCR_WORKER_RECOGNIZE_FAILED',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
  } finally {
    input.state.activeRequests.delete(request.requestId);
  }
}

export async function recognizePagesWithProgress(input: {
  engine: OcrEngine;
  payload: Extract<OcrWorkerRequest, { type: 'RECOGNIZE_PAGES' }>['payload'];
  signal: AbortSignal;
  postProgress: (progress: OcrWorkerProgressPayload) => void;
}): Promise<OcrDocumentResult> {
  const profile = getOcrProfile(input.payload.profileId);
  const pages: OcrPageResult[] = [];

  input.postProgress({
    status: 'running',
    completedPages: 0,
    totalPages: input.payload.pages.length,
    message: 'OCR worker recognition started.',
  });

  for (const page of input.payload.pages) {
    throwIfAborted(input.signal);

    input.postProgress({
      status: 'running',
      completedPages: pages.length,
      totalPages: input.payload.pages.length,
      activePageIndex: page.pageIndex,
      message: `Recognizing page ${page.pageIndex + 1}.`,
    });

    const pageResult = await input.engine.recognize({
      documentFingerprint: input.payload.documentFingerprint,
      profile,
      pages: [page],
      forceOcr: input.payload.forceOcr,
    } as OcrEngineInput);

    throwIfAborted(input.signal);

    pages.push(...pageResult.pages);

    input.postProgress({
      status: 'page-completed',
      completedPages: pages.length,
      totalPages: input.payload.pages.length,
      activePageIndex: page.pageIndex,
      message: `Page ${page.pageIndex + 1} completed.`,
    });
  }

  return {
    documentFingerprint: input.payload.documentFingerprint,
    createdAt: new Date().toISOString(),
    engineId: input.payload.engineId,
    profileId: input.payload.profileId,
    pages,
    diagnostics: pages.flatMap((page) => page.diagnostics ?? []),
  };
}

function throwIfAborted(
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    throw new Error('OCR worker request aborted.');
  }
}

function isAbortLikeError(
  error: unknown,
): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && /abort|cancel/i.test(error.message);
}

declare const self: {
  postMessage: (message: OcrWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<OcrWorkerRequest>) => void,
  ) => void;
};

installOcrWorkerEntrypoint();
