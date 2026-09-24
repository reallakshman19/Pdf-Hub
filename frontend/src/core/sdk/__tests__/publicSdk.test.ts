import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { commandBus } from '@/core/commands/bus';
import { useSessionStore } from '@/core/session/store';
import {
  createPdfHubSdk,
  PdfHubSdkError,
} from '../publicSdk';

function openTestDocument() {
  const bytes = new Uint8Array(
    [1, 2, 3, 4],
  );

  useSessionStore.getState().openDocument({
    documentKey: 'sdk-doc',
    fileName: 'sdk.pdf',
    bytes,
    pageCount: 1,
    pageGraph: {
      pages: [
        {
          pageId: 'sdk-page-1',
          documentKey: 'sdk-doc',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    },
  });

  return bytes;
}

describe('PDFHubSDK', () => {
  beforeEach(() => {
    useSessionStore
      .getState()
      .clearDocument();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSessionStore
      .getState()
      .clearDocument();
  });

  it('exposes versioned capabilities without internal command types', () => {
    const sdk = createPdfHubSdk();
    const capabilities =
      sdk.getCapabilities();

    expect(sdk.apiVersion).toBe('1');
    expect(
      capabilities.commandTypes,
    ).toContain('ROTATE_PAGES');
    expect(
      capabilities.commandTypes,
    ).toContain('SET_PAGE_LABELS');
    expect(
      capabilities.commandTypes,
    ).not.toContain('MERGE_PDF');
    expect(
      capabilities.commandTypes,
    ).not.toContain('APPLY_WORKING_COPY');
    expect(
      capabilities.donorAdmission,
    ).toBe(false);
  });

  it('returns cloned session identity and defensive working bytes', () => {
    openTestDocument();
    const sdk = createPdfHubSdk();

    const snapshot =
      sdk.inspectSession();
    const bytes =
      sdk.getWorkingPdfBytes();

    expect(snapshot.documentKey)
      .toBe('sdk-doc');
    expect(
      snapshot.pageGraph?.pages[0]
        ?.pageId,
    ).toBe('sdk-page-1');
    expect(bytes).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );

    snapshot.selectedPages.push(99);
    if (snapshot.pageGraph) {
      snapshot.pageGraph.pages[0]
        .currentIndex = 99;
    }
    if (bytes) {
      bytes[0] = 99;
    }

    const current =
      useSessionStore.getState();
    expect(current.selectedPages)
      .toEqual([]);
    expect(
      current.pageGraph?.pages[0]
        ?.currentIndex,
    ).toBe(0);
    expect(
      current.workingBytes?.[0],
    ).toBe(1);
  });

  it('routes supported commands through CommandBus with API source', async () => {
    const bytes = openTestDocument();
    const execute = vi
      .spyOn(commandBus, 'execute')
      .mockResolvedValue({
        success: true,
        commandId: 'sdk-command',
        commandType: 'ROTATE_PAGES',
        source: 'api',
        mutated: true,
        message: 'rotated',
      });

    const sdk = createPdfHubSdk();
    const execution =
      await sdk.executeCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        {
          commandId: 'sdk-command',
          createdAt:
            '2026-09-24T00:00:00.000Z',
        },
      );

    expect(execution.result.success)
      .toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);

    const input =
      execute.mock.calls[0][0];

    expect(input.command).toMatchObject({
      id: 'sdk-command',
      type: 'ROTATE_PAGES',
      source: 'api',
      documentKey: 'sdk-doc',
    });
    expect(input.workingBytes)
      .toBe(bytes);
    expect(input.context)
      .toMatchObject({
        currentPage: 1,
        selectedPages: [],
        fileName: 'sdk.pdf',
        documentKey: 'sdk-doc',
      });
  });

  it('rejects unsupported commands at the public boundary', async () => {
    openTestDocument();
    const execute = vi.spyOn(
      commandBus,
      'execute',
    );
    const sdk = createPdfHubSdk();

    await expect(
      sdk.executeCommand(
        {
          type: 'MERGE_PDF',
          payload: {
            donorResourceIds: ['donor'],
          },
        } as never,
      ),
    ).rejects.toMatchObject({
      name: 'PdfHubSdkError',
      code: 'UNSUPPORTED_COMMAND',
    });

    expect(execute)
      .not.toHaveBeenCalled();
  });

  it('reports no-active-document as a typed SDK precondition error', async () => {
    const sdk = createPdfHubSdk();

    await expect(
      sdk.executeCommand({
        type: 'ROTATE_PAGES',
        payload: {
          pageIndices: [0],
          angle: 90,
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'PdfHubSdkError',
        code: 'NO_ACTIVE_DOCUMENT',
      }),
    );

    await expect(
      sdk.executeCommand({
        type: 'ROTATE_PAGES',
        payload: {
          pageIndices: [0],
          angle: 90,
        },
      }),
    ).rejects.toBeInstanceOf(
      PdfHubSdkError,
    );
  });

  it('subscribes with snapshots and detaches without exposing Zustand', () => {
    const sdk = createPdfHubSdk();
    const listener = vi.fn();

    const unsubscribe =
      sdk.subscribeSession(listener);

    expect(listener)
      .toHaveBeenCalledTimes(1);
    expect(
      listener.mock.calls[0][0]
        .documentKey,
    ).toBeNull();

    openTestDocument();

    expect(listener)
      .toHaveBeenCalledTimes(2);
    expect(
      listener.mock.calls[1][0]
        .documentKey,
    ).toBe('sdk-doc');

    unsubscribe();
    useSessionStore
      .getState()
      .setDirty(true);

    expect(listener)
      .toHaveBeenCalledTimes(2);
  });
});
