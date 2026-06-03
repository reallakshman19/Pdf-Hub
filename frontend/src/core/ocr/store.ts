/*
 * OCR job store.
 *
 * This store manages the lifecycle of OCR jobs and page results in
 * preview mode.  It does not perform actual OCR – that work is
 * delegated to adapters such as the TesseractAdapter.  Instead the
 * store tracks job states, collects page results, and exposes methods
 * to start jobs and listen for updates.  Consumers can subscribe to
 * changes via a simple observer pattern or by polling the store.
 */

/*
 * Use a simple random ID generator instead of uuid to avoid
 * importing additional dependencies.  This function generates a
 * short alphanumeric string suitable for identifying jobs.
 */
function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}
import type { OcrJob, OcrResultsByPage, OcrBlock } from './types';
import { recognizePages } from '../../adapters/ocr-preview/TesseractAdapter';

export type OcrStoreListener = () => void;

/**
 * A simple observable store for OCR jobs.  Because the app runs
 * entirely in the browser, this store tracks all active jobs and
 * associated results for the current session.  Jobs persist only for
 * the lifetime of the page.  Consumers can subscribe to be notified
 * whenever any job or result changes.
 */
export class OcrStore {
  private jobs: Map<string, OcrJob> = new Map();
  private resultsByPage: OcrResultsByPage = {};
  private listeners: Set<OcrStoreListener> = new Set();

  /**
   * Subscribe to store updates.  The callback will be invoked
   * whenever job or result state changes.  Returns a function to
   * unsubscribe.
   */
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
        // swallow listener errors
      }
    }
  }

  /**
   * Get an array of all OCR jobs, sorted by queued time ascending.
   */
  getJobs(): OcrJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => a.queuedAt - b.queuedAt);
  }

  /**
   * Get aggregated page results.  This object is keyed by page
   * number and holds the most recent result for each page.
   */
  getResultsByPage(): OcrResultsByPage {
    return this.resultsByPage;
  }

  /**
   * Start a new OCR job for the specified pages.  In preview mode
   * this calls the recognizePages adapter and records the results.
   */
  async startJob(documentKey: string, pageNumbers: number[], language = 'eng'): Promise<OcrJob> {
    const id = generateId();
    const job: OcrJob = {
      id,
      documentKey,
      pageNumbers,
      status: 'queued',
      results: [],
      queuedAt: Date.now(),
      cancelled: false,
    };
    this.jobs.set(id, job);
    this.notify();

    // Start the asynchronous recognition.  This immediately marks the
    // job as running and then populates results.  We catch errors
    // silently to avoid unhandled promise rejection.
    (async () => {
      job.status = 'running';
      job.startedAt = Date.now();
      this.notify();
      try {
        const pageResults = await recognizePages({
          documentKey,
          pageNumbers,
          language,
        });
        job.results = pageResults;
        job.status = 'complete';
        job.finishedAt = Date.now();
        // Merge results into global map
        for (const pageResult of pageResults) {
          this.resultsByPage[pageResult.pageNumber] = pageResult;
        }
      } catch {
        job.status = 'failed';
        job.finishedAt = Date.now();
      }
      this.notify();
    })().catch(() => {
      // ignore async errors
    });
    return job;
  }

  updateBlock(pageNumber: number, blockId: string, patch: Partial<OcrBlock>): void {
    const result = this.resultsByPage[pageNumber];
    if (!result) return;
    const block = result.blocks.find(b => b.id === blockId);
    if (!block) return;
    Object.assign(block, patch);
    this.notify();
  }

  /**
   * Cancel a running job.  This marks the job as cancelled and
   * prevents further results from being merged.  Currently there is
   * no mechanism to abort the recognition task itself, since it
   * completes quickly in preview mode.
   */
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