import type { PdfRect } from '../../writer-v2/types';
import type { OcrEnginePageInput } from '../engines/ocrEngineContract';
import type { PdfRasterImageMimeType } from '../pdfPageRasterizer';

export type OcrRasterWorkerRequestType =
  | 'PING'
  | 'RASTERIZE_PAGES'
  | 'RASTERIZE_REGION'
  | 'CANCEL_REQUEST';

export type OcrRasterWorkerResponseType =
  | 'PONG'
  | 'PROGRESS'
  | 'RASTERIZE_RESULT'
  | 'REQUEST_CANCELLED'
  | 'ERROR';

export interface OcrRasterWorkerBaseRequest {
  requestId: string;
  type: OcrRasterWorkerRequestType;
}

export interface OcrRasterWorkerPingRequest extends OcrRasterWorkerBaseRequest {
  type: 'PING';
}

export interface OcrRasterWorkerRasterizePagesRequest extends OcrRasterWorkerBaseRequest {
  type: 'RASTERIZE_PAGES';
  payload: OcrRasterizePagesPayload;
}

export interface OcrRasterWorkerRasterizeRegionRequest extends OcrRasterWorkerBaseRequest {
  type: 'RASTERIZE_REGION';
  payload: OcrRasterizeRegionPayload;
}

export interface OcrRasterWorkerCancelRequest extends OcrRasterWorkerBaseRequest {
  type: 'CANCEL_REQUEST';
  targetRequestId: string;
}

export type OcrRasterWorkerRequest =
  | OcrRasterWorkerPingRequest
  | OcrRasterWorkerRasterizePagesRequest
  | OcrRasterWorkerRasterizeRegionRequest
  | OcrRasterWorkerCancelRequest;

export interface OcrRasterizePagesPayload {
  pdfBytes: Uint8Array;
  pageIndexes: number[];
  scale: number;
  maxCanvasPixels: number;
  mimeType: PdfRasterImageMimeType;
  quality?: number;
}

export interface OcrRasterizeRegionPayload {
  pdfBytes: Uint8Array;
  pageIndex: number;
  region: PdfRect;
  scale: number;
  maxCanvasPixels: number;
  mimeType: PdfRasterImageMimeType;
  quality?: number;
}

export interface OcrRasterWorkerBaseResponse {
  requestId: string;
  type: OcrRasterWorkerResponseType;
}

export interface OcrRasterWorkerPongResponse extends OcrRasterWorkerBaseResponse {
  type: 'PONG';
  payload: {
    ok: true;
    workerVersion: string;
  };
}

export interface OcrRasterWorkerProgressResponse extends OcrRasterWorkerBaseResponse {
  type: 'PROGRESS';
  payload: OcrRasterWorkerProgressPayload;
}

export interface OcrRasterWorkerRasterizeResultResponse extends OcrRasterWorkerBaseResponse {
  type: 'RASTERIZE_RESULT';
  payload: {
    pages: OcrEnginePageInput[];
  };
}

export interface OcrRasterWorkerRequestCancelledResponse extends OcrRasterWorkerBaseResponse {
  type: 'REQUEST_CANCELLED';
  payload: {
    reason?: string;
  };
}

export interface OcrRasterWorkerErrorResponse extends OcrRasterWorkerBaseResponse {
  type: 'ERROR';
  payload: {
    message: string;
    code?: string;
    stack?: string;
  };
}

export type OcrRasterWorkerResponse =
  | OcrRasterWorkerPongResponse
  | OcrRasterWorkerProgressResponse
  | OcrRasterWorkerRasterizeResultResponse
  | OcrRasterWorkerRequestCancelledResponse
  | OcrRasterWorkerErrorResponse;

export interface OcrRasterWorkerProgressPayload {
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

export function createOcrRasterWorkerRequestId(
  prefix = 'ocr-raster-worker-request',
): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isOcrRasterWorkerResponse(
  value: unknown,
): value is OcrRasterWorkerResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OcrRasterWorkerResponse>;

  return typeof candidate.requestId === 'string'
    && typeof candidate.type === 'string';
}
