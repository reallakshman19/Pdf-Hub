import type { OcrEnginePageInput } from './engines/ocrEngineContract';
import type { OcrProfileId } from './ocrProfiles';
import type { OcrDocumentResult } from './types';
import type { OcrJobRunnerSnapshot } from './ocrJobRunner';
import type { OcrWorkerClient } from './workers/ocrWorkerClient';
import type { OcrRasterWorkerClient } from './workers/ocrRasterWorkerClient';
import {
  rasterizeForOcrWithOptionalWorker,
  rasterWorkerProgressToMessage,
} from './ocrWorkerRasterBridge';
import {
  runWorkerOcrJob,
} from './ocrWorkerJobRunner';
import {
  runOcrJob,
} from './ocrJobRunner';

export type OcrPipelineMode =
  | 'main'
  | 'worker-ocr'
  | 'worker-raster-worker-ocr';

export interface OcrPipelineModeOption {
  id: OcrPipelineMode;
  label: string;
  description: string;
  usesWorkerRaster: boolean;
  usesWorkerOcr: boolean;
  recommendedFor: string;
}

export const OCR_PIPELINE_MODE_OPTIONS: OcrPipelineModeOption[] = [
  {
    id: 'main',
    label: 'Main thread',
    description: 'Rasterize and run OCR on the main thread. Best for debugging and fallback.',
    usesWorkerRaster: false,
    usesWorkerOcr: false,
    recommendedFor: 'Small files, tests, and fallback.',
  },
  {
    id: 'worker-ocr',
    label: 'Worker OCR',
    description: 'Rasterize on the main thread, then run OCR recognition in a worker.',
    usesWorkerRaster: false,
    usesWorkerOcr: true,
    recommendedFor: 'Medium PDFs where OCR recognition is the bottleneck.',
  },
  {
    id: 'worker-raster-worker-ocr',
    label: 'Worker raster + OCR',
    description: 'Rasterize PDF pages and run OCR recognition through workers.',
    usesWorkerRaster: true,
    usesWorkerOcr: true,
    recommendedFor: 'Large scanned PDFs and heavy OCR sessions.',
  },
];

export interface OcrPipelineCapabilities {
  workerSupported: boolean;
  rasterWorkerSupported: boolean;
  ocrWorkerSupported: boolean;
}

export interface ResolveOcrPipelineModeInput {
  requestedMode: OcrPipelineMode;
  capabilities?: Partial<OcrPipelineCapabilities>;
}

export interface ResolvedOcrPipelineMode {
  requestedMode: OcrPipelineMode;
  effectiveMode: OcrPipelineMode;
  option: OcrPipelineModeOption;
  diagnostics: OcrPipelineModeDiagnostic[];
}

export interface OcrPipelineModeDiagnostic {
  level: 'info' | 'warning' | 'error';
  code:
    | 'OCR_PIPELINE_MODE_READY'
    | 'OCR_PIPELINE_WORKER_UNAVAILABLE'
    | 'OCR_PIPELINE_RASTER_WORKER_UNAVAILABLE'
    | 'OCR_PIPELINE_FALLBACK_TO_MAIN';
  message: string;
}

export interface RunOcrPipelineInput {
  id: string;
  documentFingerprint: string;
  engineId: string;
  requestedProfileId: OcrProfileId;
  languageHints?: string[];
  forceOcr?: boolean;

  mode: OcrPipelineMode;
  pdfBytes?: Uint8Array | null;
  explicitPages?: OcrEnginePageInput[];
  pageIndexes: number[];

  rasterScale: number;
  maxCanvasPixels: number;

  signal?: AbortSignal;
  workerClient?: Pick<OcrWorkerClient, 'recognizePages' | 'dispose'>;
  rasterWorkerClient?: Pick<OcrRasterWorkerClient, 'rasterizePages' | 'dispose'>;

  onProgress?: (snapshot: OcrJobRunnerSnapshot) => void;
  onRasterProgress?: (message: string) => void;
  capabilities?: Partial<OcrPipelineCapabilities>;
}

export interface RunOcrPipelineResult {
  mode: ResolvedOcrPipelineMode;
  pageInputs: OcrEnginePageInput[];
  result: OcrDocumentResult;
}

export function getDefaultOcrPipelineCapabilities(): OcrPipelineCapabilities {
  const workerSupported = typeof Worker !== 'undefined';

  return {
    workerSupported,
    rasterWorkerSupported: workerSupported,
    ocrWorkerSupported: workerSupported,
  };
}

export function getOcrPipelineModeOption(
  mode: OcrPipelineMode,
): OcrPipelineModeOption {
  return OCR_PIPELINE_MODE_OPTIONS.find((option) => option.id === mode)
    ?? OCR_PIPELINE_MODE_OPTIONS[0];
}

