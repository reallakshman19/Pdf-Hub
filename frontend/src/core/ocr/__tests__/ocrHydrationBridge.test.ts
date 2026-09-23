import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../../writer-v2/types';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import { createOcrCorrection } from '../ocrCorrections';
import { createOcrRegion } from '../ocrRegionModel';
import type { OcrResumeTokenV1 } from '../ocrResumeState';
import {
  createOcrWriterInsertionCandidate,
  createOcrWriterInsertionQueue,
} from '../ocrWriterInsertion';
import {
  createOcrProjectPayload,
} from '../ocrProjectCodec';
import { useOcrStore } from '../ocrStore';
import {
  createOcrProjectPayloadFromStore,
  hydrateOcrStoreFromProjectPayload,
  normalizeOcrProjectPayloadForDocument,
  summarizeOcrProjectPayload,
} from '../ocrHydrationBridge';

describe('ocrHydrationBridge', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
  });

  it('returns non-restored result when payload is missing', () => {
    const result = hydrateOcrStoreFromProjectPayload({
      payload: null,
    });

    expect(result.restored).toBe(false);
    expect(result.resumeToken).toBeNull();
    expect(result.diagnostics[0].code).toBe('NO_OCR_PROJECT_PAYLOAD');
    expect(useOcrStore.getState().result).toBeNull();
  });

  it('hydrates OCR store from project payload', async () => {
    const payload = await makePayload('doc-hydrate');

    const result = hydrateOcrStoreFromProjectPayload({
      payload,
      expectedDocumentFingerprint: 'doc-hydrate',
    });

    const state = useOcrStore.getState();

    expect(result.restored).toBe(true);
    expect(result.documentFingerprint).toBe('doc-hydrate');
    expect(state.documentFingerprint).toBe('doc-hydrate');
    expect(state.result?.pages).toHaveLength(1);
    expect(state.corrections).toHaveLength(1);
    expect(state.regions).toHaveLength(1);
    expect(state.searchIndex).not.toBeNull();
    expect(state.confidenceSummary?.totalWords).toBeGreaterThan(0);
    expect(result.writerInsertionQueue.candidates).toHaveLength(1);
    expect(result.resumeToken?.documentFingerprint).toBe('doc-hydrate');
    expect(useOcrStore.getState().resumeToken?.documentFingerprint).toBe('doc-hydrate');
    expect(
      result.diagnostics.some(
        (item) => item.code === 'OCR_RESUME_STATE_RESTORED',
      ),
    ).toBe(true);
  });

  it('restores checkpoint engine and profile configuration', () => {
    const resumeToken: OcrResumeTokenV1 = {
      ...makeResumeToken('doc-config-restore'),
      engineId: 'tesseract-js',
      profileId: 'table-heavy',
      executionConfig: {
        forceOcr: true,
        rasterScale: 3,
        maxCanvasPixels: 24_000_000,
      },
      tasks: [
        {
          id: 'ocr-batch-1',
          index: 0,
          pageIndexes: [0],
          status: 'failed',
          errorMessage: 'Interrupted before completion.',
        },
      ],
    };

    const payload = createOcrProjectPayload({
      documentFingerprint: 'doc-config-restore',
      resumeToken,
    });

    const result = hydrateOcrStoreFromProjectPayload({
      payload,
      expectedDocumentFingerprint: 'doc-config-restore',
    });

    expect(result.restored).toBe(true);
    expect(useOcrStore.getState().engineId).toBe('tesseract-js');
    expect(useOcrStore.getState().profileId).toBe('table-heavy');
    expect(useOcrStore.getState().forceOcr).toBe(true);
    expect(useOcrStore.getState().resumeToken?.executionConfig).toEqual({
      forceOcr: true,
      rasterScale: 3,
      maxCanvasPixels: 24_000_000,
    });
    expect(useOcrStore.getState().resumeToken?.engineId).toBe('tesseract-js');
    expect(useOcrStore.getState().resumeToken?.profileId).toBe('table-heavy');
  });

  it('normalizes fingerprint when expected document differs', async () => {
    const payload = await makePayload('old-doc');

    const result = hydrateOcrStoreFromProjectPayload({
      payload,
      expectedDocumentFingerprint: 'new-doc',
    });

    const state = useOcrStore.getState();

    expect(result.restored).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'DOCUMENT_FINGERPRINT_MISMATCH')).toBe(true);
    expect(state.documentFingerprint).toBe('new-doc');
    expect(state.result?.documentFingerprint).toBe('new-doc');
    expect(state.corrections[0].documentFingerprint).toBe('new-doc');
    expect(state.regions[0].documentFingerprint).toBe('new-doc');
    expect(result.writerInsertionQueue.candidates[0].element.documentFingerprint).toBe('new-doc');
    expect(result.resumeToken).toBeNull();
    expect(useOcrStore.getState().resumeToken).toBeNull();
    expect(
      result.diagnostics.some(
        (item) => item.code === 'OCR_RESUME_STATE_DISCARDED',
      ),
    ).toBe(true);
  });

  it('creates OCR project payload from current OCR store', async () => {
    const payload = await makePayload('doc-store-export');

    hydrateOcrStoreFromProjectPayload({
      payload,
      expectedDocumentFingerprint: 'doc-store-export',
    });

    const exported = createOcrProjectPayloadFromStore({
      writerInsertionQueue: payload.writerInsertionQueue,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(exported.manifest.documentFingerprint).toBe('doc-store-export');
    expect(exported.result?.pages).toHaveLength(1);
    expect(exported.corrections).toHaveLength(1);
    expect(exported.regions).toHaveLength(1);
    expect(exported.writerInsertionQueue.candidates).toHaveLength(1);
    expect(exported.manifest.resumeToken?.documentFingerprint).toBe('doc-store-export');
  });

  it('summarizes OCR project payload', async () => {
    const payload = await makePayload('doc-summary');

    const summary = summarizeOcrProjectPayload(payload);

    expect(summary.hasPayload).toBe(true);
    expect(summary.documentFingerprint).toBe('doc-summary');
    expect(summary.pages).toBe(1);
    expect(summary.corrections).toBe(1);
    expect(summary.regions).toBe(1);
    expect(summary.writerInsertionCandidates).toBe(1);
    expect(summary.searchableWords).toBeGreaterThan(0);

    expect(summarizeOcrProjectPayload(null).hasPayload).toBe(false);
  });

  it('normalizes OCR project payload for another document', async () => {
    const payload = await makePayload('old-doc');

    const normalized = normalizeOcrProjectPayloadForDocument(
      payload,
      'normalized-doc',
    );

    expect(normalized.manifest.documentFingerprint).toBe('normalized-doc');
    expect(normalized.result?.documentFingerprint).toBe('normalized-doc');
    expect(normalized.corrections[0].documentFingerprint).toBe('normalized-doc');
    expect(normalized.regions[0].documentFingerprint).toBe('normalized-doc');
    expect(normalized.writerInsertionQueue.candidates[0].element.documentFingerprint).toBe('normalized-doc');
    expect(normalized.manifest.resumeToken).toBeUndefined();
  });
});

