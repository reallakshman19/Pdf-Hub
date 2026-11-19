import { beforeEach, describe, expect, it } from 'vitest';
import { useMacroOutputQueueStore } from './outputQueueStore';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import type { BatchOutputArtifact } from './batchRunner';

async function batchGroup(): Promise<BatchOutputArtifact[]> {
  const primary = new Uint8Array([37, 80, 68, 70, 45, 49]);
  const aux1 = new Uint8Array([37, 80, 68, 70, 45, 50]);
  const aux2 = new Uint8Array([37, 80, 68, 70, 45, 51]);
  const bytes = [primary, aux1, aux2];
  return Promise.all(bytes.map(async (pdf, i) => ({
    inputIndex: 2,
    fileName: 'repeat.pdf',
    inputPageCount: 1,
    sourceSha256: 'sha256:' + 'a'.repeat(64),
    recipeId: 'batch-extract-current',
    recipeSha256: 'sha256:' + 'b'.repeat(64),
    batchRunId: 'run-prove',
    outputIndex: i,
    outputKind: i === 0 ? 'working-copy' as const : 'auxiliary' as const,
    ...(i === 0 ? {} : { originalOutputName: '../repeat.pdf' }),
    outputName: `003-repeat-${i}.pdf`,
    outputSha256: await FileAdapter.hashBytes(pdf),
    bytes: pdf,
  })));
}

describe('WP07 pending PDF output custody', () => {
  beforeEach(() => useMacroOutputQueueStore.getState().clearOutputs());

  it('preserves duplicate filenames as distinct output occurrences', () => {
    const source = new Uint8Array([1, 2]);
    const other = new Uint8Array([3, 4]);
    const ids = useMacroOutputQueueStore.getState().enqueueOutputs(
      [
        { name: 'evidence.pdf', bytes: source },
        { name: 'evidence.pdf', bytes: other },
      ],
      { sourceKind: 'macro', sourceDocumentKey: 'doc-a', sourceRecipeId: 'recipe-b' },
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const pending = useMacroOutputQueueStore.getState().outputs;
    expect(pending.map((p) => p.name)).toEqual(['evidence.pdf', 'evidence.pdf']);
    expect(pending.map((p) => Array.from(p.bytes))).toEqual([[1, 2], [3, 4]]);
    expect(pending[0].sourceRecipeId).toBe('recipe-b');
  });

  it('retains concurrently added C when A is removed by an async updater', () => {
    const [id] = useMacroOutputQueueStore.getState().enqueueOutputs([
      { name: 'A.pdf', bytes: new Uint8Array([1]) },
      { name: 'B.pdf', bytes: new Uint8Array([2]) },
    ]);
    useMacroOutputQueueStore.getState().enqueueOutputs([
      { name: 'C.pdf', bytes: new Uint8Array([3]) },
    ]);
    useMacroOutputQueueStore.getState().setOutputs(
      (items) => items.filter((item) => item.id !== id),
    );
    expect(useMacroOutputQueueStore.getState().outputs.map((p) => p.name)).toEqual(['B.pdf', 'C.pdf']);
  });

  it('does not discard pending PDFs across component-style queue selectors', () => {
    useMacroOutputQueueStore.getState().enqueueOutputs([{ name: 'A.pdf', bytes: new Uint8Array([9]) }]);
    const firstConsumer = useMacroOutputQueueStore.getState().outputs;
    expect(firstConsumer).toHaveLength(1);
    const otherConsumer = useMacroOutputQueueStore.getState().outputs;
    expect(otherConsumer).toHaveLength(1);
    useMacroOutputQueueStore.getState().clearOutputs();
    expect(useMacroOutputQueueStore.getState().outputs).toEqual([]);
  });
  it('atomically enqueues primary and all auxiliary PDFs with distinct source/output identity', async () => {
    const files = await batchGroup();
    const ids = await useMacroOutputQueueStore.getState().enqueueBatchOutputs(files);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    const queued = useMacroOutputQueueStore.getState().outputs;
    expect(queued.map((o) => o.sourceOutputIndex)).toEqual([0, 1, 2]);
    expect(queued.map((o) => o.sourceOutputKind)).toEqual([
      'working-copy', 'auxiliary', 'auxiliary',
    ]);
    expect(queued.map((o) => o.sourceInputIndex)).toEqual([2, 2, 2]);
    expect(queued.map((o) => o.name)).toEqual([
      '003-repeat-0.pdf', '003-repeat-1.pdf', '003-repeat-2.pdf',
    ]);
    expect(queued.map((o) => o.outputSha256)).toEqual(files.map((o) => o.outputSha256));
    files[2].bytes[0] = 1;
    expect(queued[2].bytes[0]).toBe(37);
  });

  it('rejects a forged second auxiliary digest without adding any PDF from that source', async () => {
    const files = await batchGroup();
    files[2] = { ...files[2], outputSha256: 'sha256:' + 'f'.repeat(64) };
    await expect(useMacroOutputQueueStore.getState().enqueueBatchOutputs(files))
      .rejects.toThrow(/SHA-256 mismatch for output #2/);
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(0);
  });

  it('rejects missing ordinals, mixed source identities, repeated names and repeated handoff', async () => {
    const files = await batchGroup();
    await expect(useMacroOutputQueueStore.getState().enqueueBatchOutputs([
      files[0], { ...files[1], outputIndex: 2 },
    ])).rejects.toThrow(/inconsistent provenance/);
    await expect(useMacroOutputQueueStore.getState().enqueueBatchOutputs([
      files[0], { ...files[1], sourceSha256: 'sha256:' + 'c'.repeat(64) },
    ])).rejects.toThrow(/inconsistent provenance/);
    await expect(useMacroOutputQueueStore.getState().enqueueBatchOutputs([
      files[0], { ...files[1], outputName: files[0].outputName },
    ])).rejects.toThrow(/inconsistent provenance/);
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(0);
    await useMacroOutputQueueStore.getState().enqueueBatchOutputs(files);
    await expect(useMacroOutputQueueStore.getState().enqueueBatchOutputs(files))
      .rejects.toThrow(/already staged/);
    expect(useMacroOutputQueueStore.getState().outputs).toHaveLength(3);
  });

});
