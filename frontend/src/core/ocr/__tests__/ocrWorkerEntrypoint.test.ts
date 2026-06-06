import {
  describe,
  expect,
  it,
} from 'vitest';
import type {
  OcrEngine,
  OcrEngineInput,
  OcrEngineRegistry,
} from '../engines/ocrEngineContract';
import type {
  OcrDocumentResult,
} from '../types';
import type {
  OcrWorkerRequest,
  OcrWorkerResponse,
} from '../workers/ocrWorkerTypes';
import {
  createOcrWorkerMessageHandler,
  recognizePagesWithProgress,
} from '../workers/ocrWorkerEntrypoint';

describe('ocrWorkerEntrypoint', () => {
  it('responds to PING with PONG', async () => {
    const posted: OcrWorkerResponse[] = [];

    const handler = createOcrWorkerMessageHandler({
      registry: createFakeRegistry(),
      workerVersion: 'test-worker',
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
          workerVersion: 'test-worker',
        },
      },
    ]);
  });

  it('recognizes pages and posts progress/result messages', async () => {
    const posted: OcrWorkerResponse[] = [];

    const handler = createOcrWorkerMessageHandler({
      registry: createFakeRegistry(),
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler(makeRecognizeRequest());

    expect(posted.map((item) => item.type)).toContain('PROGRESS');
    expect(posted[posted.length - 1].type).toBe('RECOGNIZE_RESULT');

    const resultMessage = posted.find(
      (item): item is Extract<OcrWorkerResponse, { type: 'RECOGNIZE_RESULT' }> =>
        item.type === 'RECOGNIZE_RESULT',
    );

    expect(resultMessage?.payload.result.documentFingerprint).toBe('doc-worker-entry');
    expect(resultMessage?.payload.result.pages).toHaveLength(2);
  });

  it('returns ERROR when engine is missing', async () => {
    const posted: OcrWorkerResponse[] = [];

    const handler = createOcrWorkerMessageHandler({
      registry: createFakeRegistry(),
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler({
      ...makeRecognizeRequest(),
      payload: {
        ...makeRecognizeRequest().payload,
        engineId: 'missing',
      },
    });

    expect(posted[posted.length - 1].type).toBe('ERROR');

    const error = posted[posted.length - 1] as Extract<OcrWorkerResponse, { type: 'ERROR' }>;

    expect(error.payload.message).toContain('engine not found');
  });

  it('handles CANCEL_REQUEST for active request', async () => {
    const posted: OcrWorkerResponse[] = [];
    const state = {
      activeRequests: new Map<string, AbortController>(),
    };

    const controller = new AbortController();
    state.activeRequests.set('req-active', controller);

    const handler = createOcrWorkerMessageHandler({
      registry: createFakeRegistry(),
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
        reason: 'OCR worker request cancelled.',
      },
    });
  });

  it('posts cancellation when request is aborted during recognition', async () => {
    const posted: OcrWorkerResponse[] = [];
    const state = {
      activeRequests: new Map<string, AbortController>(),
    };

    const handler = createOcrWorkerMessageHandler({
      registry: createSlowRegistry(),
      state,
      postMessage: (response) => {
        posted.push(response);
      },
    });

    const promise = handler(makeRecognizeRequest());

    await waitUntil(() => state.activeRequests.has('req-recognize'));

    const controller = state.activeRequests.get('req-recognize');
    controller?.abort();

    await promise;

    expect(posted.some((item) => item.type === 'REQUEST_CANCELLED')).toBe(true);
  });

  it('recognizePagesWithProgress posts page-completed progress', async () => {
    const progress: string[] = [];
    const engine = createFakeEngine();

    const result = await recognizePagesWithProgress({
      engine,
      payload: makeRecognizeRequest().payload,
      signal: new AbortController().signal,
      postProgress: (item) => {
        progress.push(item.status);
      },
    });

    expect(result.pages).toHaveLength(2);
    expect(progress).toContain('running');
    expect(progress).toContain('page-completed');
  });

  it('returns ERROR when engine throws non-cancellation failure', async () => {
    const posted: OcrWorkerResponse[] = [];

    const handler = createOcrWorkerMessageHandler({
      registry: createThrowingRegistry(),
      postMessage: (response) => {
        posted.push(response);
      },
    });

    await handler(makeRecognizeRequest());

    const error = posted.find(
      (item): item is Extract<OcrWorkerResponse, { type: 'ERROR' }> =>
        item.type === 'ERROR',
    );

    expect(error?.payload.code).toBe('OCR_WORKER_RECOGNIZE_FAILED');
    expect(error?.payload.message).toContain('Synthetic engine failure');
  });
});

function makeRecognizeRequest(): Extract<OcrWorkerRequest, { type: 'RECOGNIZE_PAGES' }> {
  return {
    requestId: 'req-recognize',
    type: 'RECOGNIZE_PAGES',
    payload: {
      documentFingerprint: 'doc-worker-entry',
      engineId: 'fake',
      profileId: 'clean-scan',
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
        {
          pageIndex: 1,
          imageBytes: new Uint8Array([4, 5, 6]),
          width: 595,
          height: 842,
        },
      ],
    },
  };
}

function createFakeRegistry(): OcrEngineRegistry {
  const engine = createFakeEngine();

  return {
    getEngine(engineId: string): OcrEngine | null {
      return engineId === 'fake' ? engine : null;
    },
    listEngines(): OcrEngine[] {
      return [engine];
    },
  };
}

function createSlowRegistry(): OcrEngineRegistry {
  const engine: OcrEngine = {
    ...createFakeEngine(),
    async recognize(input: OcrEngineInput): Promise<OcrDocumentResult> {
      await delay(50);
      return createFakeEngine().recognize(input);
    },
  };

  return {
    getEngine(engineId: string): OcrEngine | null {
      return engineId === 'fake' ? engine : null;
    },
    listEngines(): OcrEngine[] {
      return [engine];
    },
  };
}

function createThrowingRegistry(): OcrEngineRegistry {
  const engine: OcrEngine = {
    ...createFakeEngine(),
    async recognize(): Promise<OcrDocumentResult> {
      throw new Error('Synthetic engine failure.');
    },
  };

  return {
    getEngine(engineId: string): OcrEngine | null {
      return engineId === 'fake' ? engine : null;
    },
    listEngines(): OcrEngine[] {
      return [engine];
    },
  };
}

function createFakeEngine(): OcrEngine {
  return {
    id: 'fake',
    label: 'Fake OCR Engine',
    supportsTables: false,
    supportsLayout: true,
    supportsSearchablePdf: false,
    async recognize(input: OcrEngineInput): Promise<OcrDocumentResult> {
      return {
        documentFingerprint: input.documentFingerprint,
        createdAt: '2026-01-01T00:00:00.000Z',
        engineId: 'fake',
        profileId: input.profile.id,
        pages: input.pages.map((page) => ({
          pageIndex: page.pageIndex,
          pageNumber: page.pageIndex + 1,
          status: 'success',
          pageType: 'scanned',
          orientationDeg: 0,
          languageHints: ['eng'],
          width: page.width,
          height: page.height,
          words: [],
          lines: [],
          blocks: [],
          diagnostics: [],
        })),
        diagnostics: [],
      };
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('waitUntil timeout.');
    }

    await delay(1);
  }
}
