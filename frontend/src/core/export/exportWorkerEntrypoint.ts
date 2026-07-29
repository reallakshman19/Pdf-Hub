import { exportFlattenedWriterPdf } from '../writer-v2/export/flattenedPdfExport';
import {
  exportPdfHubWriterProject,
  importPdfHubWriterProject,
} from '../writer-v2/export/projectZip';
import type {
  ExportWorkerRequest,
  ExportWorkerResponse,
} from './exportWorkerTypes';

export interface ExportWorkerScopeLike {
  postMessage: (message: ExportWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<ExportWorkerRequest>) => void,
  ) => void;
}

export interface CreateExportWorkerHandlerOptions {
  workerVersion?: string;
}

export interface ExportWorkerRuntimeState {
  activeRequests: Map<string, AbortController>;
}

export function installExportWorkerEntrypoint(
  scope: ExportWorkerScopeLike = self as unknown as ExportWorkerScopeLike,
  options: CreateExportWorkerHandlerOptions = {},
): ExportWorkerRuntimeState {
  const state: ExportWorkerRuntimeState = {
    activeRequests: new Map(),
  };

  const handler = createExportWorkerMessageHandler({
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

export interface CreateExportWorkerMessageHandlerInput extends CreateExportWorkerHandlerOptions {
  state?: ExportWorkerRuntimeState;
  postMessage: (response: ExportWorkerResponse) => void;
}

export function createExportWorkerMessageHandler(
  input: CreateExportWorkerMessageHandlerInput,
): (request: ExportWorkerRequest) => Promise<void> {
  const workerVersion = input.workerVersion ?? 'export-worker-v1';
  const state = input.state ?? {
    activeRequests: new Map<string, AbortController>(),
  };

  return async (request: ExportWorkerRequest): Promise<void> => {
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
              reason: 'Export worker request cancelled.',
            },
          });
        }

        return;
      }

      if (request.type === 'FLATTEN_PDF') {
        const controller = new AbortController();
        state.activeRequests.set(request.requestId, controller);

        try {
          const result = await exportFlattenedWriterPdf(request.payload);

          input.postMessage({
            requestId: request.requestId,
            type: 'FLATTEN_RESULT',
            payload: { result },
          });
        } finally {
          state.activeRequests.delete(request.requestId);
        }
        return;
      }

      if (request.type === 'PACK_PROJECT_ZIP') {
        const controller = new AbortController();
        state.activeRequests.set(request.requestId, controller);

        try {
          const result = await exportPdfHubWriterProject(request.payload);

          input.postMessage({
            requestId: request.requestId,
            type: 'PACK_RESULT',
            payload: { result },
          });
        } finally {
          state.activeRequests.delete(request.requestId);
        }
        return;
      }

      if (request.type === 'UNPACK_PROJECT_ZIP') {
        const controller = new AbortController();
        state.activeRequests.set(request.requestId, controller);

        try {
          const result = await importPdfHubWriterProject(request.payload.projectBytes);

          input.postMessage({
            requestId: request.requestId,
            type: 'UNPACK_RESULT',
            payload: { result },
          });
        } finally {
          state.activeRequests.delete(request.requestId);
        }
        return;
      }

      const reqAsBasic = request as unknown as { requestId: string; type: string };
      input.postMessage({
        requestId: reqAsBasic.requestId,
        type: 'ERROR',
        payload: {
          message: `Unsupported export worker request type: ${reqAsBasic.type}`,
          code: 'UNSUPPORTED_EXPORT_WORKER_REQUEST',
        },
      });
    } catch (error) {
      input.postMessage({
        requestId: request.requestId,
        type: 'ERROR',
        payload: {
          message: error instanceof Error
            ? error.message
            : 'Export worker request failed.',
          code: 'EXPORT_WORKER_REQUEST_FAILED',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  };
}

declare const self: {
  postMessage: (message: ExportWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<ExportWorkerRequest>) => void,
  ) => void;
};

installExportWorkerEntrypoint();
