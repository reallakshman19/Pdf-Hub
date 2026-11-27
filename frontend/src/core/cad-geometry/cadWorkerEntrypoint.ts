import type {
  CadHarvestInput,
  CadHarvestProgress,
  CadHarvestResult,
  CadHarvestTelemetry,
  CadWorkerRequest,
  CadWorkerResponse,
  OperatorVectorsHarvestInput,
  OperatorVectorsHarvestResult,
  Pdf3DExtractInput,
  Piping3DClashInput,
  Piping3DClashResult,
} from './cadWorkerTypes';
import type { CadHarvestedPageGeometry, GeometryCleanOptions } from './types';
import { parseContentStreamVectors } from './pdfVectorStreamParser';
import { extractVectorsFromOperatorList } from './pdfOperatorVectorExtractor';
import { cleanAndNormalizeGeometry } from './cleanGeometry';
import { buildPlanarGraph, extractClosedLoops } from './planarGraph';
import { buildVolumetricPipingScene } from '../cad-3d/pipingVolumeBuilder';
import { runSpatialClashAudit } from '../cad-3d/clashDetector';
import { extractPdf3DAnnotations } from '../cad-3d/pdf3dAnnotation';
import type { Pdf3DExtractResult } from '../cad-3d/pdf3dTypes';

function finalizeCadHarvestFromRaw(
  rawGeometry: CadHarvestedPageGeometry,
  startTime: number,
  cleanOptions?: GeometryCleanOptions,
  onProgress?: (progress: CadHarvestProgress) => void,
): CadHarvestResult {
  onProgress?.({ phase: 'cleaning', progressPercent: 50 });
  const cleanedGeometry = cleanAndNormalizeGeometry(rawGeometry, cleanOptions);
  onProgress?.({ phase: 'cleaning', progressPercent: 75 });

  onProgress?.({ phase: 'dcel_topology', progressPercent: 85 });
  const planarGraph = buildPlanarGraph(cleanedGeometry.lines);
  const closedLoops = extractClosedLoops(planarGraph);
  onProgress?.({ phase: 'dcel_topology', progressPercent: 100 });

  const endTime = performance.now();

  const telemetry: CadHarvestTelemetry = {
    pageNumber: rawGeometry.pageNumber,
    durationMs: Math.round((endTime - startTime) * 100) / 100,
    rawSegmentsCount: rawGeometry.totalExtractedSegments,
    snappedVerticesCount: cleanedGeometry.snappedVertexCount,
    droppedDegenerateCount: cleanedGeometry.droppedDegenerateCount,
    mergedCollinearCount: cleanedGeometry.mergedCollinearCount,
    fittedArcsCount: cleanedGeometry.fittedArcCount,
    closedLoopsCount: closedLoops.length,
  };

  return {
    geometry: cleanedGeometry,
    closedLoops,
    telemetry,
  };
}

/**
 * Pure synchronous pipeline orchestrator for vector harvesting.
 * Can be executed in a dedicated Web Worker thread or directly in-process.
 */
export function executeCadHarvest(
  input: CadHarvestInput,
  onProgress?: (progress: CadHarvestProgress) => void,
): CadHarvestResult {
  const startTime = performance.now();
  onProgress?.({ phase: 'tokenizing', progressPercent: 10 });
  const rawGeometry = parseContentStreamVectors(input.contentStreamSource, {
    pageNumber: input.pageNumber,
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
  });
  onProgress?.({ phase: 'tokenizing', progressPercent: 35 });

  return finalizeCadHarvestFromRaw(rawGeometry, startTime, input.options, onProgress);
}

/**
 * Orchestrates Layer 1 OperatorList interpretation + geometric normalization + loop extraction.
 */
