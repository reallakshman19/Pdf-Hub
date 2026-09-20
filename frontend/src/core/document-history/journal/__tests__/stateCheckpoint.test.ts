import { describe, expect, it } from 'vitest';

import type { PdfAnnotation } from '@/core/annotations/types';
import type {
  HistoryState,
  WriterHistoryState,
} from '../../types';
import {
  assertHistoryStateCheckpointPayload,
  cloneHistoryStateCheckpointPayload,
  createHistoryStateCheckpointPayload,
  type HistoryStateCheckpointPayloadV1,
} from '../stateCheckpoint';

function annotation(
  data: Record<string, unknown> = {},
): PdfAnnotation {
  return {
    id: 'annotation-1',
    type: 'stamp',
    pageNumber: 1,
    pageId: 'page-1',
    rect: {
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    },
    data,
    createdAt: 1,
    updatedAt: 2,
  };
}

function writer(
  overrides: Partial<WriterHistoryState> = {},
): WriterHistoryState {
  return {
    documentMode: 'pdfOverlay',
    elements: [{
      id: 'writer-1',
      documentFingerprint: 'sha256:fixture',
      pageIndex: 0,
      pageId: 'page-1',
      type: 'imageBox',
      rect: {
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      },
      imageAssetId: 'asset-1',
      assetIds: ['asset-1'],
      plainText: 'Referenced image',
      style: {
        zIndex: 1,
      },
      createdAt: '2026-09-19T00:00:00.000Z',
      updatedAt: '2026-09-19T00:00:01.000Z',
      locked: false,
      hidden: false,
    }],
    selectedIds: ['writer-1'],
    activeId: 'writer-1',
    ...overrides,
  };
}

function historyState(
  overrides: Partial<HistoryState> = {},
): HistoryState {
  return {
    revision: {
      storeId: 'revisions',
      revisionId: 'sha256:fixture',
    },
    activeRevisionId: 'sha256:fixture',
    pageCount: 1,
    pageGraph: {
      pages: [{
        pageId: 'page-1',
        documentKey: 'sha256:fixture',
        originalPageNumber: 1,
        currentIndex: 0,
        width: 595,
        height: 842,
        rotation: 0,
      }],
    },
    documentKey: 'sha256:fixture',
    selectedPageIds: ['page-1'],
    selectedPages: [1],
    currentPageId: 'page-1',
    currentPage: 1,
    annotations: [annotation()],
    writer: writer(),
    ocr: {
      documentFingerprint: 'sha256:fixture',
      result: null,
      corrections: [],
      regions: [],
      selectedPageIndexes: [0],
      reviewFocus: null,
    },
    ...overrides,
  };
}

function legacyPayload(
  overrides: Partial<HistoryStateCheckpointPayloadV1> = {},
): HistoryStateCheckpointPayloadV1 {
  return {
    schemaVersion: 1,
    annotations: [annotation()],
    writer: writer(),
    ...overrides,
  };
}

