import { create } from 'zustand';
import type { OcrJob } from './ocrJobTypes';
import type {
  OcrDocumentResult,
  OcrPageResult,
  OcrReviewFocus,
} from './types';
import type { OcrProfileId } from './ocrProfiles';
import type {
  OcrCorrection,
  OcrCorrectionState,
} from './ocrCorrections';
import {
  applyOcrCorrectionsToDocument,
  createOcrCorrectionState,
  ocrCorrectionReducer,
} from './ocrCorrections';
import type {
  OcrRegion,
  OcrRegionMode,
} from './ocrRegionModel';
import {
  createOcrRegion,
} from './ocrRegionModel';
import type {
  OcrJobRunnerSnapshot,
} from './ocrJobRunner';
import type {
  OcrSearchIndex,
  OcrSearchQuery,
  OcrSearchMatch,
} from './ocrSearchIndex';
import {
  buildOcrSearchIndex,
  searchOcrIndex,
} from './ocrSearchIndex';
import type {
  OcrConfidenceSummary,
  OcrLowConfidenceWord,
} from './ocrConfidence';
import {
  collectLowConfidenceWords,
  summarizeOcrDocumentConfidence,
} from './ocrConfidence';
import type { PdfRect } from '../writer-v2/types';
import { useSessionStore } from '../session/store';
import {
  normalizeOcrPageAnchoredState,
  pageIdForOcrPageIndex,
} from './ocrPageAnchor';

export interface OcrStoreDerivedState {
  correctedResult: OcrDocumentResult | null;
  searchIndex: OcrSearchIndex | null;
  confidenceSummary: OcrConfidenceSummary | null;
  lowConfidenceWords: OcrLowConfidenceWord[];
}

export interface OcrStoreState extends OcrStoreDerivedState {
  documentFingerprint: string | null;
  engineId: string;
  profileId: OcrProfileId;
  forceOcr: boolean;
  selectedPageIndexes: number[];

  activeJobId: string | null;
  jobs: OcrJob[];
  result: OcrDocumentResult | null;

  corrections: OcrCorrection[];
  regions: OcrRegion[];
  reviewFocus: OcrReviewFocus | null;

  lastUpdatedAt: string | null;
  dirty: boolean;

  hydrateOcrSession: (input: {
    documentFingerprint: string;
    result?: OcrDocumentResult | null;
    corrections?: OcrCorrection[];
    regions?: OcrRegion[];
    engineId?: string;
    profileId?: OcrProfileId;
    forceOcr?: boolean;
    selectedPageIndexes?: number[];
    updatedAt?: string;
  }) => void;

  setOcrEngineId: (engineId: string) => void;
  setOcrProfileId: (profileId: OcrProfileId) => void;
  setForceOcr: (forceOcr: boolean) => void;
  setSelectedOcrPages: (pageIndexes: number[]) => void;

  applyOcrJobSnapshot: (snapshot: OcrJobRunnerSnapshot) => void;
  setOcrResult: (result: OcrDocumentResult | null) => void;

  upsertOcrCorrection: (correction: OcrCorrection) => void;
  deleteOcrCorrection: (correctionId: string) => void;
  deleteOcrCorrectionForTarget: (input: {
    documentFingerprint: string;
    pageIndex: number;
    targetId: string;
  }) => void;
  clearOcrCorrectionsForDocument: (documentFingerprint: string) => void;

  addOcrRegion: (input: {
    id: string;
    documentFingerprint?: string;
    pageIndex: number;
    bbox: PdfRect;
    mode: OcrRegionMode;
    now?: string;
  }) => OcrRegion | null;
  upsertOcrRegion: (region: OcrRegion) => void;
  deleteOcrRegion: (regionId: string) => void;
  clearOcrRegionsForDocument: (documentFingerprint: string) => void;

  searchOcr: (query: OcrSearchQuery) => OcrSearchMatch[];
  getOcrPageResult: (pageIndex: number) => OcrPageResult | null;
  focusOcrTarget: (focus: Omit<OcrReviewFocus, 'requestedAt'>) => void;
  clearOcrFocus: () => void;

  markOcrPersisted: (persistedAt?: string) => void;
  clearOcr: () => void;
}

