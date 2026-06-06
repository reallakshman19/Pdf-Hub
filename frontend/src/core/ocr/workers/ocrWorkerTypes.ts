import type { OcrEnginePageInput } from '../engines/ocrEngineContract';
import type { OcrDocumentResult } from '../types';
import type { OcrProfileId } from '../ocrProfiles';

export type OcrWorkerRequestType =
  | 'PING'
  | 'RECOGNIZE_PAGES'
  | 'CANCEL_REQUEST';

export type OcrWorkerResponseType =
  | 'PONG'
  | 'PROGRESS'
  | 'RECOGNIZE_RESULT'
  | 'REQUEST_CANCELLED'
  | 'ERROR';

export interface OcrWorkerBaseRequest {
  requestId: string;
  type: OcrWorkerRequestType;
}

export interface OcrWorkerPingRequest extends OcrWorkerBaseRequest {
  type: 'PING';
}

export interface OcrWorkerRecognizePagesRequest extends OcrWorkerBaseRequest {
  type: 'RECOGNIZE_PAGES';
  payload: OcrWorkerRecognizePagesPayload;
}

export interface OcrWorkerCancelRequest extends OcrWorkerBaseRequest {
  type: 'CANCEL_REQUEST';
  targetRequestId: string;
}

export type OcrWorkerRequest =
  | OcrWorkerPingRequest
  | OcrWorkerRecognizePagesRequest
  | OcrWorkerCancelRequest;

export interface OcrWorkerRecognizePagesPayload {
  documentFingerprint: string;
  engineId: string;
  profileId: OcrProfileId;
  pages: OcrEnginePageInput[];
  forceOcr?: boolean;
}

export interface OcrWorkerBaseResponse {
  requestId: string;
  type: OcrWorkerResponseType;
}

export interface OcrWorkerPongResponse extends OcrWorkerBaseResponse {
  type: 'PONG';
  payload: {
    ok: true;
    workerVersion: string;
  };
}

export interface OcrWorkerProgressResponse extends OcrWorkerBaseResponse {
  type: 'PROGRESS';
  payload: OcrWorkerProgressPayload;
}

export interface OcrWorkerRecognizeResultResponse extends OcrWorkerBaseResponse {
  type: 'RECOGNIZE_RESULT';
  payload: {
    result: OcrDocumentResult;
  };
}

export interface OcrWorkerRequestCancelledResponse extends OcrWorkerBaseResponse {
  type: 'REQUEST_CANCELLED';
  payload: {
    reason?: string;
  };
}

export interface OcrWorkerErrorResponse extends OcrWorkerBaseResponse {
  type: 'ERROR';
  payload: {
    message: string;
    code?: string;
    stack?: string;
  };
}

export type OcrWorkerResponse =
  | OcrWorkerPongResponse
  | OcrWorkerProgressResponse
  | OcrWorkerRecognizeResultResponse
  | OcrWorkerRequestCancelledResponse
  | OcrWorkerErrorResponse;

export interface OcrWorkerProgressPayload {
  status:
    | 'queued'
    | 'running'
    | 'page-completed'
    | 'completed'
    | 'failed'
    | 'cancelled';
  completedPages: number;
  totalPages: number;
  activePageIndex?: number;
  message?: string;
}

export function createOcrWorkerRequestId(
  prefix = 'ocr-worker-request',
): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isOcrWorkerResponse(
  value: unknown,
): value is OcrWorkerResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OcrWorkerResponse>;

  return typeof candidate.requestId === 'string'
    && typeof candidate.type === 'string';
}
