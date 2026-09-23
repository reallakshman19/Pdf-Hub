import JSZip from 'jszip';
import type { OcrDocumentResult, OcrBlock, OcrTableBlock } from './types';
import type { OcrCorrection } from './ocrCorrections';
import type { OcrRegion } from './ocrRegionModel';
import type { OcrWriterInsertionQueueState } from './ocrWriterInsertion';
import type { OcrResumeTokenV1 } from './ocrResumeState';
import { validateOcrResumeToken } from './ocrResumeState';
import {
  JSZipProjectArchiveReader,
  type ProjectArchiveReader,
} from '@/core/admission/zip/projectArchiveReader';
import { ZipBoundedExtractionError } from '@/core/admission/zip/zipExtractionEvidence';

export interface OcrProjectArchiveV1 {
  schema: 'pdf-hub-ocr-project';
  schemaVersion: 1;
  documentFingerprint: string;
  createdAt: string;
  updatedAt: string;
  resumeToken?: OcrResumeTokenV1 | null;
  files: {
    result: 'ocr/result.json';
    corrections: 'ocr/corrections.json';
    regions: 'ocr/regions.json';
    writerInsertionQueue: 'ocr/writer-insertion-queue.json';
  };
  counts: {
    pages: number;
    corrections: number;
    regions: number;
    writerInsertionCandidates: number;
  };
}

export interface OcrProjectPayloadV1 {
  manifest: OcrProjectArchiveV1;
  result: OcrDocumentResult | null;
  corrections: OcrCorrection[];
  regions: OcrRegion[];
  writerInsertionQueue: OcrWriterInsertionQueueState;
}

