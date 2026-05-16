import { describe, it, expect } from 'vitest';
import { useHistoryStore } from '../store';
import { applyUndo, applyRedo } from '../transactions';
import { useSessionStore } from '../../session/store';

describe('Document History', () => {
  it('should push, undo, and redo transactions', () => {
    const store = useHistoryStore.getState();
    store.clear();

    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);

    store.push({
      id: '1',
      command: { type: 'ROTATE_PAGES', pageIndices: [0], angle: 90 },
      source: 'toolbar',
      label: 'Rotate page',
      timestamp: 0,
      before: { bytes: new Uint8Array([0]), pageCount: 1 },
      after: { bytes: new Uint8Array([1]), pageCount: 1 },
    });

    expect(useHistoryStore.getState().canUndo()).toBe(true);

    const undoTx = store.undo();
    expect(undoTx?.id).toBe('1');
    expect(useHistoryStore.getState().canUndo()).toBe(false);
    expect(useHistoryStore.getState().canRedo()).toBe(true);

    const redoTx = store.redo();
    expect(redoTx?.id).toBe('1');
    expect(useHistoryStore.getState().canUndo()).toBe(true);
    expect(useHistoryStore.getState().canRedo()).toBe(false);
  });

  it('should apply undo/redo to session store', () => {
    useHistoryStore.getState().clear();
    useSessionStore.getState().openDocument({
      documentKey: 'test',
      fileName: 'test.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 1,
    });

    useHistoryStore.getState().push({
      id: '2',
      command: { type: 'ROTATE_PAGES', pageIndices: [0], angle: 90 },
      source: 'toolbar',
      label: 'Rotate page',
      timestamp: 0,
      before: { bytes: new Uint8Array([1, 2, 3]), pageCount: 1 },
      after: { bytes: new Uint8Array([4, 5, 6]), pageCount: 1 },
    });

    const undoApplied = applyUndo();
    expect(undoApplied).toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([1, 2, 3]));

    const redoApplied = applyRedo();
    expect(redoApplied).toBe(true);
    expect(useSessionStore.getState().workingBytes).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('returns false when undo/redo stacks are empty', () => {
    useHistoryStore.getState().clear();
    expect(applyUndo()).toBe(false);
    expect(applyRedo()).toBe(false);
  });

  it('supports peek helpers for undo/redo stacks', () => {
    useHistoryStore.getState().clear();
    useHistoryStore.getState().push({
      id: 'peek-1',
      command: { type: 'ROTATE_PAGES', pageIndices: [0], angle: 90 },
      source: 'toolbar',
      label: 'Rotate page',
      timestamp: 0,
      before: { bytes: new Uint8Array([1]), pageCount: 1 },
      after: { bytes: new Uint8Array([2]), pageCount: 1 },
    });

    expect(useHistoryStore.getState().peekUndo()?.id).toBe('peek-1');
    expect(useHistoryStore.getState().peekRedo()).toBeNull();
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().peekRedo()?.id).toBe('peek-1');
  });
});