export function resolveOcrPipelineMode(
  input: ResolveOcrPipelineModeInput,
): ResolvedOcrPipelineMode {
  const capabilities: OcrPipelineCapabilities = {
    ...getDefaultOcrPipelineCapabilities(),
    ...input.capabilities,
  };

  const diagnostics: OcrPipelineModeDiagnostic[] = [];
  let effectiveMode = input.requestedMode;

  if (input.requestedMode === 'worker-ocr' && !capabilities.ocrWorkerSupported) {
    effectiveMode = 'main';
    diagnostics.push({
      level: 'warning',
      code: 'OCR_PIPELINE_WORKER_UNAVAILABLE',
      message: 'OCR worker is unavailable. Falling back to main-thread OCR.',
    });
  }

  if (input.requestedMode === 'worker-raster-worker-ocr') {
    if (!capabilities.rasterWorkerSupported || !capabilities.ocrWorkerSupported) {
      effectiveMode = capabilities.ocrWorkerSupported ? 'worker-ocr' : 'main';

      diagnostics.push({
        level: 'warning',
        code: 'OCR_PIPELINE_RASTER_WORKER_UNAVAILABLE',
        message: 'Full worker raster/OCR pipeline is unavailable. Falling back to the safest available OCR pipeline.',
      });
    }
  }

  if (effectiveMode !== input.requestedMode) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_PIPELINE_FALLBACK_TO_MAIN',
      message: `OCR pipeline fallback applied: ${input.requestedMode} → ${effectiveMode}.`,
    });
  }

  diagnostics.push({
    level: 'info',
    code: 'OCR_PIPELINE_MODE_READY',
    message: `OCR pipeline mode ready: ${getOcrPipelineModeOption(effectiveMode).label}.`,
  });

  return {
    requestedMode: input.requestedMode,
    effectiveMode,
    option: getOcrPipelineModeOption(effectiveMode),
    diagnostics,
  };
}

export async function runOcrPipeline(
  input: RunOcrPipelineInput,
): Promise<RunOcrPipelineResult> {
  const resolvedMode = resolveOcrPipelineMode({
    requestedMode: input.mode,
    capabilities: input.capabilities,
  });

  const pageInputs = await resolveOcrPipelinePageInputs(input, resolvedMode.effectiveMode);

  const result = await runOcrPipelineRecognition({
    ...input,
    mode: resolvedMode.effectiveMode,
    pageInputs,
  });

  return {
    mode: resolvedMode,
    pageInputs,
    result,
  };
}

export async function resolveOcrPipelinePageInputs(
  input: RunOcrPipelineInput,
  effectiveMode: OcrPipelineMode,
): Promise<OcrEnginePageInput[]> {
  if (input.explicitPages && input.explicitPages.length > 0) {
    return input.explicitPages;
  }

  if (!input.pdfBytes) {
    return createPlaceholderOcrPageInputs(input.pageIndexes);
  }

  return rasterizeForOcrWithOptionalWorker({
    pdfBytes: input.pdfBytes,
    pageIndexes: input.pageIndexes,
    scale: input.rasterScale,
    maxCanvasPixels: input.maxCanvasPixels,
    useWorker: effectiveMode === 'worker-raster-worker-ocr',
    workerClient: input.rasterWorkerClient,
    disposeClientAfterRun: false,
    signal: input.signal,
    onProgress: (progress) => {
      input.onRasterProgress?.(rasterWorkerProgressToMessage(progress));
    },
  });
}

export async function runOcrPipelineRecognition(
  input: RunOcrPipelineInput & {
    pageInputs: OcrEnginePageInput[];
  },
): Promise<OcrDocumentResult> {
  if (input.mode === 'worker-ocr' || input.mode === 'worker-raster-worker-ocr') {
    const result = await runWorkerOcrJob({
      id: input.id,
      documentFingerprint: input.documentFingerprint,
      engineId: input.engineId,
      requestedProfileId: input.requestedProfileId,
      languageHints: input.languageHints,
      forceOcr: input.forceOcr,
      pages: input.pageInputs,
      signal: input.signal,
      workerClient: input.workerClient,
      disposeClientAfterRun: false,
      onProgress: input.onProgress,
    });

    return result.result;
  }

  let finalResult: OcrDocumentResult | null = null;

  await runOcrJob({
    id: input.id,
    documentFingerprint: input.documentFingerprint,
    engineId: input.engineId,
    requestedProfileId: input.requestedProfileId,
    languageHints: input.languageHints,
    forceOcr: input.forceOcr,
    selectedPageIndexes: input.pageIndexes,
    pages: input.pageInputs,
    signal: input.signal,
    onProgress: (snapshot) => {
      finalResult = snapshot.partialResult;
      input.onProgress?.(snapshot);
    },
  });

  if (!finalResult) {
    throw new Error('Main-thread OCR pipeline completed without an OCR result.');
  }

  return finalResult;
}

export function createPlaceholderOcrPageInputs(
  pageIndexes: number[],
): OcrEnginePageInput[] {
  return pageIndexes.map((pageIndex) => ({
    pageIndex,
    imageBytes: new Uint8Array([1, 2, 3]),
    width: 595,
    height: 842,
    imageCount: 1,
  }));
}
