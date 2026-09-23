import type { OcrDocumentResult, OcrBlock, OcrTableBlock } from './types';
import type { OcrCorrection } from './ocrCorrections';
import type { OcrRegion } from './ocrRegionModel';
import type {
  OcrWriterInsertionQueueState,
} from './ocrWriterInsertion';
import {
  createOcrWriterInsertionQueue,
} from './ocrWriterInsertion';
import type {
  CreateOcrProjectPayloadInput,
  OcrProjectPayloadV1,
} from './ocrProjectCodec';
import {
  createOcrProjectPayload,
  validateOcrProjectPayload,
} from './ocrProjectCodec';
import type { OcrResumeTokenV1 } from './ocrResumeState';
import type { OcrStoreState } from './ocrStore';
import {
  useOcrStore,
} from './ocrStore';

export interface OcrHydrationDiagnostics {
  level: 'info' | 'warning' | 'error';
  code:
    | 'OCR_PROJECT_RESTORED'
    | 'OCR_PROJECT_EXPORT_CREATED'
    | 'NO_OCR_PROJECT_PAYLOAD'
    | 'INVALID_OCR_PROJECT_PAYLOAD'
    | 'DOCUMENT_FINGERPRINT_MISMATCH'
    | 'WRITER_INSERTION_QUEUE_RESTORED'
    | 'OCR_RESUME_STATE_RESTORED'
    | 'OCR_RESUME_STATE_DISCARDED';
  message: string;
}

export interface OcrHydrationResult {
  restored: boolean;
  documentFingerprint: string | null;
  result: OcrDocumentResult | null;
  corrections: OcrCorrection[];
  regions: OcrRegion[];
  writerInsertionQueue: OcrWriterInsertionQueueState;
  resumeToken: OcrResumeTokenV1 | null;
  diagnostics: OcrHydrationDiagnostics[];
}

export interface HydrateOcrStoreFromProjectPayloadInput {
  payload: OcrProjectPayloadV1 | null | undefined;
  expectedDocumentFingerprint?: string | null;
  store?: OcrStoreState;
  updatedAt?: string;
}