export interface CreateOcrProjectPayloadInput {
  documentFingerprint: string;
  result?: OcrDocumentResult | null;
  corrections?: OcrCorrection[];
  regions?: OcrRegion[];
  writerInsertionQueue?: OcrWriterInsertionQueueState | null;
  resumeToken?: OcrResumeTokenV1 | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OcrProjectCodecValidationResult {
  valid: boolean;
  diagnostics: Array<{
    level: 'info' | 'warning' | 'error';
    code:
      | 'VALID_OCR_PROJECT'
      | 'INVALID_OCR_PROJECT_SCHEMA'
      | 'INVALID_OCR_PROJECT_VERSION'
      | 'MISSING_DOCUMENT_FINGERPRINT'
      | 'MISMATCHED_DOCUMENT_FINGERPRINT'
      | 'INVALID_OCR_RESUME_TOKEN'
      | 'MISSING_OCR_FILE'
      | 'INVALID_OCR_JSON';
    message: string;
  }>;
}

export const OCR_PROJECT_MANIFEST_PATH = 'ocr/manifest.json';

export function createOcrProjectPayload(
  input: CreateOcrProjectPayloadInput,
): OcrProjectPayloadV1 {
  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;

  const result = input.result
    ? normalizeOcrDocumentResultFingerprint(
        input.result,
        input.documentFingerprint,
      )
    : null;

  const corrections = (input.corrections ?? []).map((correction) => ({
    ...correction,
    documentFingerprint: input.documentFingerprint,
    bbox: { ...correction.bbox },
  }));

  const regions = (input.regions ?? []).map((region) => ({
    ...region,
    documentFingerprint: input.documentFingerprint,
    bbox: { ...region.bbox },
  }));

  const writerInsertionQueue = {
    candidates: [
      ...(input.writerInsertionQueue?.candidates ?? []),
    ].map((candidate) => ({
      ...candidate,
      element: {
        ...candidate.element,
        documentFingerprint: input.documentFingerprint,
        rect: { ...candidate.element.rect },
        style: { ...candidate.element.style },
        assetIds: candidate.element.assetIds
          ? [...candidate.element.assetIds]
          : undefined,
      },
      diagnostics: candidate.diagnostics.map((diagnostic) => ({
        ...diagnostic,
      })),
    })),
  };

  const manifest: OcrProjectArchiveV1 = {
    schema: 'pdf-hub-ocr-project',
    schemaVersion: 1,
    documentFingerprint: input.documentFingerprint,
    createdAt,
    updatedAt,
    ...(input.resumeToken
      ? { resumeToken: cloneOcrResumeToken(input.resumeToken) }
      : {}),
    files: {
      result: 'ocr/result.json',
      corrections: 'ocr/corrections.json',
      regions: 'ocr/regions.json',
      writerInsertionQueue: 'ocr/writer-insertion-queue.json',
    },
    counts: {
      pages: result?.pages.length ?? 0,
      corrections: corrections.length,
      regions: regions.length,
      writerInsertionCandidates: writerInsertionQueue.candidates.length,
    },
  };

  return {
    manifest,
    result,
    corrections,
    regions,
    writerInsertionQueue,
  };
}

export async function writeOcrProjectPayloadToZip(
  zip: JSZip,
  payload: OcrProjectPayloadV1,
): Promise<void> {
  const validation = validateOcrProjectPayload(payload);

  if (!validation.valid) {
    throw new Error(validation.diagnostics[0]?.message ?? 'Invalid OCR project payload.');
  }

  zip.file(OCR_PROJECT_MANIFEST_PATH, JSON.stringify(payload.manifest, null, 2));
  zip.file(payload.manifest.files.result, JSON.stringify(payload.result, null, 2));
  zip.file(payload.manifest.files.corrections, JSON.stringify(payload.corrections, null, 2));
  zip.file(payload.manifest.files.regions, JSON.stringify(payload.regions, null, 2));
  zip.file(
    payload.manifest.files.writerInsertionQueue,
    JSON.stringify(payload.writerInsertionQueue, null, 2),
  );
}

export async function readOcrProjectPayloadFromZip(
  zip: JSZip,
): Promise<OcrProjectPayloadV1 | null> {
  return readOcrProjectPayloadFromReader(new JSZipProjectArchiveReader(zip));
}

export async function readOcrProjectPayloadFromReader(
  reader: ProjectArchiveReader,
): Promise<OcrProjectPayloadV1 | null> {
  if (!reader.has(OCR_PROJECT_MANIFEST_PATH)) {
    return null;
  }

  const manifest = await readOcrJsonFile<OcrProjectArchiveV1>(
    reader,
    OCR_PROJECT_MANIFEST_PATH,
  );

  validateOcrProjectManifestOrThrow(manifest);

  const result = await readOcrJsonFile<OcrDocumentResult | null>(
    reader,
    manifest.files.result,
  );

  const corrections = await readOcrJsonFile<OcrCorrection[]>(
    reader,
    manifest.files.corrections,
  );

  const regions = await readOcrJsonFile<OcrRegion[]>(
    reader,
    manifest.files.regions,
  );

  const writerInsertionQueue = await readOcrJsonFile<OcrWriterInsertionQueueState>(
    reader,
    manifest.files.writerInsertionQueue,
  );

  const payload: OcrProjectPayloadV1 = {
    manifest,
    result: result
      ? normalizeOcrDocumentResultFingerprint(
          result,
          manifest.documentFingerprint,
        )
      : null,
    corrections: corrections.map((correction) => ({
      ...correction,
      documentFingerprint: manifest.documentFingerprint,
      bbox: { ...correction.bbox },
    })),
    regions: regions.map((region) => ({
      ...region,
      documentFingerprint: manifest.documentFingerprint,
      bbox: { ...region.bbox },
    })),
    writerInsertionQueue: {
      candidates: writerInsertionQueue.candidates.map((candidate) => ({
        ...candidate,
        element: {
          ...candidate.element,
          documentFingerprint: manifest.documentFingerprint,
          rect: { ...candidate.element.rect },
          style: { ...candidate.element.style },
          assetIds: candidate.element.assetIds
            ? [...candidate.element.assetIds]
            : undefined,
        },
        diagnostics: candidate.diagnostics.map((diagnostic) => ({
          ...diagnostic,
        })),
      })),
    },
  };

  const validation = validateOcrProjectPayload(payload);

  if (!validation.valid) {
    throw new Error(validation.diagnostics[0]?.message ?? 'Invalid OCR project payload.');
  }

  return payload;
}

export function validateOcrProjectPayload(
  payload: OcrProjectPayloadV1,
): OcrProjectCodecValidationResult {
  const diagnostics: OcrProjectCodecValidationResult['diagnostics'] = [];

  validateOcrProjectManifest(payload.manifest).diagnostics.forEach(
    (diagnostic) => diagnostics.push(diagnostic),
  );

  if (payload.result && payload.result.documentFingerprint !== payload.manifest.documentFingerprint) {
    diagnostics.push({
      level: 'error',
      code: 'MISMATCHED_DOCUMENT_FINGERPRINT',
      message: 'OCR result documentFingerprint does not match OCR manifest.',
    });
  }

  for (const correction of payload.corrections) {
    if (correction.documentFingerprint !== payload.manifest.documentFingerprint) {
      diagnostics.push({
        level: 'error',
        code: 'MISMATCHED_DOCUMENT_FINGERPRINT',
        message: `OCR correction documentFingerprint mismatch: ${correction.id}`,
      });
    }
  }

  for (const region of payload.regions) {
    if (region.documentFingerprint !== payload.manifest.documentFingerprint) {
      diagnostics.push({
        level: 'error',
        code: 'MISMATCHED_DOCUMENT_FINGERPRINT',
        message: `OCR region documentFingerprint mismatch: ${region.id}`,
      });
    }
  }

  for (const candidate of payload.writerInsertionQueue.candidates) {
    if (candidate.element.documentFingerprint !== payload.manifest.documentFingerprint) {
      diagnostics.push({
        level: 'error',
        code: 'MISMATCHED_DOCUMENT_FINGERPRINT',
        message: `OCR insertion candidate documentFingerprint mismatch: ${candidate.id}`,
      });
    }
  }

  if (!diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
    diagnostics.push({
      level: 'info',
      code: 'VALID_OCR_PROJECT',
      message: 'OCR project payload is valid.',
    });
  }

  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    diagnostics,
  };
}

