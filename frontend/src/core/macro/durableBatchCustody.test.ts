import { beforeEach, describe, expect, it } from 'vitest';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import type { BatchOutputArtifact, BatchRunResult } from './batchRunner';
import {
  configureBatchCustodyAdapter,
  useMacroOutputQueueStore,
} from './outputQueueStore';
import {
  createVolatileBatchCustodyAdapter,
  type BatchCustodyAdapter,
} from './durableBatchCustody';

const name = 'one-source.pdf';
const sourceSha256 = 'sha256:' + 'a'.repeat(64);
const recipeSha256 = 'sha256:' + 'b'.repeat(64);

async function outputGroup(): Promise<BatchOutputArtifact[]> {
  const bytes = [
    new Uint8Array([37, 80, 68, 70, 45, 49]),
    new Uint8Array([37, 80, 68, 70, 45, 50]),
  ];
  return Promise.all(bytes.map(async (value, index) => ({
    outputIndex: index,
    outputPageCount: index === 0 ? 3 : 1,
    outputKind: index === 0 ? 'working-copy' as const : 'auxiliary' as const,
    originalOutputName: index ? 'one-page.pdf' : undefined,
    fileName: name,
    inputIndex: 0,
    inputPageCount: 3,
    sourceSha256,
    recipeId: 'batch-extract-current',
    recipeSha256,
    batchRunId: 'custody-run-1',
    outputName: `001-source-${index}.pdf`,
    outputSha256: await FileAdapter.hashBytes(value),
    bytes: value,
  })));
}

function reportFixture(): BatchRunResult {
  return {
    outcome: 'completed',
    cancelled: false,
    records: [],
    summary: {
      selected: 1, processed: 1, succeeded: 1,
      outputsPrepared: 2, outputsHandedOff: 2,
      failed: 0, cancelled: 0, notRun: 0,
    },
    metadata: {
      runId: 'custody-run-1',
      recipeId: 'batch-extract-current',
      recipeSha256,
      startedAt: '2026-11-19T00:00:00.000Z',
      endedAt: '2026-11-19T00:00:01.000Z',
    },
    evidence: {} as BatchRunResult['evidence'],
  };
}

describe('WP07 R4 durable batch output custody contract', () => {
  let adapter: BatchCustodyAdapter;

  beforeEach(() => {
    adapter = createVolatileBatchCustodyAdapter();
    configureBatchCustodyAdapter(adapter);
  });

  it('restores all per-input PDFs and the report after a simulated browser-context restart', async () => {
    const files = await outputGroup();
    const ids = await useMacroOutputQueueStore.getState().enqueueBatchOutputs(files);
    await useMacroOutputQueueStore.getState().saveBatchReport(reportFixture());
    expect(ids).toHaveLength(2);
    expect(useMacroOutputQueueStore.getState().batchCustodyStatus).toBe('volatile');
    configureBatchCustodyAdapter({
      ...adapter,
      // Emulate IndexedDB UUID-primary-key ordering, not commit ordering.
      async loadOutputs() { return (await adapter.loadOutputs()).reverse(); },
    });
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(0);
    await useMacroOutputQueueStore.getState().hydrateBatchCustody();
    const restored = useMacroOutputQueueStore.getState();
    expect(restored.outputs.map((o) => o.id)).toEqual(ids);
    expect(restored.outputs.map((o) => o.sourceOutputIndex)).toEqual([0, 1]);
    expect(restored.outputs.map((o) => o.bytes)).toEqual(files.map((o) => o.bytes));
    expect(restored.lastBatchReport?.metadata.runId).toBe('custody-run-1');
  });

  it('awaits durable delete before hiding a receipt-confirmed output; the other is recoverable', async () => {
    const files = await outputGroup();
    const ids = await useMacroOutputQueueStore.getState().enqueueBatchOutputs(files);
    await useMacroOutputQueueStore.getState().acknowledgeBatchOutput(ids[0]);
    expect(useMacroOutputQueueStore.getState().outputs.map((o) => o.id)).toEqual([ids[1]]);
    configureBatchCustodyAdapter(adapter);
    await useMacroOutputQueueStore.getState().hydrateBatchCustody();
    expect(useMacroOutputQueueStore.getState().outputs.map((o) => o.id)).toEqual([ids[1]]);
  });

  it('blocks recovery on changed persisted bytes without silently deleting corrupt originals', async () => {
    const files = await outputGroup();
    const ids = await useMacroOutputQueueStore.getState().enqueueBatchOutputs(files);
    const stored = await adapter.loadOutputs();
    // Simulate a damaged browser-origin record. Replace the adapter with an
    // adversarial read adapter; its original store remains independently intact.
    configureBatchCustodyAdapter({
      ...adapter,
      async loadOutputs() {
        return stored.map((row) => row.id === ids[1]
          ? { ...row, bytes: new Uint8Array([37, 80, 68, 70, 45, 88]) }
          : row);
      },
    });
    await expect(useMacroOutputQueueStore.getState().hydrateBatchCustody())
      .rejects.toThrow(/RECOVERY_OUTPUT_HASH_MISMATCH/);
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(0);
    expect(useMacroOutputQueueStore.getState().batchCustodyStatus).toBe('blocked');
    expect(await adapter.loadOutputs()).toHaveLength(2);
    configureBatchCustodyAdapter(adapter);
    await useMacroOutputQueueStore.getState().hydrateBatchCustody();
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(2);
  });

  it('never publishes output bytes if storage rejects the whole group', async () => {
    configureBatchCustodyAdapter({
      ...adapter,
      async stageGroup() { throw new Error('QuotaExceededError: no capacity'); },
    });
    await expect(useMacroOutputQueueStore.getState().enqueueBatchOutputs(await outputGroup()))
      .rejects.toThrow(/QuotaExceededError/);
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(0);
    expect(useMacroOutputQueueStore.getState().batchCustodyStatus).toBe('blocked');
  });

  it('a failed durable receipt delete retains the PDF until a later successful retry', async () => {
    const files = await outputGroup();
    const ids = await useMacroOutputQueueStore.getState().enqueueBatchOutputs(files);
    configureBatchCustodyAdapter({
      ...adapter,
      async acknowledge() { throw new Error('IndexedDB delete denied'); },
    });
    await useMacroOutputQueueStore.getState().hydrateBatchCustody();
    await expect(useMacroOutputQueueStore.getState().acknowledgeBatchOutput(ids[0]))
      .rejects.toThrow(/delete denied/);
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(2);
    configureBatchCustodyAdapter(adapter);
    await useMacroOutputQueueStore.getState().hydrateBatchCustody();
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(2);
    await useMacroOutputQueueStore.getState().acknowledgeBatchOutput(ids[0]);
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(1);
  });

  it('legacy memory-only set/clear cannot silently discard durable batch PDFs', async () => {
    await useMacroOutputQueueStore.getState().enqueueBatchOutputs(await outputGroup());
    useMacroOutputQueueStore.getState().setOutputs([]);
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(2);
    useMacroOutputQueueStore.getState().clearOutputs();
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(2);
    await useMacroOutputQueueStore.getState().clearAllOutputs();
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(0);
    expect(await adapter.loadOutputs()).toHaveLength(0);
  });
});