async function makePayload(documentFingerprint: string) {
  const result = await mockOcrEngine.recognize({
    documentFingerprint,
    profile: getOcrProfile('clean-scan'),
    pages: [
      {
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      },
    ],
  });

  return createOcrProjectPayload({
    documentFingerprint,
    result,
    corrections: [
      createOcrCorrection({
        id: 'correction-1',
        documentFingerprint,
        pageIndex: 0,
        targetId: result.pages[0].words![0].id,
        targetType: 'word',
        originalText: result.pages[0].words![0].text,
        correctedText: 'Corrected',
        bbox: result.pages[0].words![0].bbox,
        now: '2026-01-01T00:00:00.000Z',
      }),
    ],
    regions: [
      createOcrRegion({
        id: 'region-1',
        documentFingerprint,
        pageIndex: 0,
        mode: 'text',
        bbox: {
          x: 60,
          y: 620,
          width: 420,
          height: 180,
        },
        now: '2026-01-01T00:00:00.000Z',
      }),
    ],
    writerInsertionQueue: createOcrWriterInsertionQueue([
      createOcrWriterInsertionCandidate({
        source: 'ocrRegion',
        element: makeWriterElement(documentFingerprint),
      }),
    ]),
    resumeToken: makeResumeToken(documentFingerprint),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
}

function makeResumeToken(
  documentFingerprint: string,
): OcrResumeTokenV1 {
  return {
    schema: 'pdf-hub-ocr-resume',
    schemaVersion: 1,
    documentFingerprint,
    engineId: 'mock',
    profileId: 'clean-scan',
    executionConfig: {
      forceOcr: false,
      rasterScale: 2,
      maxCanvasPixels: 16_000_000,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    tasks: [
      {
        id: 'ocr-batch-1',
        index: 0,
        pageIndexes: [0],
        status: 'completed',
      },
    ],
  };
}

function makeWriterElement(documentFingerprint: string): WriterElementV2 {
  return {
    id: 'ocr-text-1',
    documentFingerprint,
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 72,
      y: 640,
      width: 220,
      height: 80,
    },
    plainText: 'OCR text',
    style: {
      zIndex: 10,
      fontFamily: 'Aptos',
      fontSize: 11,
      textColor: '#111827',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      padding: 4,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}