export function validateOcrProjectManifest(
  manifest: OcrProjectArchiveV1,
): OcrProjectCodecValidationResult {
  const diagnostics: OcrProjectCodecValidationResult['diagnostics'] = [];

  if (manifest.schema !== 'pdf-hub-ocr-project') {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_PROJECT_SCHEMA',
      message: `Unsupported OCR project schema: ${String(manifest.schema)}`,
    });
  }

  if (manifest.schemaVersion !== 1) {
    diagnostics.push({
      level: 'error',
      code: 'INVALID_OCR_PROJECT_VERSION',
      message: `Unsupported OCR project schemaVersion: ${String(manifest.schemaVersion)}`,
    });
  }

  if (!manifest.documentFingerprint) {
    diagnostics.push({
      level: 'error',
      code: 'MISSING_DOCUMENT_FINGERPRINT',
      message: 'OCR project manifest is missing documentFingerprint.',
    });
  }

  if (manifest.resumeToken) {
    try {
      validateOcrResumeToken(manifest.resumeToken);
      if (manifest.resumeToken.documentFingerprint !== manifest.documentFingerprint) {
        diagnostics.push({
          level: 'error',
          code: 'MISMATCHED_DOCUMENT_FINGERPRINT',
          message: 'OCR resume token documentFingerprint does not match OCR manifest.',
        });
      }
    } catch (error) {
      diagnostics.push({
        level: 'error',
        code: 'INVALID_OCR_RESUME_TOKEN',
        message: error instanceof Error
          ? error.message
          : 'OCR project manifest contains an invalid resume token.',
      });
    }
  }

  if (!diagnostics.some((diagnostic) => diagnostic.level === 'error')) {
    diagnostics.push({
      level: 'info',
      code: 'VALID_OCR_PROJECT',
      message: 'OCR project manifest is valid.',
    });
  }

  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    diagnostics,
  };
}

function validateOcrProjectManifestOrThrow(
  manifest: OcrProjectArchiveV1,
): void {
  const validation = validateOcrProjectManifest(manifest);

  if (!validation.valid) {
    throw new Error(validation.diagnostics[0]?.message ?? 'Invalid OCR project manifest.');
  }
}

async function readOcrJsonFile<T>(
  reader: ProjectArchiveReader,
  path: string,
): Promise<T> {
  if (!reader.has(path)) {
    throw new Error(`OCR project ZIP missing required file: ${path}`);
  }

  try {
    return JSON.parse(await reader.readText(path)) as T;
  } catch (error) {
    if (error instanceof ZipBoundedExtractionError) throw error;
    throw new Error(
      error instanceof Error
        ? `Invalid OCR JSON file ${path}: ${error.message}`
        : `Invalid OCR JSON file ${path}.`,
    );
  }
}

function cloneOcrResumeToken(
  token: OcrResumeTokenV1,
): OcrResumeTokenV1 {
  return {
    ...token,
    tasks: token.tasks.map((task) => ({
      ...task,
      pageIndexes: [...task.pageIndexes],
    })),
  };
}

function normalizeOcrDocumentResultFingerprint(
  result: OcrDocumentResult,
  documentFingerprint: string,
): OcrDocumentResult {
  return {
    ...result,
    documentFingerprint,
    pages: result.pages.map((page) => ({
      ...page,
      words: page.words?.map((word) => ({
        ...word,
        bbox: { ...word.bbox },
      })),
      lines: page.lines?.map((line) => ({
        ...line,
        bbox: { ...line.bbox },
        wordIds: [...line.wordIds],
      })),
      blocks: page.blocks.map((block) => {
        if (block.type === 'table') {
          const tableBlock = block as OcrTableBlock;
          return {
            ...tableBlock,
            bbox: tableBlock.bbox ? { ...tableBlock.bbox } : undefined,
            lineIds: tableBlock.lineIds ? [...tableBlock.lineIds] : undefined,
            wordIds: tableBlock.wordIds ? [...tableBlock.wordIds] : undefined,
            rows: tableBlock.rows.map((row) => ({
              ...row,
              cells: row.cells.map((cell) => ({
                ...cell,
                bbox: { ...cell.bbox },
              })),
            })),
          } as OcrTableBlock;
        }

        const standardBlock = block as OcrBlock;
        return {
          ...standardBlock,
          bbox: standardBlock.bbox ? { ...standardBlock.bbox } : undefined,
          lineIds: standardBlock.lineIds ? [...standardBlock.lineIds] : undefined,
          wordIds: standardBlock.wordIds ? [...standardBlock.wordIds] : undefined,
        } as OcrBlock;
      }),
      diagnostics: page.diagnostics?.map((diagnostic) => ({
        ...diagnostic,
      })),
    })),
    diagnostics: result.diagnostics.map((diagnostic) => ({
      ...diagnostic,
    })),
  };
}
