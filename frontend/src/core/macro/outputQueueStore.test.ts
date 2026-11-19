import { beforeEach, describe, expect, it } from 'vitest';
import { useMacroOutputQueueStore } from './outputQueueStore';

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
});
