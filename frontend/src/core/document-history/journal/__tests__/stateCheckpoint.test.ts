import { describe, expect, it } from 'vitest';

import type { PdfAnnotation } from '@/core/annotations/types';
import type { WriterHistoryState } from '../../types';
import {
  assertHistoryStateCheckpointPayload,
  cloneHistoryStateCheckpointPayload,
  createHistoryStateCheckpointPayload,
} from '../stateCheckpoint';

function annotation(
  data: Record<string, unknown> = {},
): PdfAnnotation {
  return {
    id: 'annotation-1',
    type: 'stamp',
    pageNumber: 1,
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

describe('history state checkpoint payload', () => {
  it('accepts clone-safe annotations and Writer asset references', () => {
    const payload = createHistoryStateCheckpointPayload({
      annotations: [annotation({
        stampLabel: 'APPROVED',
        review: {
          status: 'open',
        },
      })],
      writer: writer(),
    });

    expect(payload).toMatchObject({
      schemaVersion: 1,
      writer: {
        elements: [{
          imageAssetId: 'asset-1',
          assetIds: ['asset-1'],
        }],
      },
    });
    expect(JSON.stringify(payload)).not.toContain(
      'data:image',
    );
  });

  it('rejects annotation stamp data URIs', () => {
    expect(() =>
      createHistoryStateCheckpointPayload({
        annotations: [annotation({
          stampImageDataUrl:
            'data:image/png;base64,AAAA',
        })],
        writer: writer(),
      }),
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
      createHistoryStateCheckpointPayload({
        annotations: [],
        writer: state,
      }),
    ).toThrow(/inline data URI/);
  });

  it('rejects typed binary data, non-finite numbers and cycles', () => {
    const typedPayload = {
      schemaVersion: 1,
      annotations: [annotation({
        bytes: new Uint8Array([1, 2, 3]),
      })],
      writer: writer(),
    };

    expect(() =>
      assertHistoryStateCheckpointPayload(
        typedPayload as never,
      ),
    ).toThrow(/binary typed data/);

    const nonFinitePayload =
      createHistoryStateCheckpointPayload({
        annotations: [],
        writer: writer(),
      });
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
    const cyclicPayload = {
      schemaVersion: 1,
      annotations: [annotation({
        normalizedGeometry: cycle,
      })],
      writer: writer(),
    };

    expect(() =>
      assertHistoryStateCheckpointPayload(
        cyclicPayload as never,
      ),
    ).toThrow(/cycle/);
  });

  it('rejects non-plain object instances and unsupported values', () => {
    const datePayload = {
      schemaVersion: 1,
      annotations: [annotation({
        normalizedGeometry: new Date(),
      })],
      writer: writer(),
    };
    expect(() =>
      assertHistoryStateCheckpointPayload(
        datePayload as never,
      ),
    ).toThrow(/non-plain object Date/);

    const functionPayload = {
      schemaVersion: 1,
      annotations: [annotation({
        callback: () => undefined,
      })],
      writer: writer(),
    };
    expect(() =>
      assertHistoryStateCheckpointPayload(
        functionPayload as never,
      ),
    ).toThrow(/unsupported function/);
  });

  it('clones without retaining mutable aliases', () => {
    const payload = createHistoryStateCheckpointPayload({
      annotations: [annotation()],
      writer: writer(),
    });

    const clone =
      cloneHistoryStateCheckpointPayload(payload);
    clone.annotations[0]!.rect.x = 999;
    clone.writer.elements[0]!.assetIds?.push(
      'asset-2',
    );

    expect(payload.annotations[0]!.rect.x).toBe(10);
    expect(
      payload.writer.elements[0]!.assetIds,
    ).toEqual(['asset-1']);
  });
});
