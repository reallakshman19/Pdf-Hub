import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { MemorySource } from '@/adapters/document-source/MemorySource';
import { MemoryRevisionStore } from '@/adapters/revision-store/MemoryRevisionStore';
import {
  clearWorkingRevisionStoreRegistryForTests,
  registerWorkingRevisionStore,
} from '@/core/revision-store/registry';
import type {
  HistoryRecoveryPlan,
} from '../recoveryPlanner';
import {
  HistoryRecoveryResolutionError,
  resolveHistoryRecoveryPlan,
} from '../recoveryResolver';

const STORE_ID = 'recovery-store';
const REVISION_ID = 'sha256:recovery';

function plan(): HistoryRecoveryPlan {
  return {
    journalId: 'history-1',
    fileName: 'fixture.pdf',
    originalRevisionId: 'sha256:origin',
    checkpointId: 'history-1:barrier:tx-1',
    checkpointTransactionId: 'tx-1',
    activeTransactionId: 'tx-1',
    revision: {
      storeId: STORE_ID,
      revisionId: REVISION_ID,
    },
    state: {
      schemaVersion: 2,
      pageCount: 1,
      pageGraph: {
        pages: [{
          pageId: 'page-1',
          documentKey: REVISION_ID,
          originalPageNumber: 1,
          currentIndex: 0,
          width: 595,
          height: 842,
          rotation: 0,
        }],
      },
      documentKey: REVISION_ID,
      selectedPageIds: [],
      selectedPages: [],
      currentPageId: 'page-1',
      currentPage: 1,
      annotations: [],
      writer: {
        documentMode: 'pdfOverlay',
        elements: [],
        selectedIds: [],
        activeId: null,
      },
      ocr: {
        documentFingerprint: null,
        result: null,
        corrections: [],
        regions: [],
        selectedPageIndexes: [],
        reviewFocus: null,
      },
    },
    replayEntries: [],
  };
}

describe('resolveHistoryRecoveryPlan', () => {
  beforeEach(() => {
    clearWorkingRevisionStoreRegistryForTests();
  });

  it('materializes exactly the checkpoint revision before restore execution', async () => {
    const store = new MemoryRevisionStore({
      id: STORE_ID,
    });
    registerWorkingRevisionStore(store);

    const bytes = new Uint8Array([
      0x25, 0x50, 0x44, 0x46,
      0x2d, 0x31, 0x2e, 0x37,
    ]);
    await store.commit({
      revisionId: 'sha256:origin',
      source: new MemorySource({
        id: 'origin-source',
        bytes,
      }),
    });
    await store.commit({
      revisionId: REVISION_ID,
      source: new MemorySource({
        id: 'recovery-source',
        bytes,
      }),
    });

    const resolved =
      await resolveHistoryRecoveryPlan(
        plan(),
      );

    expect(
      resolved.checkpointBytes,
    ).toEqual(bytes);
    expect(
      resolved.plan.revision.revisionId,
    ).toBe(REVISION_ID);
  });

  it('fails closed when the revision store is not registered', async () => {
    await expect(
      resolveHistoryRecoveryPlan(plan()),
    ).rejects.toMatchObject({
      name: 'HistoryRecoveryResolutionError',
      code: 'REVISION_STORE_UNAVAILABLE',
    } satisfies Partial<HistoryRecoveryResolutionError>);
  });

  it('fails closed when a replay suffix revision is missing', async () => {
    const store = new MemoryRevisionStore({
      id: STORE_ID,
    });
    registerWorkingRevisionStore(store);

    const bytes = new Uint8Array([1, 2, 3]);
    await store.commit({
      revisionId: 'sha256:origin',
      source: new MemorySource({
        id: 'origin-source',
        bytes,
      }),
    });
    await store.commit({
      revisionId: REVISION_ID,
      source: new MemorySource({
        id: 'checkpoint-source',
        bytes,
      }),
    });

    const recoveryPlan = plan();
    recoveryPlan.activeTransactionId = 'tx-replay';
    recoveryPlan.replayEntries = [{
      entryId: 'history-1:entry:tx-replay',
      transactionId: 'tx-replay',
      command: {
        id: 'rotate-command',
        type: 'ROTATE_PAGES',
        source: 'system',
        risk: 'safe',
        createdAt: '2026-09-20T08:00:00.000Z',
        documentKey: REVISION_ID,
        payload: {
          pageIndices: [0],
          angle: 90,
        },
      },
      disposition: 'SELF_CONTAINED_REPLAY',
      barriers: [],
      beforeRevision: {
        storeId: STORE_ID,
        revisionId: REVISION_ID,
      },
      afterRevision: {
        storeId: STORE_ID,
        revisionId: 'sha256:missing-after',
      },
      createdAt: '2026-09-20T08:00:01.000Z',
    }];

    await expect(
      resolveHistoryRecoveryPlan(recoveryPlan),
    ).rejects.toMatchObject({
      name: 'HistoryRecoveryResolutionError',
      code: 'REVISION_MISSING',
    } satisfies Partial<HistoryRecoveryResolutionError>);
  });

  it('fails closed when the replay revision chain is discontinuous', async () => {
    const store = new MemoryRevisionStore({
      id: STORE_ID,
    });
    registerWorkingRevisionStore(store);

    const bytes = new Uint8Array([1, 2, 3]);
    await store.commit({
      revisionId: 'sha256:origin',
      source: new MemorySource({
        id: 'origin-source',
        bytes,
      }),
    });
    await store.commit({
      revisionId: REVISION_ID,
      source: new MemorySource({
        id: 'checkpoint-source',
        bytes,
      }),
    });

    const recoveryPlan = plan();
    recoveryPlan.activeTransactionId = 'tx-replay';
    recoveryPlan.replayEntries = [{
      entryId: 'history-1:entry:tx-replay',
      transactionId: 'tx-replay',
      command: {
        id: 'rotate-command',
        type: 'ROTATE_PAGES',
        source: 'system',
        risk: 'safe',
        createdAt: '2026-09-20T08:00:00.000Z',
        documentKey: 'sha256:wrong-before',
        payload: {
          pageIndices: [0],
          angle: 90,
        },
      },
      disposition: 'SELF_CONTAINED_REPLAY',
      barriers: [],
      beforeRevision: {
        storeId: STORE_ID,
        revisionId: 'sha256:wrong-before',
      },
      afterRevision: {
        storeId: STORE_ID,
        revisionId: 'sha256:any',
      },
      createdAt: '2026-09-20T08:00:01.000Z',
    }];

    await expect(
      resolveHistoryRecoveryPlan(recoveryPlan),
    ).rejects.toMatchObject({
      name: 'HistoryRecoveryResolutionError',
      code: 'REVISION_CHAIN_INVALID',
    } satisfies Partial<HistoryRecoveryResolutionError>);
  });

  it('fails closed when the checkpoint revision is missing', async () => {
    const store = new MemoryRevisionStore({
      id: STORE_ID,
    });
    registerWorkingRevisionStore(store);

    await expect(
      resolveHistoryRecoveryPlan(plan()),
    ).rejects.toMatchObject({
      name: 'HistoryRecoveryResolutionError',
      code: 'REVISION_MISSING',
    } satisfies Partial<HistoryRecoveryResolutionError>);
  });
});
