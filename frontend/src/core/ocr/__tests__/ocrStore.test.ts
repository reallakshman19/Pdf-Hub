import { beforeEach, describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import { runOcrJob } from '../ocrJobRunner';
import { createOcrCorrection } from '../ocrCorrections';
import type { OcrResumeTokenV1 } from '../ocrResumeState';
import { useSessionStore } from '../../session/store';
import {
  recomputeOcrDerivedState,
  useOcrStore,
} from '../ocrStore';

describe('ocrStore', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
    useSessionStore.getState().clearDocument();
  });

  it('starts with stable initial OCR state', () => {
    const state = useOcrStore.getState();

    expect(state.documentFingerprint).toBeNull();
    expect(state.engineId).toBe('mock');
    expect(state.profileId).toBe('clean-scan');
    expect(state.resumeToken).toBeNull();
    expect(state.forceOcr).toBe(false);
    expect(state.selectedPageIndexes).toEqual([]);
    expect(state.result).toBeNull();
    expect(state.searchIndex).toBeNull();
    expect(state.dirty).toBe(false);
  });

  it('hydrates OCR session and derives search/confidence state', async () => {
    const document = await createMockDocument();

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: document.documentFingerprint,
      result: document,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const state = useOcrStore.getState();

    expect(state.documentFingerprint).toBe(document.documentFingerprint);
    expect(state.result).toBe(document);
    expect(state.correctedResult).not.toBeNull();
    expect(state.searchIndex).not.toBeNull();
    expect(state.confidenceSummary?.totalWords).toBeGreaterThan(0);
    expect(state.lowConfidenceWords.length).toBeGreaterThan(0);
    expect(state.dirty).toBe(false);
  });

  it('updates OCR settings', () => {
    const store = useOcrStore.getState();

    store.setOcrEngineId('mock-custom');
    store.setOcrProfileId('table-heavy');
    store.setForceOcr(true);
    store.setSelectedOcrPages([3, 1, 1, -1, 2]);

    const state = useOcrStore.getState();

    expect(state.engineId).toBe('mock-custom');
    expect(state.profileId).toBe('table-heavy');
    expect(state.forceOcr).toBe(true);
    expect(state.selectedPageIndexes).toEqual([1, 2, 3]);
    expect(state.dirty).toBe(true);
  });

  it('invalidates resume state when OCR execution settings change', () => {
    const store = useOcrStore.getState();

    store.hydrateOcrSession({
      documentFingerprint: 'doc-resume-settings',
      resumeToken: makeResumeToken('doc-resume-settings'),
    });

    expect(useOcrStore.getState().resumeToken).not.toBeNull();

    store.setOcrEngineId('mock-custom');
    expect(useOcrStore.getState().resumeToken).toBeNull();

    store.setOcrResumeToken(makeResumeToken('doc-resume-settings'));
    store.setOcrProfileId('table-heavy');
    expect(useOcrStore.getState().resumeToken).toBeNull();

    store.setOcrResumeToken(makeResumeToken('doc-resume-settings'));
    store.setForceOcr(true);
    expect(useOcrStore.getState().resumeToken).toBeNull();

    store.setOcrResumeToken(makeResumeToken('doc-resume-settings'));
    store.setSelectedOcrPages([0, 1]);
    expect(useOcrStore.getState().resumeToken).toBeNull();
  });

  it('rejects incompatible or malformed checkpoints at every store entry path', () => {
    const valid = makeResumeToken('doc-checkpoint-boundary');

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-checkpoint-boundary',
      engineId: 'mock',
      profileId: 'clean-scan',
      forceOcr: false,
      resumeToken: {
        ...valid,
        engineId: 'other-engine',
      },
    });
    expect(useOcrStore.getState().resumeToken).toBeNull();

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-checkpoint-boundary',
      engineId: 'mock',
      profileId: 'clean-scan',
      forceOcr: false,
      resumeToken: valid,
    });
    expect(useOcrStore.getState().resumeToken).not.toBeNull();

    useOcrStore.getState().setOcrResumeToken({
      ...valid,
      documentFingerprint: 'another-document',
    });
    expect(useOcrStore.getState().resumeToken).toBeNull();

    useOcrStore.getState().setOcrResumeToken({
      ...valid,
      profileId: 'table-heavy',
    });
    expect(useOcrStore.getState().resumeToken).toBeNull();

    useOcrStore.getState().setOcrResumeToken({
      ...valid,
      executionConfig: {
        ...valid.executionConfig,
        forceOcr: true,
      },
    });
    expect(useOcrStore.getState().resumeToken).toBeNull();

    useOcrStore.getState().setOcrResumeToken({
      ...valid,
      tasks: [
        {
          ...valid.tasks[0],
          status: 'not-a-real-status',
        },
      ],
    } as unknown as OcrResumeTokenV1);
    expect(useOcrStore.getState().resumeToken).toBeNull();
  });

  it('drops completed checkpoints when persisted OCR evidence is removed or failed', async () => {
    const document = await createMockDocument();
    const completedToken = makeCompletedResumeToken('doc-store');

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-store',
      result: document,
      resumeToken: completedToken,
    });

    expect(useOcrStore.getState().resumeToken).not.toBeNull();

    useOcrStore.getState().setOcrResult({
      ...document,
      pages: [],
    });
    expect(useOcrStore.getState().resumeToken).toBeNull();

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-store',
      result: document,
      resumeToken: completedToken,
    });
    expect(useOcrStore.getState().resumeToken).not.toBeNull();

    useOcrStore.getState().setOcrResult({
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        status: 'failed' as const,
      })),
    });
    expect(useOcrStore.getState().resumeToken).toBeNull();
  });

  it('clears resume state when a replacement OCR result uses another configuration', async () => {
    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-store',
      resumeToken: makeResumeToken('doc-store'),
    });

    const document = await createMockDocument();
    useOcrStore.getState().setOcrResult({
      ...document,
      engineId: 'different-engine',
    });

    expect(useOcrStore.getState().resumeToken).toBeNull();
  });

  it('sets OCR result and supports store search', async () => {
    const document = await createMockDocument();

    useOcrStore.getState().setOcrResult(document);

    const matches = useOcrStore.getState().searchOcr({
      text: 'writer ocr',
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].item.pageIndex).toBe(0);
  });

  it('upserts correction and updates derived corrected result/search index', async () => {
    const document = await createMockDocument();
    const targetWord = document.pages[0].words?.find((word) => word.text === 'P1pe');

    if (!targetWord) {
      throw new Error('Expected mock P1pe word.');
    }

    useOcrStore.getState().setOcrResult(document);

    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: document.documentFingerprint,
      pageIndex: 0,
      targetId: targetWord.id,
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: targetWord.bbox,
      now: '2026-01-01T00:00:00.000Z',
    });

    useOcrStore.getState().upsertOcrCorrection(correction);

    const state = useOcrStore.getState();
    const correctedWord = state.correctedResult?.pages[0].words?.find(
      (word) => word.id === targetWord.id,
    );

    expect(state.corrections).toHaveLength(1);
    expect(correctedWord?.text).toBe('Pipe');

    const matches = state.searchOcr({
      text: 'pipe',
      source: 'ocrCorrection',
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.item.text === 'Pipe')).toBe(true);
  });

  it('deletes correction by id and recomputes derived state', async () => {
    const document = await createMockDocument();
    const targetWord = document.pages[0].words?.find((word) => word.text === 'P1pe');

    if (!targetWord) {
      throw new Error('Expected mock P1pe word.');
    }

    useOcrStore.getState().setOcrResult(document);

    const correction = createOcrCorrection({
      id: 'correction-1',
      documentFingerprint: document.documentFingerprint,
      pageIndex: 0,
      targetId: targetWord.id,
      targetType: 'word',
      originalText: 'P1pe',
      correctedText: 'Pipe',
      bbox: targetWord.bbox,
      now: '2026-01-01T00:00:00.000Z',
    });

    useOcrStore.getState().upsertOcrCorrection(correction);
    useOcrStore.getState().deleteOcrCorrection('correction-1');

    const state = useOcrStore.getState();
    const correctedWord = state.correctedResult?.pages[0].words?.find(
      (word) => word.id === targetWord.id,
    );

    expect(state.corrections).toHaveLength(0);
    expect(correctedWord?.text).toBe('P1pe');
  });

  it('adds, upserts, and deletes OCR regions', () => {
    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-region-store',
    });

    const region = useOcrStore.getState().addOcrRegion({
      id: 'region-1',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 10,
        y: 20,
        width: 100,
        height: 40,
      },
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(region).not.toBeNull();
    expect(useOcrStore.getState().regions).toHaveLength(1);

    useOcrStore.getState().upsertOcrRegion({
      ...region!,
      mode: 'table',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(useOcrStore.getState().regions).toHaveLength(1);
    expect(useOcrStore.getState().regions[0].mode).toBe('table');

    useOcrStore.getState().deleteOcrRegion('region-1');

    expect(useOcrStore.getState().regions).toHaveLength(0);
  });

  it('does not add region without document fingerprint', () => {
    const region = useOcrStore.getState().addOcrRegion({
      id: 'region-no-doc',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 10,
        y: 20,
        width: 100,
        height: 40,
      },
    });

    expect(region).toBeNull();
    expect(useOcrStore.getState().regions).toHaveLength(0);
  });

  it('applies OCR job snapshot into store', async () => {
    const snapshots: string[] = [];

    const result = await runOcrJob({
      id: 'job-store',
      documentFingerprint: 'doc-store-job',
      engineId: 'mock',
      now: '2026-01-01T00:00:00.000Z',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
          imageCount: 1,
        },
      ],
      onProgress: (snapshot) => {
        snapshots.push(snapshot.job.status);
        useOcrStore.getState().applyOcrJobSnapshot(snapshot);
      },
    });

    const state = useOcrStore.getState();

    expect(result.job.status).toBe('completed');
    expect(snapshots).toContain('running');
    expect(snapshots).toContain('completed');
    expect(state.activeJobId).toBe('job-store');
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0].status).toBe('completed');
    expect(state.result?.documentFingerprint).toBe('doc-store-job');
    expect(state.searchIndex).not.toBeNull();
  });

  it('accumulates compatible batch-local OCR results instead of overwriting prior pages', async () => {
    const runPage = async (pageIndex: number) => {
      await runOcrJob({
        id: `job-store-batch-${pageIndex}`,
        documentFingerprint: 'doc-store-batches',
        engineId: 'mock',
        requestedProfileId: 'clean-scan',
        forceOcr: true,
        selectedPageIndexes: [pageIndex],
        pages: [
          {
            pageIndex,
            imageBytes: new Uint8Array([1, 2, 3]),
            width: 595,
            height: 842,
            imageCount: 1,
          },
        ],
        onProgress: (snapshot) => {
          useOcrStore.getState().applyOcrJobSnapshot(snapshot);
        },
      });
    };

    await runPage(0);
    await runPage(1);

    expect(
      useOcrStore.getState().result?.pages.map((page) => page.pageIndex),
    ).toEqual([0, 1]);
  });

  it('gets OCR page result from corrected result', async () => {
    const document = await createMockDocument();

    useOcrStore.getState().setOcrResult(document);

    expect(useOcrStore.getState().getOcrPageResult(0)?.pageIndex).toBe(0);
    expect(useOcrStore.getState().getOcrPageResult(99)).toBeNull();
  });

  it('publishes and clears a document focus target for OCR review', () => {
    const store = useOcrStore.getState();

    store.focusOcrTarget({
      documentFingerprint: 'doc-focus',
      pageIndex: 2,
      bbox: {
        x: 100,
        y: 200,
        width: 50,
        height: 16,
      },
      targetId: 'word-focus',
      source: 'lowConfidence',
      label: 'PROCESS',
    });

    const focus = useOcrStore.getState().reviewFocus;
    expect(focus).toMatchObject({
      documentFingerprint: 'doc-focus',
      pageIndex: 2,
      targetId: 'word-focus',
      source: 'lowConfidence',
      label: 'PROCESS',
    });
    expect(focus?.requestedAt).toEqual(expect.any(Number));

    store.clearOcrFocus();
    expect(useOcrStore.getState().reviewFocus).toBeNull();
  });

  it('marks OCR state persisted and clears OCR state', async () => {
    const document = await createMockDocument();

    useOcrStore.getState().setOcrResult(document);
    expect(useOcrStore.getState().dirty).toBe(true);

    useOcrStore.getState().markOcrPersisted('2026-01-03T00:00:00.000Z');

    expect(useOcrStore.getState().dirty).toBe(false);
    expect(useOcrStore.getState().lastUpdatedAt).toBe('2026-01-03T00:00:00.000Z');

    useOcrStore.getState().clearOcr();

    expect(useOcrStore.getState().documentFingerprint).toBeNull();
    expect(useOcrStore.getState().result).toBeNull();
    expect(useOcrStore.getState().searchIndex).toBeNull();
  });

  it('recomputeOcrDerivedState is pure for supplied state object', async () => {
    const document = await createMockDocument();

    const base = {
      ...useOcrStore.getState(),
      documentFingerprint: document.documentFingerprint,
      result: document,
    };

    const recomputed = recomputeOcrDerivedState(base);

    expect(recomputed).not.toBe(base);
    expect(recomputed.correctedResult).not.toBeNull();
    expect(recomputed.searchIndex).not.toBeNull();
    expect(base.searchIndex).toBeNull();
  });

  it('hydrates pageIndex-only OCR data onto the active PageGraph', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'doc-store',
      fileName: 'ocr.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'stable-ocr-page',
          documentKey: 'doc-store',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
    });
    const document = await createMockDocument();

    useOcrStore.getState().hydrateOcrSession({
      documentFingerprint: 'doc-store',
      result: document,
      selectedPageIndexes: [0],
    });

    expect(useOcrStore.getState().result?.pages[0]).toMatchObject({
      pageId: 'stable-ocr-page',
      pageIndex: 0,
    });
    expect(useOcrStore.getState().result?.pages[0]?.words?.[0]?.pageId).toBe(
      'stable-ocr-page',
    );
  });

  it('rejects a direct OCR result from a superseded document revision', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'current-doc',
      fileName: 'current.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
    });
    const stale = await createMockDocument();

    useOcrStore.getState().setOcrResult(stale);

    expect(useOcrStore.getState().result).toBeNull();
    expect(useOcrStore.getState().documentFingerprint).toBeNull();
  });


  it('ignores late OCR job snapshots from a superseded document revision', async () => {
    useSessionStore.getState().openDocument({
      documentKey: 'current-doc',
      fileName: 'current.pdf',
      bytes: new Uint8Array([1]),
      pageCount: 1,
    });

    await runOcrJob({
      id: 'stale-job',
      documentFingerprint: 'old-doc',
      engineId: 'mock',
      now: '2026-09-18T00:00:00.000Z',
      pages: [{
        pageIndex: 0,
        imageBytes: new Uint8Array([1, 2, 3]),
        width: 595,
        height: 842,
      }],
      onProgress: (snapshot) => {
        useOcrStore.getState().applyOcrJobSnapshot(snapshot);
      },
    });

    expect(useOcrStore.getState().activeJobId).toBeNull();
    expect(useOcrStore.getState().jobs).toEqual([]);
    expect(useOcrStore.getState().result).toBeNull();
  });

});

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
        status: 'failed',
        errorMessage: 'Retryable checkpoint.',
      },
    ],
  };
}

function makeCompletedResumeToken(
  documentFingerprint: string,
): OcrResumeTokenV1 {
  const token = makeResumeToken(documentFingerprint);
  return {
    ...token,
    tasks: token.tasks.map((task) => ({
      ...task,
      status: 'completed',
      errorMessage: undefined,
    })),
  };
}

async function createMockDocument() {
  return mockOcrEngine.recognize({
    documentFingerprint: 'doc-store',
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
}
