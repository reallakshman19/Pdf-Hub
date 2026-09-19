import { describe, expect, it } from 'vitest';

import {
  assertHistoryJournalManifest,
  cloneHistoryJournalManifest,
  createInitialHistoryJournalManifest,
} from '../types';

describe('history journal manifest', () => {
  it('creates an admission checkpoint without embedding PDF bytes', () => {
    const manifest = createInitialHistoryJournalManifest({
      journalId: 'history-1',
      revisionStoreId: 'revisions',
      revisionId: 'sha256:initial',
      fileName: 'fixture.pdf',
      createdAt: '2026-09-19T00:00:00.000Z',
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      journalId: 'history-1',
      revisionStoreId: 'revisions',
      originalRevisionId: 'sha256:initial',
      activeRevisionId: 'sha256:initial',
      checkpoints: [{
        checkpointId: 'history-1:admission',
        kind: 'ADMISSION',
        revision: {
          storeId: 'revisions',
          revisionId: 'sha256:initial',
        },
      }],
      entries: [],
    });
    expect(JSON.stringify(manifest)).not.toContain(
      '"bytes"',
    );
  });

  it('rejects revision references from a different revision store', () => {
    const manifest = createInitialHistoryJournalManifest({
      journalId: 'history-2',
      revisionStoreId: 'revisions-a',
      revisionId: 'sha256:initial',
      fileName: 'fixture.pdf',
    });

    manifest.checkpoints[0]!.revision.storeId =
      'revisions-b';

    expect(() =>
      assertHistoryJournalManifest(manifest),
    ).toThrow(/does not match manifest store/);
  });

  it('clones manifests without retaining mutable aliases', () => {
    const manifest = createInitialHistoryJournalManifest({
      journalId: 'history-3',
      revisionStoreId: 'revisions',
      revisionId: 'sha256:initial',
      fileName: 'fixture.pdf',
    });

    const clone = cloneHistoryJournalManifest(manifest);
    clone.checkpoints[0]!.revision.revisionId =
      'sha256:changed';

    expect(
      manifest.checkpoints[0]!.revision.revisionId,
    ).toBe('sha256:initial');
  });
});