describe('history state checkpoint payload', () => {
  it('creates recovery-complete v2 state without PDF or revision backing', () => {
    const payload = createHistoryStateCheckpointPayload(
      historyState(),
    );

    expect(payload).toMatchObject({
      schemaVersion: 2,
      pageCount: 1,
      documentKey: 'sha256:fixture',
      selectedPageIds: ['page-1'],
      selectedPages: [1],
      currentPageId: 'page-1',
      currentPage: 1,
      pageGraph: {
        pages: [{
          pageId: 'page-1',
        }],
      },
      writer: {
        elements: [{
          imageAssetId: 'asset-1',
          assetIds: ['asset-1'],
        }],
      },
      ocr: {
        documentFingerprint: 'sha256:fixture',
        selectedPageIndexes: [0],
      },
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('"bytes"');
    expect(serialized).not.toContain('"revision"');
    expect(serialized).not.toContain(
      '"activeRevisionId"',
    );
    expect(serialized).not.toContain('data:image');
  });

  it('keeps legacy v1 checkpoint payloads valid and cloneable', () => {
    const payload = legacyPayload();

    expect(() =>
      assertHistoryStateCheckpointPayload(payload),
    ).not.toThrow();

    const clone =
      cloneHistoryStateCheckpointPayload(payload);
    expect(clone).toMatchObject({
      schemaVersion: 1,
      annotations: [{ id: 'annotation-1' }],
      writer: {
        selectedIds: ['writer-1'],
      },
    });
  });

  it('rejects annotation stamp data URIs', () => {
    expect(() =>
      createHistoryStateCheckpointPayload(
        historyState({
          annotations: [annotation({
            stampImageDataUrl:
              'data:image/png;base64,AAAA',
          })],
        }),
      ),
    ).toThrow(/inline data URI/);
  });

  it('rejects generic data URIs without an explicit media type', () => {
    expect(() =>
      createHistoryStateCheckpointPayload(
        historyState({
          annotations: [annotation({
            content: 'data:,embedded',
          })],
        }),
      ),
    ).toThrow(/inline data URI/);
  });

  it('rejects data URIs buried inside Writer serialized editor state', () => {
    const state = writer();
    state.elements[0] = {
      ...state.elements[0]!,
      editorStateJson:
        '{"src":"data:image/png;base64,AAAA"}',
    };

    expect(() =>
      createHistoryStateCheckpointPayload(
        historyState({ writer: state }),
      ),
    ).toThrow(/inline data URI/);
  });

  it('rejects typed binary data, non-finite numbers and cycles', () => {
    const typedPayload = legacyPayload({
      annotations: [annotation({
        bytes: new Uint8Array([1, 2, 3]),
      })],
    });

    expect(() =>
      assertHistoryStateCheckpointPayload(
        typedPayload,
      ),
    ).toThrow(/binary typed data/);

    const nonFinitePayload =
      createHistoryStateCheckpointPayload(
        historyState(),
      );
    (
      nonFinitePayload.writer.elements[0]!
        .rect as { width: number }
    ).width = Number.POSITIVE_INFINITY;

    expect(() =>
      assertHistoryStateCheckpointPayload(
        nonFinitePayload,
      ),
    ).toThrow(/non-finite number/);

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const cyclicPayload = legacyPayload({
      annotations: [annotation({
        normalizedGeometry: cycle,
      })],
    });

    expect(() =>
      assertHistoryStateCheckpointPayload(
        cyclicPayload,
      ),
    ).toThrow(/cycle/);
  });

  it('rejects symbol-keyed structured state', () => {
    const symbolData: Record<string | symbol, unknown> = {};
    symbolData[Symbol('hidden')] = 'value';

    expect(() =>
      assertHistoryStateCheckpointPayload(
        legacyPayload({
          annotations: [annotation({
            normalizedGeometry: symbolData,
          })],
        }),
      ),
    ).toThrow(/symbol-keyed data/);
  });

  it('rejects non-plain object instances and unsupported values', () => {
    expect(() =>
      assertHistoryStateCheckpointPayload(
        legacyPayload({
          annotations: [annotation({
            normalizedGeometry: new Date(),
          })],
        }),
      ),
    ).toThrow(/non-plain object Date/);

    expect(() =>
      assertHistoryStateCheckpointPayload(
        legacyPayload({
          annotations: [annotation({
            callback: () => undefined,
          })],
        }),
      ),
    ).toThrow(/unsupported function/);
  });

  it('rejects embedded PDF/revision backing fields in v2 payloads', () => {
    const payload =
      createHistoryStateCheckpointPayload(
        historyState(),
      ) as unknown as Record<string, unknown>;
    payload.revision = {
      storeId: 'revisions',
      revisionId: 'sha256:fixture',
    };

    expect(() =>
      assertHistoryStateCheckpointPayload(
        payload as never,
      ),
    ).toThrow(/must not embed PDF\/revision backing field revision/);
  });

  it('normalizes optional undefined OCR object fields before validation', () => {
    const state = historyState();
    state.ocr = {
      ...state.ocr!,
      result: {
        documentFingerprint: 'sha256:fixture',
        createdAt: '2026-09-20T00:00:00.000Z',
        engineId: 'test',
        profileId: 'clean-scan',
        pages: [{
          status: 'success',
          pageId: 'page-1',
          pageIndex: 0,
          pageNumber: 1,
          width: 595,
          height: 842,
          words: undefined,
          lines: undefined,
          blocks: [],
          diagnostics: [],
        }],
        diagnostics: [],
      },
    };

    const payload =
      createHistoryStateCheckpointPayload(state);

    const page = payload.ocr.result?.pages[0];
    expect(page).toBeDefined();
    expect(
      Object.prototype.hasOwnProperty.call(
        page ?? {},
        'words',
      ),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        page ?? {},
        'lines',
      ),
    ).toBe(false);
  });

  it('clones without retaining mutable aliases', () => {
    const payload = createHistoryStateCheckpointPayload(
      historyState(),
    );

    const clone =
      cloneHistoryStateCheckpointPayload(payload);
    if (clone.schemaVersion !== 2) {
      throw new Error('Expected v2 clone');
    }
    clone.annotations[0]!.rect.x = 999;
    clone.writer.elements[0]!.assetIds?.push(
      'asset-2',
    );
    clone.pageGraph!.pages[0]!.rotation = 90;
    clone.ocr.selectedPageIndexes.push(1);

    expect(payload.annotations[0]!.rect.x).toBe(10);
    expect(
      payload.writer.elements[0]!.assetIds,
    ).toEqual(['asset-1']);
    expect(payload.pageGraph!.pages[0]!.rotation).toBe(0);
    expect(payload.ocr.selectedPageIndexes).toEqual([0]);
  });
});
