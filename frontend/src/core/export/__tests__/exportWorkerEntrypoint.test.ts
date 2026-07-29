import {
  describe,
  expect,
  it,
} from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type {
  ExportWorkerResponse,
} from '../exportWorkerTypes';
import {
  createExportWorkerMessageHandler,
} from '../exportWorkerEntrypoint';
import type { WriterElementV2 } from '../../writer-v2/types';

async function blankPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

function textElement(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-export-worker',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 72, y: 700, width: 200, height: 40 },
    plainText: 'Hello export worker',
    style: { zIndex: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

describe('exportWorkerEntrypoint', () => {
  it('responds to PING with PONG', async () => {
    const posted: ExportWorkerResponse[] = [];

    const handler = createExportWorkerMessageHandler({
      workerVersion: 'test-export-worker',
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler({
      requestId: 'req-1',
      type: 'PING',
    });

    expect(posted).toEqual([
      {
        requestId: 'req-1',
        type: 'PONG',
        payload: {
          ok: true,
          workerVersion: 'test-export-worker',
        },
      },
    ]);
  });

  it('flattens a Writer PDF and posts FLATTEN_RESULT', async () => {
    const posted: ExportWorkerResponse[] = [];
    const pdfBytes = await blankPdfBytes();

    const handler = createExportWorkerMessageHandler({
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler({
      requestId: 'req-flatten',
      type: 'FLATTEN_PDF',
      payload: {
        pdfBytes,
        elements: [textElement('el-1')],
      },
    });

    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe('FLATTEN_RESULT');

    const result = posted[0] as Extract<ExportWorkerResponse, { type: 'FLATTEN_RESULT' }>;
    expect(result.payload.result.pageCount).toBe(1);
    expect(result.payload.result.flattenedElementCount).toBe(1);
    expect(result.payload.result.bytes.length).toBeGreaterThan(0);
  });

  it('packs a project ZIP and posts PACK_RESULT', async () => {
    const posted: ExportWorkerResponse[] = [];
    const pdfBytes = await blankPdfBytes();

    const handler = createExportWorkerMessageHandler({
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler({
      requestId: 'req-pack',
      type: 'PACK_PROJECT_ZIP',
      payload: {
        originalPdfBytes: pdfBytes,
        documentFingerprint: 'doc-export-worker',
        elements: [textElement('el-1')],
      },
    });

    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe('PACK_RESULT');

    const result = posted[0] as Extract<ExportWorkerResponse, { type: 'PACK_RESULT' }>;
    expect(result.payload.result.elementCount).toBe(1);
    expect(result.payload.result.bytes.length).toBeGreaterThan(0);
  });

  it('round-trips PACK_PROJECT_ZIP then UNPACK_PROJECT_ZIP', async () => {
    const posted: ExportWorkerResponse[] = [];
    const pdfBytes = await blankPdfBytes();

    const handler = createExportWorkerMessageHandler({
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler({
      requestId: 'req-pack',
      type: 'PACK_PROJECT_ZIP',
      payload: {
        originalPdfBytes: pdfBytes,
        documentFingerprint: 'doc-export-worker',
        elements: [textElement('el-1')],
      },
    });

    const packResult = posted[0] as Extract<ExportWorkerResponse, { type: 'PACK_RESULT' }>;

    await handler({
      requestId: 'req-unpack',
      type: 'UNPACK_PROJECT_ZIP',
      payload: {
        projectBytes: packResult.payload.result.bytes,
      },
    });

    expect(posted).toHaveLength(2);
    expect(posted[1].type).toBe('UNPACK_RESULT');

    const unpackResult = posted[1] as Extract<ExportWorkerResponse, { type: 'UNPACK_RESULT' }>;
    expect(unpackResult.payload.result.elements).toHaveLength(1);
    expect(unpackResult.payload.result.elements[0].id).toBe('el-1');
  });

  it('handles CANCEL_REQUEST for an active request', async () => {
    const posted: ExportWorkerResponse[] = [];
    const state = {
      activeRequests: new Map<string, AbortController>(),
    };

    const controller = new AbortController();
    state.activeRequests.set('req-active', controller);

    const handler = createExportWorkerMessageHandler({
      state,
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler({
      requestId: 'cancel-1',
      type: 'CANCEL_REQUEST',
      targetRequestId: 'req-active',
    });

    expect(controller.signal.aborted).toBe(true);
    expect(state.activeRequests.has('req-active')).toBe(false);
    expect(posted[0]).toEqual({
      requestId: 'req-active',
      type: 'REQUEST_CANCELLED',
      payload: {
        reason: 'Export worker request cancelled.',
      },
    });
  });

  it('returns ERROR when flattening fails', async () => {
    const posted: ExportWorkerResponse[] = [];

    const handler = createExportWorkerMessageHandler({
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler({
      requestId: 'req-bad',
      type: 'FLATTEN_PDF',
      payload: {
        pdfBytes: new Uint8Array([0, 1, 2, 3]),
        elements: [],
      },
    });

    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe('ERROR');

    const error = posted[0] as Extract<ExportWorkerResponse, { type: 'ERROR' }>;
    expect(error.payload.code).toBe('EXPORT_WORKER_REQUEST_FAILED');
  });

  it('flattens a 50-page document with one element per page (proxy for the large-document manual check)', async () => {
    const posted: ExportWorkerResponse[] = [];
    const doc = await PDFDocument.create();
    for (let i = 0; i < 50; i += 1) {
      doc.addPage([612, 792]);
    }
    const pdfBytes = await doc.save();

    const elements = Array.from({ length: 50 }, (_, pageIndex) => ({
      ...textElement(`el-${pageIndex}`),
      pageIndex,
    }));

    const handler = createExportWorkerMessageHandler({
      postMessage: (response) => {
        posted.push(response);
      },
    });

    const startedAt = Date.now();
    await handler({
      requestId: 'req-large',
      type: 'FLATTEN_PDF',
      payload: { pdfBytes, elements },
    });
    const elapsedMs = Date.now() - startedAt;

    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe('FLATTEN_RESULT');

    const result = posted[0] as Extract<ExportWorkerResponse, { type: 'FLATTEN_RESULT' }>;
    expect(result.payload.result.pageCount).toBe(50);
    expect(result.payload.result.flattenedElementCount).toBe(50);
    // Not a timing assertion on worker overhead (this runs on the main thread
    // in-process under vitest) — just confirms the handler completes and
    // doesn't hang on a realistically large document. Real main-thread
    // responsiveness during a live 50-page export is the manual check this
    // card's exit criteria separately calls for.
    expect(elapsedMs).toBeLessThan(30_000);
  });

  it('returns ERROR for an unsupported request type', async () => {
    const posted: ExportWorkerResponse[] = [];

    const handler = createExportWorkerMessageHandler({
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler({
      requestId: 'req-unknown',
      type: 'UNKNOWN_TYPE' as never,
    });

    expect(posted).toHaveLength(1);
    expect(posted[0].type).toBe('ERROR');

    const error = posted[0] as Extract<ExportWorkerResponse, { type: 'ERROR' }>;
    expect(error.payload.code).toBe('UNSUPPORTED_EXPORT_WORKER_REQUEST');
  });
});
