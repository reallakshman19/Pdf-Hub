/*
 * Legacy OCR preview store.
 *
 * Kept for backward compatibility with the old preview OCR sidebar.
 * New OCR V2 state lives in:
 *
 *   frontend/src/core/ocr/ocrStore.ts
 *
 * Do not extend this legacy store for new OCR/Doc Hub work.
 */

import {
  createLegacyOcrLaunchPlan,
  createLegacyOcrEmptyResultsByPage,
} from './legacyOcrCompat';
import type {
  OcrJob as NewOcrJob,
  OcrPageResult as NewOcrPageResult,
  OcrResultsByPage as NewOcrResultsByPage,
  OcrAnyBlock,
} from './types';
import type { OcrJobStatus } from './ocrJobTypes';

export type LegacyOcrJobStatus = OcrJobStatus;
export type LegacyOcrBlock = OcrAnyBlock;
export type LegacyOcrPageResult = NewOcrPageResult;
export type LegacyOcrResultsByPage = NewOcrResultsByPage;
export type LegacyOcrJob = NewOcrJob;

export type OcrJob = NewOcrJob;
export type OcrBlock = OcrAnyBlock;
export type OcrPageResult = NewOcrPageResult;
export type OcrResultsByPage = NewOcrResultsByPage;

export type OcrStoreListener = () => void;

export class OcrStore {
  private jobs: Map<string, LegacyOcrJob> = new Map();
  private resultsByPage: LegacyOcrResultsByPage = createLegacyOcrEmptyResultsByPage();
  private listeners: Set<OcrStoreListener> = new Set();

  subscribe(listener: OcrStoreListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore listener errors.
      }
    }
  }

  getJobs(): LegacyOcrJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => a.queuedAt - b.queuedAt,
    );
  }

  getResultsByPage(): LegacyOcrResultsByPage {
    return this.resultsByPage;
  }

  async startJob(
    documentKey: string,
    pageNumbers: number[],
    language = 'eng',
  ): Promise<LegacyOcrJob> {
    const plan = createLegacyOcrLaunchPlan({
      documentKey,
      pageNumbers,
      language,
    });

    this.jobs.set(plan.job.id, plan.job);
    this.notify();

    return plan.job;
  }

  updateBlock(
    pageNumber: number,
    blockId: string,
    patch: Partial<LegacyOcrBlock>,
  ): void {
    const result = this.resultsByPage[pageNumber];

    if (!result) return;

    const block = result.blocks.find((candidate) => candidate.id === blockId);

    if (!block) return;

    Object.assign(block, patch);
    this.notify();
  }

  cancelJob(id: string): void {
    const job = this.jobs.get(id);

    if (!job) return;
    if (job.status === 'complete' || job.status === 'failed') return;

    job.status = 'cancelled';
    job.finishedAt = Date.now();
    job.cancelled = true;
    this.notify();
  }


}

export const ocrStore = new OcrStore();