export const useOcrStore = create<OcrStoreState>((set, get) => ({
  ...createInitialOcrStoreState(),

  hydrateOcrSession: (input) => {
    const baseState: OcrStoreState = {
      ...get(),
      ...getInitialOcrDataState(),
      documentFingerprint: input.documentFingerprint,
      engineId: input.engineId ?? 'mock',
      profileId: input.profileId ?? 'clean-scan',
      forceOcr: input.forceOcr ?? false,
      selectedPageIndexes: normalizePageIndexes(input.selectedPageIndexes ?? []),
      result: input.result ?? null,
      corrections: [...(input.corrections ?? [])],
      regions: [...(input.regions ?? [])],
      reviewFocus: null,
      lastUpdatedAt: input.updatedAt ?? new Date().toISOString(),
      dirty: false,
    };

    set(recomputeOcrDerivedState(baseState));
  },

  setOcrEngineId: (engineId) => {
    set({
      engineId,
      dirty: true,
      lastUpdatedAt: new Date().toISOString(),
    });
  },

  setOcrProfileId: (profileId) => {
    set({
      profileId,
      dirty: true,
      lastUpdatedAt: new Date().toISOString(),
    });
  },

  setForceOcr: (forceOcr) => {
    set({
      forceOcr,
      dirty: true,
      lastUpdatedAt: new Date().toISOString(),
    });
  },

  setSelectedOcrPages: (pageIndexes) => {
    set({
      selectedPageIndexes: normalizePageIndexes(pageIndexes),
      dirty: true,
      lastUpdatedAt: new Date().toISOString(),
    });
  },

  applyOcrJobSnapshot: (snapshot) => {
    const previous = get();
    const activeDocumentKey = useSessionStore.getState().documentKey;
    if (
      activeDocumentKey
      && snapshot.job.documentFingerprint
      && snapshot.job.documentFingerprint !== activeDocumentKey
    ) {
      return;
    }
    const jobs = upsertJob(previous.jobs, snapshot.job);

    const nextState: OcrStoreState = {
      ...previous,
      documentFingerprint: snapshot.job.documentFingerprint ?? previous.documentFingerprint,
      activeJobId: snapshot.job.id,
      jobs,
      result: snapshot.partialResult,
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    };

    set(recomputeOcrDerivedState(nextState));
  },

  setOcrResult: (result) => {
    const previous = get();

    const nextState: OcrStoreState = {
      ...previous,
      documentFingerprint: result?.documentFingerprint ?? previous.documentFingerprint,
      result,
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    };

    set(recomputeOcrDerivedState(nextState));
  },

  upsertOcrCorrection: (correction) => {
    const previous = get();
    const correctionState: OcrCorrectionState = createOcrCorrectionState(
      previous.corrections,
    );

    const nextCorrectionState = ocrCorrectionReducer(correctionState, {
      type: 'UPSERT_OCR_CORRECTION',
      correction,
    });

    const nextState: OcrStoreState = {
      ...previous,
      corrections: nextCorrectionState.corrections,
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    };

    set(recomputeOcrDerivedState(nextState));
  },

  deleteOcrCorrection: (correctionId) => {
    const previous = get();
    const correctionState = createOcrCorrectionState(previous.corrections);

    const nextCorrectionState = ocrCorrectionReducer(correctionState, {
      type: 'DELETE_OCR_CORRECTION',
      correctionId,
    });

    const nextState: OcrStoreState = {
      ...previous,
      corrections: nextCorrectionState.corrections,
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    };

    set(recomputeOcrDerivedState(nextState));
  },

  deleteOcrCorrectionForTarget: (input) => {
    const previous = get();
    const correctionState = createOcrCorrectionState(previous.corrections);

    const nextCorrectionState = ocrCorrectionReducer(correctionState, {
      type: 'DELETE_OCR_CORRECTION_FOR_TARGET',
      documentFingerprint: input.documentFingerprint,
      pageIndex: input.pageIndex,
      targetId: input.targetId,
    });

    const nextState: OcrStoreState = {
      ...previous,
      corrections: nextCorrectionState.corrections,
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    };

    set(recomputeOcrDerivedState(nextState));
  },

  clearOcrCorrectionsForDocument: (documentFingerprint) => {
    const previous = get();
    const correctionState = createOcrCorrectionState(previous.corrections);

    const nextCorrectionState = ocrCorrectionReducer(correctionState, {
      type: 'CLEAR_OCR_CORRECTIONS_FOR_DOCUMENT',
      documentFingerprint,
    });

    const nextState: OcrStoreState = {
      ...previous,
      corrections: nextCorrectionState.corrections,
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    };

    set(recomputeOcrDerivedState(nextState));
  },

  addOcrRegion: (input) => {
    const documentFingerprint = input.documentFingerprint ?? get().documentFingerprint;

    if (!documentFingerprint) {
      return null;
    }

    const region = createOcrRegion({
      id: input.id,
      documentFingerprint,
      pageId: pageIdForOcrPageIndex(
        useSessionStore.getState().pageGraph,
        input.pageIndex,
      ),
      pageIndex: input.pageIndex,
      bbox: input.bbox,
      mode: input.mode,
      now: input.now,
    });

    get().upsertOcrRegion(region);

    return region;
  },

  upsertOcrRegion: (region) => {
    const previous = get();

    const nextState: OcrStoreState = {
      ...previous,
      documentFingerprint: previous.documentFingerprint ?? region.documentFingerprint,
      regions: upsertRegion(previous.regions, region),
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    };

    set(recomputeOcrDerivedState(nextState));
  },

  deleteOcrRegion: (regionId) => {
    set({
      regions: get().regions.filter((region) => region.id !== regionId),
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    });
  },

  clearOcrRegionsForDocument: (documentFingerprint) => {
    set({
      regions: get().regions.filter(
        (region) => region.documentFingerprint !== documentFingerprint,
      ),
      lastUpdatedAt: new Date().toISOString(),
      dirty: true,
    });
  },

  searchOcr: (query) => {
    const index = get().searchIndex;

    if (!index) {
      return [];
    }

    return searchOcrIndex(index, query);
  },

  getOcrPageResult: (pageIndex) => {
    return get().correctedResult?.pages.find(
      (page) => page.pageIndex === pageIndex,
    ) ?? null;
  },

  focusOcrTarget: (focus) => {
    const pageId =
      focus.pageId
      ?? pageIdForOcrPageIndex(
        useSessionStore.getState().pageGraph,
        focus.pageIndex,
      );

    set({
      reviewFocus: {
        ...focus,
        ...(pageId ? { pageId } : {}),
        requestedAt: Date.now(),
      },
    });
  },

  clearOcrFocus: () => set({ reviewFocus: null }),

  markOcrPersisted: (persistedAt = new Date().toISOString()) => {
    set({
      dirty: false,
      lastUpdatedAt: persistedAt,
    });
  },

  clearOcr: () => {
    set(getInitialOcrDataState());
  },
}));