export function executeOperatorListHarvest(
  input: OperatorVectorsHarvestInput,
  onProgress?: (progress: CadHarvestProgress) => void,
): OperatorVectorsHarvestResult {
  const startTime = performance.now();
  onProgress?.({ phase: 'tokenizing', progressPercent: 10 });
  const extracted = extractVectorsFromOperatorList(input.operatorList, {
    pageNumber: input.pageNumber,
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
    viewportTransform: input.viewportTransform,
    extractOptions: input.extractOptions,
  });
  onProgress?.({ phase: 'tokenizing', progressPercent: 35 });

  const base = finalizeCadHarvestFromRaw(
    extracted.geometry,
    startTime,
    input.cleanOptions,
    onProgress,
  );
  const isRasterOnlyLikely =
    extracted.imageXObjectCount > 0 &&
    extracted.geometry.lines.length === 0 &&
    extracted.geometry.beziers.length === 0;

  return {
    ...base,
    layersDetected: extracted.layersDetected,
    imageXObjectCount: extracted.imageXObjectCount,
    isRasterOnlyLikely,
    skippedOutOfRegionCount: extracted.skippedOutOfRegionCount,
  };
}

export function executePiping3DAndClashAudit(input: Piping3DClashInput): Piping3DClashResult {
  const scene = buildVolumetricPipingScene(input.model, input.volumeOptions);
  const clashReport = runSpatialClashAudit(scene.parts, input.clashOptions);
  return { scene, clashReport };
}

export async function executePdf3DAnnotationParse(
  input: Pdf3DExtractInput,
): Promise<Pdf3DExtractResult> {
  return extractPdf3DAnnotations(input.pdfBytes);
}

/**
 * Shared worker request dispatcher used by both DedicatedWorkerGlobalScope and InMemoryCadWorker.
 */
export async function dispatchCadWorkerRequest(
  request: CadWorkerRequest,
  emit: (response: CadWorkerResponse) => void,
): Promise<void> {
  if (request.type === 'PING') {
    emit({ requestId: request.requestId, type: 'PONG' });
    return;
  }

  try {
    if (request.type === 'HARVEST_PAGE_GEOMETRY') {
      const result = executeCadHarvest(request.payload, (progress) => {
        emit({
          requestId: request.requestId,
          type: 'HARVEST_PROGRESS',
          payload: progress,
        });
      });
      emit({
        requestId: request.requestId,
        type: 'HARVEST_RESULT',
        payload: result,
      });
      return;
    }

    if (request.type === 'HARVEST_OPERATOR_LIST') {
      const result = executeOperatorListHarvest(request.payload, (progress) => {
        emit({
          requestId: request.requestId,
          type: 'HARVEST_PROGRESS',
          payload: progress,
        });
      });
      emit({
        requestId: request.requestId,
        type: 'OPERATOR_VECTORS_RESULT',
        payload: result,
      });
      return;
    }

    if (request.type === 'BUILD_PIPING_3D_AND_AUDIT_CLASHES') {
      const result = executePiping3DAndClashAudit(request.payload);
      emit({
        requestId: request.requestId,
        type: 'PIPING_3D_CLASH_RESULT',
        payload: result,
      });
      return;
    }

    if (request.type === 'PARSE_PDF_3D_ANNOTATIONS') {
      const result = await executePdf3DAnnotationParse(request.payload);
      emit({
        requestId: request.requestId,
        type: 'PDF_3D_EXTRACT_RESULT',
        payload: result,
      });
    }
  } catch (err) {
    emit({
      requestId: request.requestId,
      type: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface CadWorkerScopeLike {
  postMessage: (message: CadWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<CadWorkerRequest>) => void,
  ) => void;
}

/**
 * Attaches standard Web Worker event listener when executed in DedicatedWorkerGlobalScope.
 */
const isWorkerScope =
  typeof self !== 'undefined' &&
  typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function';

if (isWorkerScope) {
  const scope = self as unknown as CadWorkerScopeLike;
  scope.addEventListener('message', (event: MessageEvent<CadWorkerRequest>) => {
    const request = event.data;
    if (!request || typeof request !== 'object') return;
    void dispatchCadWorkerRequest(request, (res) => scope.postMessage(res));
  });
}
