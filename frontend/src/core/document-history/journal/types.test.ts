import { describe, expect, it } from 'vitest';

import {
  assertHistoryJournalManifest,
  cloneHistoryJournalManifest,
  createInitialHistoryJournalManifest,
  resolveHistoryJournalActiveTransactionId,
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
      activeTransactionId: null,
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

  it('infers the cursor for legacy manifests and validates explicit cursor consistency', () => {
    const manifest = createInitialHistoryJournalManifest({
      journalId: 'history-cursor',
      revisionStoreId: 'revisions',
      revisionId: 'sha256:one',
      fileName: 'fixture.pdf',
    });

    manifest.entries.push({
      entryId: 'history-cursor:entry:tx-1',
      transactionId: 'tx-1',
      command: {
        type: 'ROTATE_PAGES',
        payload: {
          pageIndices: [0],
          angle: 90,
        },
        source: 'toolbar',
        documentKey: 'sha256:one',
        id: 'command-1',
        createdAt: '2026-09-19T00:00:00.000Z',
      },
      disposition: 'SELF_CONTAINED_REPLAY',
      barriers: [],
      beforeRevision: {
        storeId: 'revisions',
        revisionId: 'sha256:one',
      },
      afterRevision: {
        storeId: 'revisions',
        revisionId: 'sha256:two',
      },
      createdAt: '2026-09-19T00:00:01.000Z',
    });
    manifest.activeRevisionId = 'sha256:two';
    delete manifest.activeTransactionId;

    expect(
      resolveHistoryJournalActiveTransactionId(
        manifest,
      ),
    ).toBe('tx-1');

    manifest.activeTransactionId = 'tx-1';
    expect(() =>
      assertHistoryJournalManifest(manifest),
    ).not.toThrow();

    manifest.activeRevisionId = 'sha256:other';
    expect(() =>
      assertHistoryJournalManifest(manifest),
    ).toThrow(/active transaction does not match active revision/);
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

  it('validates state checkpoint payloads embedded in manifests', () => {
    const manifest = createInitialHistoryJournalManifest({
      journalId: 'history-state',
      revisionStoreId: 'revisions',
      revisionId: 'sha256:initial',
      fileName: 'fixture.pdf',
    });

    manifest.checkpoints.push({
      checkpointId: 'history-state:barrier:tx-1',
      kind: 'BARRIER',
      revision: {
        storeId: 'revisions',
        revisionId: 'sha256:initial',
      },
      createdAt: '2026-09-19T00:00:01.000Z',
      transactionId: 'tx-1',
      statePayload: {
        schemaVersion: 1,
        annotations: [],
        writer: {
          documentMode: 'pdfOverlay',
          elements: [],
          selectedIds: [],
          activeId: null,
        },
      },
    });

    expect(() =>
      assertHistoryJournalManifest(manifest),
    ).not.toThrow();

    manifest.checkpoints[1]!.statePayload!.annotations =
      [{
        id: 'stamp-1',
        type: 'stamp',
        pageNumber: 1,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        data: {
          stampImageDataUrl:
            'data:image/png;base64,AAAA',
        },
        createdAt: 1,
        updatedAt: 1,
      }];

    expect(() =>
      assertHistoryJournalManifest(manifest),
    ).toThrow(/inline data URI/);
  });

  it('validates recovery-complete v2 payloads embedded in barrier checkpoints', () => {
    const manifest = createInitialHistoryJournalManifest({
      journalId: 'history-recovery-state',
      revisionStoreId: 'revisions',
      revisionId: 'sha256:initial',
      fileName: 'fixture.pdf',
    });

    manifest.checkpoints.push({
      checkpointId: 'history-recovery-state:barrier:tx-1',
      kind: 'BARRIER',
      revision: {
        storeId: 'revisions',
        revisionId: 'sha256:next',
      },
      createdAt: '2026-09-20T00:00:01.000Z',
      transactionId: 'tx-1',
      statePayload: {
        schemaVersion: 2,
        pageCount: 1,
        pageGraph: {
          pages: [{
            pageId: 'page-1',
            documentKey: 'sha256:next',
            originalPageNumber: 1,
            currentIndex: 0,
            width: 595,
            height: 842,
            rotation: 0,
          }],
        },
        documentKey: 'sha256:next',
        selectedPageIds: ['page-1'],
        selectedPages: [1],
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
          documentFingerprint: 'sha256:next',
          result: null,
          corrections: [],
          regions: [],
          selectedPageIndexes: [0],
          reviewFocus: null,
        },
      },
    });

    expect(() =>
      assertHistoryJournalManifest(manifest),
    ).not.toThrow();
  });

  it('forbids state payloads on admission checkpoints', () => {
    const manifest = createInitialHistoryJournalManifest({
      journalId: 'history-admission-state',
      revisionStoreId: 'revisions',
      revisionId: 'sha256:initial',
      fileName: 'fixture.pdf',
    });

    manifest.checkpoints[0]!.statePayload = {
      schemaVersion: 1,
      annotations: [],
      writer: {
        documentMode: 'pdfOverlay',
        elements: [],
        selectedIds: [],
        activeId: null,
      },
    };

    expect(() =>
      assertHistoryJournalManifest(manifest),
    ).toThrow(/Admission checkpoints cannot contain statePayload/);
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