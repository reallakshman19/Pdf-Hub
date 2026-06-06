import type { OcrEnginePageInput, OcrEngineRegistry } from './engines/ocrEngineContract';
import { defaultOcrEngineRegistry } from './engines/ocrEngineRegistry';
import type { OcrProfile, OcrProfileId } from './ocrProfiles';
import { getOcrProfile } from './ocrProfiles';
import type {
  OcrDocumentResult,
  OcrPageResult,
  OcrDiagnostic,
} from './types';
import type {
  OcrRegion,
  OcrRegionResult,
} from './ocrRegionModel';
import {
  createOcrRegionResult,
  validateOcrRegion,
} from './ocrRegionModel';
import type {
  OcrRegionToWriterOptions,
  OcrRegionToWriterResult,
} from './ocrRegionToWriter';
import {
  ocrRegionResultToWriterElement,
} from './ocrRegionToWriter';

export interface RunOcrRegionInput {
  documentFingerprint: string;
  region: OcrRegion;
  page: OcrEnginePageInput;
  engineId?: string;
  profileId?: OcrProfileId;
  registry?: OcrEngineRegistry;
  signal?: AbortSignal;
}

export interface OcrRegionRunnerResult {
  region: OcrRegion;
  profile: OcrProfile;
  pageResult: OcrPageResult;
  documentResult: OcrDocumentResult;
  regionResult: OcrRegionResult;
  diagnostics: OcrDiagnostic[];
}

export interface RunOcrRegionAndConvertInput extends RunOcrRegionInput {
  writerOptions: OcrRegionToWriterOptions;
}

export interface OcrRegionRunAndConvertResult {
  run: OcrRegionRunnerResult;
  writer: OcrRegionToWriterResult;
}

export class OcrRegionRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrRegionRunnerError';
  }
}

export class OcrRegionRunCancelledError extends Error {
  constructor() {
    super('OCR region run was cancelled.');
    this.name = 'OcrRegionRunCancelledError';
  }
}

export async function runOcrRegion(
  input: RunOcrRegionInput,
): Promise<OcrRegionRunnerResult> {
  throwIfCancelled(input.signal);

  const registry = input.registry ?? defaultOcrEngineRegistry;
  const engineId = input.engineId ?? 'mock';
  const engine = registry.getEngine(engineId);

  if (!engine) {
    throw new OcrRegionRunnerError(`OCR engine not found: ${engineId}`);
  }

  const validation = validateOcrRegion(input.region, {
    pageIndex: input.page.pageIndex,
    width: input.page.width,
    height: input.page.height,
    region: input.page.region,
  });

  if (!validation.valid) {
    throw new OcrRegionRunnerError(
      validation.diagnostics[0]?.message ?? 'Invalid OCR region.',
    );
  }

  const profile = getOcrProfile(
    input.profileId ?? inferOcrRegionProfileId(input.region),
  );

  const pageInput: OcrEnginePageInput = {
    ...input.page,
    region: input.region.bbox,
  };

  throwIfCancelled(input.signal);

  const documentResult = await engine.recognize({
    documentFingerprint: input.documentFingerprint,
    profile,
    pages: [pageInput],
  });

  throwIfCancelled(input.signal);

  const pageResult = documentResult.pages.find(
    (page) => page.pageIndex === input.page.pageIndex,
  );

  if (!pageResult) {
    throw new OcrRegionRunnerError(
      `OCR engine returned no result for region page ${input.page.pageIndex}.`,
    );
  }

  const regionResult = createOcrRegionResult({
    region: input.region,
    pageResult,
  });

  const diagnostics: OcrDiagnostic[] = [
    ...(validation.diagnostics ?? []),
    ...(documentResult.diagnostics ?? []),
    ...(pageResult.diagnostics ?? []),
    ...(regionResult.diagnostics ?? []),
  ];

  return {
    region: input.region,
    profile,
    pageResult,
    documentResult,
    regionResult: {
      ...regionResult,
      diagnostics,
    },
    diagnostics,
  };
}

export async function runOcrRegionAndConvertToWriter(
  input: RunOcrRegionAndConvertInput,
): Promise<OcrRegionRunAndConvertResult> {
  const run = await runOcrRegion(input);

  return {
    run,
    writer: ocrRegionResultToWriterElement(
      run.regionResult,
      input.writerOptions,
    ),
  };
}

export function inferOcrRegionProfileId(
  region: OcrRegion,
): OcrProfileId {
  if (region.mode === 'table') {
    return 'table-heavy';
  }

  if (region.mode === 'metadata') {
    return 'engineering-drawing';
  }

  return 'region-only';
}

export function inferWriterOutputModeFromRegion(
  region: OcrRegion,
): OcrRegionToWriterOptions['outputMode'] {
  if (region.mode === 'table') {
    return 'tableBox';
  }

  if (region.mode === 'note') {
    return 'richNote';
  }

  if (region.mode === 'review') {
    return 'reviewLabel';
  }

  return 'richTextBox';
}

function throwIfCancelled(
  signal: AbortSignal | undefined,
): void {
  if (signal?.aborted) {
    throw new OcrRegionRunCancelledError();
  }
}
