import {
  describe,
  expect,
  it,
} from 'vitest';
import { OcrStore } from '../store';

describe('legacy OcrStore retirement', () => {
  it('startJob creates cancelled retired job without running preview OCR', async () => {
    const store = new OcrStore();

    const job = await store.startJob('doc-legacy', [2, 1], 'eng');

    expect(job.status).toBe('cancelled');
    expect(job.cancelled).toBe(true);
    expect(job.pageNumbers).toEqual([1, 2]);
    expect(job.results).toEqual([]);

    expect(store.getJobs()).toHaveLength(1);
    expect(store.getJobs()[0].status).toBe('cancelled');
    expect(store.getResultsByPage()).toEqual({});
  });

  it('cancelJob remains safe on retired jobs', async () => {
    const store = new OcrStore();

    const job = await store.startJob('doc-legacy', [1], 'eng');

    store.cancelJob(job.id);

    expect(store.getJobs()[0].status).toBe('cancelled');
  });
});
