import type {
  FlattenWriterExportInput,
  FlattenWriterExportResult,
} from '../writer-v2/export/flattenedPdfExport';
import type {
  ExportPdfHubProjectInput,
  ExportPdfHubProjectResult,
  ImportPdfHubProjectResult,
} from '../writer-v2/export/projectZip';

export type ExportWorkerRequestType =
  | 'PING'
  | 'FLATTEN_PDF'
  | 'PACK_PROJECT_ZIP'
  | 'UNPACK_PROJECT_ZIP'
  | 'CANCEL_REQUEST';

export type ExportWorkerResponseType =
  | 'PONG'
  | 'FLATTEN_RESULT'
  | 'PACK_RESULT'
  | 'UNPACK_RESULT'
  | 'REQUEST_CANCELLED'
  | 'ERROR';

export interface ExportWorkerBaseRequest {
  requestId: string;
  type: ExportWorkerRequestType;
}

export interface ExportWorkerPingRequest extends ExportWorkerBaseRequest {
  type: 'PING';
}

export interface ExportWorkerFlattenPdfRequest extends ExportWorkerBaseRequest {
  type: 'FLATTEN_PDF';
  payload: FlattenWriterExportInput;
}

export interface ExportWorkerPackProjectZipRequest extends ExportWorkerBaseRequest {
  type: 'PACK_PROJECT_ZIP';
  payload: ExportPdfHubProjectInput;
}

export interface ExportWorkerUnpackProjectZipRequest extends ExportWorkerBaseRequest {
  type: 'UNPACK_PROJECT_ZIP';
  payload: {
    projectBytes: Uint8Array;
  };
}

export interface ExportWorkerCancelRequest extends ExportWorkerBaseRequest {
  type: 'CANCEL_REQUEST';
  targetRequestId: string;
}

export type ExportWorkerRequest =
  | ExportWorkerPingRequest
  | ExportWorkerFlattenPdfRequest
  | ExportWorkerPackProjectZipRequest
  | ExportWorkerUnpackProjectZipRequest
  | ExportWorkerCancelRequest;

export interface ExportWorkerBaseResponse {
  requestId: string;
  type: ExportWorkerResponseType;
}

export interface ExportWorkerPongResponse extends ExportWorkerBaseResponse {
  type: 'PONG';
  payload: {
    ok: true;
    workerVersion: string;
  };
}

export interface ExportWorkerFlattenResultResponse extends ExportWorkerBaseResponse {
  type: 'FLATTEN_RESULT';
  payload: {
    result: FlattenWriterExportResult;
  };
}

export interface ExportWorkerPackResultResponse extends ExportWorkerBaseResponse {
  type: 'PACK_RESULT';
  payload: {
    result: ExportPdfHubProjectResult;
  };
}

export interface ExportWorkerUnpackResultResponse extends ExportWorkerBaseResponse {
  type: 'UNPACK_RESULT';
  payload: {
    result: ImportPdfHubProjectResult;
  };
}

export interface ExportWorkerRequestCancelledResponse extends ExportWorkerBaseResponse {
  type: 'REQUEST_CANCELLED';
  payload: {
    reason?: string;
  };
}

export interface ExportWorkerErrorResponse extends ExportWorkerBaseResponse {
  type: 'ERROR';
  payload: {
    message: string;
    code?: string;
    stack?: string;
  };
}

export type ExportWorkerResponse =
  | ExportWorkerPongResponse
  | ExportWorkerFlattenResultResponse
  | ExportWorkerPackResultResponse
  | ExportWorkerUnpackResultResponse
  | ExportWorkerRequestCancelledResponse
  | ExportWorkerErrorResponse;

export function createExportWorkerRequestId(
  prefix = 'export-worker-request',
): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isExportWorkerResponse(
  value: unknown,
): value is ExportWorkerResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ExportWorkerResponse>;

  return typeof candidate.requestId === 'string'
    && typeof candidate.type === 'string';
}
