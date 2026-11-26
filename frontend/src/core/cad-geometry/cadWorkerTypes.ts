import type {
  AffineMatrix2D,
  CadClosedLoop,
  CadNormalizedGeometry,
  CadOperatorListInput,
  CadVectorExtractOptions,
  GeometryCleanOptions,
} from './types';
import type { FullXmlBuilderModel } from '../pipeline-geometry/types';
import type {
  PipingVolumeBuildOptions,
  PipingVolumeScene,
} from '../cad-3d/pipingVolumeBuilder';
import type { ClashAuditOptions, ClashAuditReport } from '../cad-3d/clashDetector';
import type { Pdf3DExtractResult } from '../cad-3d/pdf3dTypes';

export type CadWorkerRequestType =
  | 'PING'
  | 'HARVEST_PAGE_GEOMETRY'
  | 'HARVEST_OPERATOR_LIST'
  | 'BUILD_PIPING_3D_AND_AUDIT_CLASHES'
  | 'PARSE_PDF_3D_ANNOTATIONS'
  | 'CANCEL_REQUEST';

export type CadWorkerResponseType =
  | 'PONG'
  | 'HARVEST_PROGRESS'
  | 'HARVEST_RESULT'
  | 'OPERATOR_VECTORS_RESULT'
  | 'PIPING_3D_CLASH_RESULT'
  | 'PDF_3D_EXTRACT_RESULT'
  | 'REQUEST_CANCELLED'
  | 'ERROR';

export interface OperatorVectorsHarvestInput {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  viewportTransform?: AffineMatrix2D;
  operatorList: CadOperatorListInput;
  extractOptions?: CadVectorExtractOptions;
  cleanOptions?: GeometryCleanOptions;
}

export interface OperatorVectorsHarvestResult extends CadHarvestResult {
  layersDetected: string[];
  imageXObjectCount: number;
  isRasterOnlyLikely: boolean;
  skippedOutOfRegionCount: number;
}

export interface Piping3DClashInput {
  model: FullXmlBuilderModel;
  volumeOptions?: PipingVolumeBuildOptions;
  clashOptions?: ClashAuditOptions;
}

export interface Piping3DClashResult {
  scene: PipingVolumeScene;
  clashReport: ClashAuditReport;
}

export interface Pdf3DExtractInput {
  pdfBytes: Uint8Array;
}

export interface CadHarvestTelemetry {
  pageNumber: number;
  durationMs: number;
  rawSegmentsCount: number;
  snappedVerticesCount: number;
  droppedDegenerateCount: number;
  mergedCollinearCount: number;
  fittedArcsCount: number;
  closedLoopsCount: number;
}

export interface CadHarvestInput {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  contentStreamSource: string;
  options?: GeometryCleanOptions;
}

export interface CadHarvestResult {
  geometry: CadNormalizedGeometry;
  closedLoops: CadClosedLoop[];
  telemetry: CadHarvestTelemetry;
}

export interface CadHarvestProgress {
  phase: 'tokenizing' | 'cleaning' | 'dcel_topology';
  progressPercent: number;
}

export interface CadWorkerBaseRequest {
  requestId: string;
  type: CadWorkerRequestType;
}

export interface CadWorkerPingRequest extends CadWorkerBaseRequest {
  type: 'PING';
}

export interface CadWorkerHarvestRequest extends CadWorkerBaseRequest {
  type: 'HARVEST_PAGE_GEOMETRY';
  payload: CadHarvestInput;
}

export interface CadWorkerOperatorVectorsRequest extends CadWorkerBaseRequest {
  type: 'HARVEST_OPERATOR_LIST';
  payload: OperatorVectorsHarvestInput;
}

export interface CadWorkerPiping3DClashRequest extends CadWorkerBaseRequest {
  type: 'BUILD_PIPING_3D_AND_AUDIT_CLASHES';
  payload: Piping3DClashInput;
}

export interface CadWorkerParsePdf3DRequest extends CadWorkerBaseRequest {
  type: 'PARSE_PDF_3D_ANNOTATIONS';
  payload: Pdf3DExtractInput;
}

export interface CadWorkerCancelRequest extends CadWorkerBaseRequest {
  type: 'CANCEL_REQUEST';
  targetRequestId: string;
}

export type CadWorkerRequest =
  | CadWorkerPingRequest
  | CadWorkerHarvestRequest
  | CadWorkerOperatorVectorsRequest
  | CadWorkerPiping3DClashRequest
  | CadWorkerParsePdf3DRequest
  | CadWorkerCancelRequest;

export interface CadWorkerBaseResponse {
  requestId: string;
  type: CadWorkerResponseType;
}

export interface CadWorkerPongResponse extends CadWorkerBaseResponse {
  type: 'PONG';
}

export interface CadWorkerProgressResponse extends CadWorkerBaseResponse {
  type: 'HARVEST_PROGRESS';
  payload: CadHarvestProgress;
}

export interface CadWorkerResultResponse extends CadWorkerBaseResponse {
  type: 'HARVEST_RESULT';
  payload: CadHarvestResult;
}

export interface CadWorkerOperatorVectorsResponse extends CadWorkerBaseResponse {
  type: 'OPERATOR_VECTORS_RESULT';
  payload: OperatorVectorsHarvestResult;
}

export interface CadWorkerPiping3DClashResponse extends CadWorkerBaseResponse {
  type: 'PIPING_3D_CLASH_RESULT';
  payload: Piping3DClashResult;
}

export interface CadWorkerParsePdf3DResponse extends CadWorkerBaseResponse {
  type: 'PDF_3D_EXTRACT_RESULT';
  payload: Pdf3DExtractResult;
}

export interface CadWorkerCancelledResponse extends CadWorkerBaseResponse {
  type: 'REQUEST_CANCELLED';
}

export interface CadWorkerErrorResponse extends CadWorkerBaseResponse {
  type: 'ERROR';
  error: string;
}

export type CadWorkerResponse =
  | CadWorkerPongResponse
  | CadWorkerProgressResponse
  | CadWorkerResultResponse
  | CadWorkerOperatorVectorsResponse
  | CadWorkerPiping3DClashResponse
  | CadWorkerParsePdf3DResponse
  | CadWorkerCancelledResponse
  | CadWorkerErrorResponse;

export function createCadWorkerRequestId(): string {
  return `cad_worker_req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isCadWorkerResponse(val: unknown): val is CadWorkerResponse {
  if (typeof val !== 'object' || val === null) return false;
  const res = val as Partial<CadWorkerResponse>;
  return (
    typeof res.requestId === 'string' &&
    typeof res.type === 'string' &&
    [
      'PONG',
      'HARVEST_PROGRESS',
      'HARVEST_RESULT',
      'OPERATOR_VECTORS_RESULT',
      'PIPING_3D_CLASH_RESULT',
      'PDF_3D_EXTRACT_RESULT',
      'REQUEST_CANCELLED',
      'ERROR',
    ].includes(res.type)
  );
}
