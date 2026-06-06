import {
  rasterizePdfPageForOcr,
  rasterizePdfPagesForOcr,
  rasterizedPdfPageToOcrEnginePageInput,
  rasterizedPdfPagesToOcrEnginePageInputs,
} from '../pdfPageRasterizer';
import type {
  OcrRasterWorkerProgressPayload,
  OcrRasterWorkerRequest,
  OcrRasterWorkerResponse,
} from './ocrRasterWorkerTypes';

export interface OcrRasterWorkerScopeLike {
  postMessage: (message: OcrRasterWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<OcrRasterWorkerRequest>) => void,
  ) => void;
}

export interface OcrRasterWorkerRuntimeState {
  activeRequests: Map<string, AbortController>;
}

export interface CreateOcrRasterWorkerMessageHandlerInput {
  state?: OcrRasterWorkerRuntimeState;
  workerVersion?: string;
  postMessage: (response: OcrRasterWorkerResponse) => void;
}

export function installOcrRasterWorkerEntrypoint(
  scope: OcrRasterWorkerScopeLike = self as unknown as OcrRasterWorkerScopeLike,
  options: Omit<CreateOcrRasterWorkerMessageHandlerInput, 'postMessage'> = {},
): OcrRasterWorkerRuntimeState {
  const state: OcrRasterWorkerRuntimeState = {
    activeRequests: new Map(),
  };

  const handler = createOcrRasterWorkerMessageHandler({
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

export function createOcrRasterWorkerMessageHandler(
  input: CreateOcrRasterWorkerMessageHandlerInput,
): (request: OcrRasterWorkerRequest) => Promise<void> {
  const workerVersion = input.workerVersion ?? 'ocr-raster-worker-v1';
  const state = input.state ?? {
    activeRequests: new Map<string, AbortController>(),
  };

  return async (request: OcrRasterWorkerRequest): Promise<void> => {
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
              reason: 'OCR raster worker request cancelled.',
            },
          });
        }

        return;
      }

      if (request.type === 'RASTERIZE_PAGES') {
        await handleRasterizePagesRequest({
          request,
          state,
          postMessage: input.postMessage,
        });
        return;
      }

      if (request.type === 'RASTERIZE_REGION') {
        await handleRasterizeRegionRequest({
          request,
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
          message: `Unsupported OCR raster worker request type: ${reqAsBasic.type}`,
          code: 'UNSUPPORTED_OCR_RASTER_WORKER_REQUEST',
        },
      });
    } catch (error) {
      input.postMessage({
        requestId: request.requestId,
        type: 'ERROR',
        payload: {
          message: error instanceof Error
            ? error.message
            : 'OCR raster worker request failed.',
          code: 'OCR_RASTER_WORKER_REQUEST_FAILED',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  };
}

async function handleRasterizePagesRequest(input: {
  request: Extract<OcrRasterWorkerRequest, { type: 'RASTERIZE_PAGES' }>;
  state: OcrRasterWorkerRuntimeState;
  postMessage: (response: OcrRasterWorkerResponse) => void;
}): Promise<void> {
  const { request } = input;
  const controller = new AbortController();

  input.state.activeRequests.set(request.requestId, controller);

  try {
    postProgress(input, {
      status: 'queued',
      completedPages: 0,
      totalPages: request.payload.pageIndexes.length,
      message: 'OCR raster worker queued page rasterization.',
    });

    const result = await rasterizePdfPagesForOcr({
      pdfBytes: request.payload.pdfBytes,
      pageIndexes: request.payload.pageIndexes,
      scale: request.payload.scale,
      maxCanvasPixels: request.payload.maxCanvasPixels,
      mimeType: request.payload.mimeType,
      quality: request.payload.quality,
    });

    throwIfAborted(controller.signal);

    const pages = rasterizedPdfPagesToOcrEnginePageInputs(result.pages);

    postProgress(input, {
      status: 'completed',
      completedPages: pages.length,
      totalPages: request.payload.pageIndexes.length,
      message: 'OCR raster worker completed page rasterization.',
    });

    input.postMessage({
      requestId: request.requestId,
      type: 'RASTERIZE_RESULT',
      payload: {
        pages,
      },
    });
  } catch (error) {
    postRasterErrorOrCancellation({
      requestId: request.requestId,
      error,
      signal: controller.signal,
      postMessage: input.postMessage,
    });
  } finally {
    input.state.activeRequests.delete(request.requestId);
  }
}

async function handleRasterizeRegionRequest(input: {
  request: Extract<OcrRasterWorkerRequest, { type: 'RASTERIZE_REGION' }>;
  state: OcrRasterWorkerRuntimeState;
  postMessage: (response: OcrRasterWorkerResponse) => void;
}): Promise<void> {
  const { request } = input;
  const controller = new AbortController();

  input.state.activeRequests.set(request.requestId, controller);

  try {
    postProgress(input, {
      status: 'queued',
      completedPages: 0,
      totalPages: 1,
      activePageIndex: request.payload.pageIndex,
      message: 'OCR raster worker queued region rasterization.',
    });

    const page = await rasterizePdfPageForOcr({
      pdfBytes: request.payload.pdfBytes,
      pageIndex: request.payload.pageIndex,
      region: request.payload.region,
      scale: request.payload.scale,
      maxCanvasPixels: request.payload.maxCanvasPixels,
      mimeType: request.payload.mimeType,
      quality: request.payload.quality,
    });

    throwIfAborted(controller.signal);

    postProgress(input, {
      status: 'completed',
      completedPages: 1,
      totalPages: 1,
      activePageIndex: request.payload.pageIndex,
      message: 'OCR raster worker completed region rasterization.',
    });

    input.postMessage({
      requestId: request.requestId,
      type: 'RASTERIZE_RESULT',
      payload: {
        pages: [
          rasterizedPdfPageToOcrEnginePageInput(page),
        ],
      },
    });
  } catch (error) {
    postRasterErrorOrCancellation({
      requestId: request.requestId,
      error,
      signal: controller.signal,
      postMessage: input.postMessage,
    });
  } finally {
    input.state.activeRequests.delete(request.requestId);
  }
}

function postProgress(
  input: {
    request: { requestId: string };
    postMessage: (response: OcrRasterWorkerResponse) => void;
  },
  progress: OcrRasterWorkerProgressPayload,
): void {
  input.postMessage({
    requestId: input.request.requestId,
    type: 'PROGRESS',
    payload: progress,
  });
}

function postRasterErrorOrCancellation(input: {
  requestId: string;
  error: unknown;
  signal: AbortSignal;
  postMessage: (response: OcrRasterWorkerResponse) => void;
}): void {
  if (input.signal.aborted || isAbortLikeError(input.error)) {
    input.postMessage({
      requestId: input.requestId,
      type: 'REQUEST_CANCELLED',
      payload: {
        reason: 'OCR raster worker request cancelled.',
      },
    });
    return;
  }

  input.postMessage({
    requestId: input.requestId,
    type: 'ERROR',
    payload: {
      message: input.error instanceof Error
        ? input.error.message
        : 'OCR raster worker rasterization failed.',
      code: 'OCR_RASTER_WORKER_RASTERIZE_FAILED',
      stack: input.error instanceof Error ? input.error.stack : undefined,
    },
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('OCR raster worker request aborted.');
  }
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && /abort|cancel/i.test(error.message);
}

declare const self: {
  postMessage: (message: OcrRasterWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<OcrRasterWorkerRequest>) => void,
  ) => void;
};

installOcrRasterWorkerEntrypoint();