export interface CreateOcrProjectPayloadFromStoreInput {
  documentFingerprint?: string | null;
  store?: OcrStoreState;
  writerInsertionQueue?: OcrWriterInsertionQueueState | null;
  resumeToken?: OcrResumeTokenV1 | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OcrHydrationSummary {
  hasPayload: boolean;
  documentFingerprint: string | null;
  pages: number;
  corrections: number;
  regions: number;
  writerInsertionCandidates: number;
  searchableWords: number;
}

export function hydrateOcrStoreFromProjectPayload(
  input: HydrateOcrStoreFromProjectPayloadInput,
): OcrHydrationResult {
  const store = input.store ?? useOcrStore.getState();

  if (!input.payload) {
    return {
      restored: false,
      documentFingerprint: null,
      result: null,
      corrections: [],
      regions: [],
      writerInsertionQueue: createOcrWriterInsertionQueue(),
      resumeToken: null,
      diagnostics: [
        {
          level: 'warning',
          code: 'NO_OCR_PROJECT_PAYLOAD',
          message: 'No OCR project payload was supplied for restore.',
        },
      ],
    };
  }

  const validation = validateOcrProjectPayload(input.payload);

  if (!validation.valid) {
    return {
      restored: false,
      documentFingerprint: input.payload.manifest.documentFingerprint,
      result: null,
      corrections: [],
      regions: [],
      writerInsertionQueue: createOcrWriterInsertionQueue(),
      resumeToken: null,
      diagnostics: [
        {
          level: 'error',
          code: 'INVALID_OCR_PROJECT_PAYLOAD',
          message: validation.diagnostics[0]?.message ?? 'Invalid OCR project payload.',
        },
      ],
    };
  }

  const expectedDocumentFingerprint = input.expectedDocumentFingerprint ?? null;
  const payloadDocumentFingerprint = input.payload.manifest.documentFingerprint;

  const diagnostics: OcrHydrationDiagnostics[] = [];

  if (
    expectedDocumentFingerprint
    && expectedDocumentFingerprint !== payloadDocumentFingerprint
  ) {
    diagnostics.push({
      level: 'warning',
      code: 'DOCUMENT_FINGERPRINT_MISMATCH',
      message: `OCR payload fingerprint "${payloadDocumentFingerprint}" differs from expected document fingerprint "${expectedDocumentFingerprint}".`,
    });
  }

  const resumeToken =
    input.payload.manifest.resumeToken
    && (!expectedDocumentFingerprint
      || expectedDocumentFingerprint === payloadDocumentFingerprint)
      ? cloneOcrResumeToken(input.payload.manifest.resumeToken)
      : null;

  if (input.payload.manifest.resumeToken && !resumeToken) {
    diagnostics.push({
      level: 'warning',
      code: 'OCR_RESUME_STATE_DISCARDED',
      message: 'OCR resume state was discarded because the project was rebound to a different document fingerprint.',
    });
  }

  store.hydrateOcrSession({
    documentFingerprint: expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    result: normalizeResultFingerprint(
      input.payload.result,
      expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    ),
    corrections: normalizeCorrectionsFingerprint(
      input.payload.corrections,
      expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    ),
    regions: normalizeRegionsFingerprint(
      input.payload.regions,
      expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    ),
    languageHints: resumeToken?.languages,
    resumeToken,
    updatedAt: input.updatedAt ?? input.payload.manifest.updatedAt,
  });

  diagnostics.push({
    level: 'info',
    code: 'OCR_PROJECT_RESTORED',
    message: 'OCR project payload restored into OCR store.',
  });

  if (input.payload.writerInsertionQueue.candidates.length > 0) {
    diagnostics.push({
      level: 'info',
      code: 'WRITER_INSERTION_QUEUE_RESTORED',
      message: `${input.payload.writerInsertionQueue.candidates.length} OCR Writer insertion candidate(s) restored for caller/UI handling.`,
    });
  }

  if (resumeToken) {
    diagnostics.push({
      level: 'info',
      code: 'OCR_RESUME_STATE_RESTORED',
      message: 'OCR resumable execution state restored for caller/workflow handling.',
    });
  }

  return {
    restored: true,
    documentFingerprint: expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    result: normalizeResultFingerprint(
      input.payload.result,
      expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    ),
    corrections: normalizeCorrectionsFingerprint(
      input.payload.corrections,
      expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    ),
    regions: normalizeRegionsFingerprint(
      input.payload.regions,
      expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    ),
    writerInsertionQueue: normalizeWriterInsertionQueueFingerprint(
      input.payload.writerInsertionQueue,
      expectedDocumentFingerprint ?? payloadDocumentFingerprint,
    ),
    resumeToken,
    diagnostics,
  };
}

export function createOcrProjectPayloadFromStore(
  input: CreateOcrProjectPayloadFromStoreInput = {},
): OcrProjectPayloadV1 {
  const store = input.store ?? useOcrStore.getState();

  const documentFingerprint =
    input.documentFingerprint
    ?? store.documentFingerprint
    ?? store.result?.documentFingerprint
    ?? 'ocr-project';

  const payloadInput: CreateOcrProjectPayloadInput = {
    documentFingerprint,
    result: store.result,
    corrections: store.corrections,
    regions: store.regions,
    writerInsertionQueue: input.writerInsertionQueue ?? createOcrWriterInsertionQueue(),
    resumeToken: input.resumeToken ?? store.resumeToken,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };

  return createOcrProjectPayload(payloadInput);
}

export function summarizeOcrProjectPayload(
  payload: OcrProjectPayloadV1 | null | undefined,
): OcrHydrationSummary {
  if (!payload) {
    return {
      hasPayload: false,
      documentFingerprint: null,
      pages: 0,
      corrections: 0,
      regions: 0,
      writerInsertionCandidates: 0,
      searchableWords: 0,
    };
  }

  return {
    hasPayload: true,
    documentFingerprint: payload.manifest.documentFingerprint,
    pages: payload.result?.pages.length ?? 0,
    corrections: payload.corrections.length,
    regions: payload.regions.length,
    writerInsertionCandidates: payload.writerInsertionQueue.candidates.length,
    searchableWords: payload.result?.pages.reduce(
      (sum, page) => sum + (page.words?.length ?? 0),
      0,
    ) ?? 0,
  };
}

export function normalizeOcrProjectPayloadForDocument(
  payload: OcrProjectPayloadV1,
  documentFingerprint: string,
): OcrProjectPayloadV1 {
  return createOcrProjectPayload({
    documentFingerprint,
    result: normalizeResultFingerprint(payload.result, documentFingerprint),
    corrections: normalizeCorrectionsFingerprint(payload.corrections, documentFingerprint),
    regions: normalizeRegionsFingerprint(payload.regions, documentFingerprint),
    writerInsertionQueue: normalizeWriterInsertionQueueFingerprint(
      payload.writerInsertionQueue,
      documentFingerprint,
    ),
    resumeToken:
      payload.manifest.documentFingerprint === documentFingerprint
        ? payload.manifest.resumeToken ?? null
        : null,
    createdAt: payload.manifest.createdAt,
    updatedAt: payload.manifest.updatedAt,
  });
}

function cloneOcrResumeToken(
  token: OcrResumeTokenV1,
): OcrResumeTokenV1 {
  return {
    ...token,
    languages: [...token.languages],
    tasks: token.tasks.map((task) => ({
      ...task,
      pageIndexes: [...task.pageIndexes],
    })),
  };
}

function normalizeResultFingerprint(
  result: OcrDocumentResult | null,
  documentFingerprint: string,
): OcrDocumentResult | null {
  if (!result) {
    return null;
  }

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

function normalizeCorrectionsFingerprint(
  corrections: OcrCorrection[],
  documentFingerprint: string,
): OcrCorrection[] {
  return corrections.map((correction) => ({
    ...correction,
    documentFingerprint,
    bbox: { ...correction.bbox },
  }));
}

function normalizeRegionsFingerprint(
  regions: OcrRegion[],
  documentFingerprint: string,
): OcrRegion[] {
  return regions.map((region) => ({
    ...region,
    documentFingerprint,
    bbox: { ...region.bbox },
  }));
}

function normalizeWriterInsertionQueueFingerprint(
  queue: OcrWriterInsertionQueueState,
  documentFingerprint: string,
): OcrWriterInsertionQueueState {
  return {
    candidates: queue.candidates.map((candidate) => ({
      ...candidate,
      element: {
        ...candidate.element,
        documentFingerprint,
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
}
