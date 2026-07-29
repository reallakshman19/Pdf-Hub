import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  ExportWorkerRequest,
  ExportWorkerResponse,
} from '../exportWorkerTypes';
import type {
  ExportWorkerLike,
} from '../exportWorkerClient';
import {
  ExportWorkerClient,
} from '../exportWorkerClient';
import type {
  FlattenWriterExportResult,
} from '../../writer-v2/export/flattenedPdfExport';
import type {
  ExportPdfHubProjectResult,
  ImportPdfHubProjectResult,
} from '../../writer-v2/export/projectZip';

describe('ExportWorkerClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends ping and receives pong', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.ping();

    expect(worker.messages[0]).toEqual({
      requestId: 'req-1',
      type: 'PING',
    });

    worker.emit({
      requestId: 'req-1',
      type: 'PONG',
      payload: {
        ok: true,
        workerVersion: 'test-export-worker',
      },
    });

    await expect(promise).resolves.toEqual({
      ok: true,
      workerVersion: 'test-export-worker',
    });

    expect(client.getPendingRequestCount()).toBe(0);

    client.dispose();
  });

  it('flattens a PDF and returns the result', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.flattenPdf({
      pdfBytes: new Uint8Array([1, 2, 3]),
      elements: [],
    });

    expect(worker.messages[0].type).toBe('FLATTEN_PDF');

    const result = makeFlattenResult();

    worker.emit({
      requestId: 'req-1',
      type: 'FLATTEN_RESULT',
      payload: { result },
    });

    await expect(promise).resolves.toBe(result);

    client.dispose();
  });

  it('packs a project ZIP and returns the result', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.packProjectZip({
      documentFingerprint: 'doc-1',
      elements: [],
    });

    expect(worker.messages[0].type).toBe('PACK_PROJECT_ZIP');

    const result = makePackResult();

    worker.emit({
      requestId: 'req-1',
      type: 'PACK_RESULT',
      payload: { result },
    });

    await expect(promise).resolves.toBe(result);

    client.dispose();
  });

  it('unpacks a project ZIP and returns the result', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.unpackProjectZip(new Uint8Array([1, 2, 3]));

    expect(worker.messages[0].type).toBe('UNPACK_PROJECT_ZIP');

    const result = makeUnpackResult();

    worker.emit({
      requestId: 'req-1',
      type: 'UNPACK_RESULT',
      payload: { result },
    });

    await expect(promise).resolves.toBe(result);

    client.dispose();
  });

  it('rejects with the worker-reported error message', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.flattenPdf({
      pdfBytes: new Uint8Array([1, 2, 3]),
      elements: [],
    });

    worker.emit({
      requestId: 'req-1',
      type: 'ERROR',
      payload: {
        message: 'flatten failed',
        code: 'EXPORT_WORKER_REQUEST_FAILED',
      },
    });

    await expect(promise).rejects.toThrow('flatten failed');

    client.dispose();
  });

  it('rejects all pending requests when the worker errors', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.flattenPdf({
      pdfBytes: new Uint8Array([1, 2, 3]),
      elements: [],
    });

    worker.emitError('export worker crashed');

    await expect(promise).rejects.toThrow('export worker crashed');
  });

  it('rejects a request aborted via signal', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const controller = new AbortController();
    const promise = client.flattenPdf(
      { pdfBytes: new Uint8Array([1, 2, 3]), elements: [] },
      { signal: controller.signal },
    );

    controller.abort();

    await expect(promise).rejects.toThrow(/aborted/);

    client.dispose();
  });

  it('terminates the underlying worker and rejects pending requests on dispose', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    const promise = client.flattenPdf({
      pdfBytes: new Uint8Array([1, 2, 3]),
      elements: [],
    });

    client.dispose();

    await expect(promise).rejects.toThrow('Export worker client disposed.');
    expect(worker.terminated).toBe(true);

    // dispose() is idempotent.
    client.dispose();
  });

  it('rejects new requests once disposed', async () => {
    const worker = new FakeExportWorker();
    const client = new ExportWorkerClient({
      workerFactory: () => worker,
      requestIdFactory: createSequentialIds(),
    });

    client.dispose();

    await expect(
      client.flattenPdf({ pdfBytes: new Uint8Array([1, 2, 3]), elements: [] }),
    ).rejects.toThrow('Export worker client is disposed.');
  });
});

class FakeExportWorker implements ExportWorkerLike {
  messages: ExportWorkerRequest[] = [];

  terminated = false;

  private listeners = new Map<string, Set<(event: MessageEvent | ErrorEvent) => void>>();

  postMessage(message: ExportWorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent | ErrorEvent) => void,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(response: ExportWorkerResponse): void {
    const event = { data: response } as MessageEvent;

    for (const listener of this.listeners.get('message') ?? []) {
      listener(event);
    }
  }

  emitError(message: string): void {
    const event = { message } as ErrorEvent;

    for (const listener of this.listeners.get('error') ?? []) {
      listener(event);
    }
  }
}

function createSequentialIds(): () => string {
  let counter = 0;

  return () => {
    counter += 1;
    return `req-${counter}`;
  };
}

function makeFlattenResult(): FlattenWriterExportResult {
  return {
    bytes: new Uint8Array([9, 9, 9]),
    pageCount: 1,
    flattenedElementCount: 0,
    embeddedAssetCount: 0,
  };
}

function makePackResult(): ExportPdfHubProjectResult {
  return {
    bytes: new Uint8Array([8, 8, 8]),
    manifest: {
      schema: 'pdf-hub-project',
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      documentFingerprint: 'doc-1',
      files: {
        writerElements: 'writer-elements.json',
        writerAssets: 'writer-assets.json',
        assetDirectory: 'assets/',
      },
      counts: {
        writerElements: 0,
        writerAssets: 0,
      },
    },
    elementCount: 0,
    assetCount: 0,
    ocrProjectIncluded: false,
  };
}

function makeUnpackResult(): ImportPdfHubProjectResult {
  return {
    manifest: makePackResult().manifest,
    originalPdfBytes: new Uint8Array(),
    elements: [],
    assets: [],
    ocrProject: null,
  };
}