export function getInitialOcrDataState() {
  return {
    documentFingerprint: null,
    engineId: 'mock',
    profileId: 'clean-scan' as OcrProfileId,
    forceOcr: false,
    selectedPageIndexes: [],

    activeJobId: null,
    jobs: [],
    result: null,

    corrections: [],
    regions: [],
    reviewFocus: null,

    correctedResult: null,
    searchIndex: null,
    confidenceSummary: null,
    lowConfidenceWords: [],

    lastUpdatedAt: null,
    dirty: false,
  };
}

export function createInitialOcrStoreState(): OcrStoreState {
  return {
    ...getInitialOcrDataState(),
    hydrateOcrSession: () => undefined,
    setOcrEngineId: () => undefined,
    setOcrProfileId: () => undefined,
    setForceOcr: () => undefined,
    setSelectedOcrPages: () => undefined,
    applyOcrJobSnapshot: () => undefined,
    setOcrResult: () => undefined,
    upsertOcrCorrection: () => undefined,
    deleteOcrCorrection: () => undefined,
    deleteOcrCorrectionForTarget: () => undefined,
    clearOcrCorrectionsForDocument: () => undefined,
    addOcrRegion: () => null,
    upsertOcrRegion: () => undefined,
    deleteOcrRegion: () => undefined,
    clearOcrRegionsForDocument: () => undefined,
    searchOcr: () => [],
    getOcrPageResult: () => null,
    focusOcrTarget: () => undefined,
    clearOcrFocus: () => undefined,
    markOcrPersisted: () => undefined,
    clearOcr: () => undefined,
  };
}

export function recomputeOcrDerivedState(
  state: OcrStoreState,
): OcrStoreState {
  const anchored = normalizeOcrPageAnchoredState(
    {
      documentFingerprint: state.documentFingerprint,
      result: state.result,
      corrections: state.corrections,
      regions: state.regions,
      selectedPageIndexes: state.selectedPageIndexes,
      reviewFocus: state.reviewFocus,
    },
    useSessionStore.getState().pageGraph,
  );

  const correctedResult = anchored.result
    ? applyOcrCorrectionsToDocument(anchored.result, anchored.corrections)
    : null;

  const searchIndex = correctedResult
    ? buildOcrSearchIndex({
        document: correctedResult,
        corrections: anchored.corrections,
      })
    : null;

  const confidenceSummary = correctedResult
    ? summarizeOcrDocumentConfidence(correctedResult)
    : null;

  const lowConfidenceWords = correctedResult
    ? collectLowConfidenceWords(correctedResult)
    : [];

  return {
    ...state,
    ...anchored,
    correctedResult,
    searchIndex,
    confidenceSummary,
    lowConfidenceWords,
  };
}

function upsertJob(
  jobs: OcrJob[],
  nextJob: OcrJob,
): OcrJob[] {
  const exists = jobs.some((job) => job.id === nextJob.id);

  if (!exists) {
    return [...jobs, nextJob];
  }

  return jobs.map((job) =>
    job.id === nextJob.id ? nextJob : job,
  );
}

function upsertRegion(
  regions: OcrRegion[],
  nextRegion: OcrRegion,
): OcrRegion[] {
  const exists = regions.some((region) => region.id === nextRegion.id);

  if (!exists) {
    return [...regions, nextRegion];
  }

  return regions.map((region) =>
    region.id === nextRegion.id ? nextRegion : region,
  );
}

function normalizePageIndexes(
  pageIndexes: number[],
): number[] {
  return [...new Set(
    pageIndexes
      .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0),
  )].sort((a, b) => a - b);
}
