import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { commandBus } from '@/core/commands/bus';
import { useSessionStore } from '@/core/session/store';
import {
  buildExistingTextSpan,
  createExistingTextEditIntent,
} from '@/core/existing-text/model';
import type {
  PdfHubSdkCommandDraft,
} from '../types';
import {
  createPdfHubSdk,
  PdfHubSdkError,
} from '../publicSdk';
import {
  createPdfHubSdk as createPdfHubSdkFromModule,
  PDF_HUB_SDK_API_VERSION,
} from '../../../sdk';

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

function sdkExistingTextDraft(
  replacementText = 'World',
): PdfHubSdkCommandDraft {
  const span =
    buildExistingTextSpan(
      {
        revisionId: 'sdk-doc',
        pageId: 'sdk-page-1',
        pageIndex: 0,
      },
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [
          12, 0, 0, 12, 72, 700,
        ],
        width: 30,
        height: 12,
        fontName: 'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    );

  return {
    type:
      'REPLACE_EXISTING_TEXT',
    payload: {
      schemaVersion: 1,
      span,
      intent:
        createExistingTextEditIntent(
          span,
          replacementText,
        ),
      provenance: {
        streamIndex: 0,
        streamRef: '7 0 R',
        operatorIndex: 4,
        operator: 'Tj',
        operatorRange: {
          start: 18,
          end: 20,
        },
        operandRange: {
          start: 10,
          end: 17,
        },
        decodedText: 'Hello',
        encoding:
          'ascii-literal',
        fontResourceName: 'F1',
        fontSizePt: 12,
        textMatrix: [
          1, 0, 0, 1, 72, 700,
        ],
      },
    },
  };
}

function donorPdfBytes(
  label = 'donor',
): Uint8Array {
  return new TextEncoder().encode(
    `%PDF-1.7\n${label}`,
  );
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

  it('exposes versioned capabilities including donor commands without internal command types', () => {
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
    ).toContain('INSERT_PAGES');
    expect(
      capabilities.commandTypes,
    ).toContain('REPLACE_PAGE');
    expect(
      capabilities.commandTypes,
    ).toContain('MERGE_PDF');
    expect(
      capabilities.commandTypes,
    ).toContain(
      'REPLACE_EXISTING_TEXT',
    );
    expect(
      capabilities.commandTypes,
    ).not.toContain('APPLY_WORKING_COPY');
    expect(
      capabilities.donorAdmission,
    ).toBe(true);
  });

  it('exports the SDK through the side-effect-free module entry', () => {
    expect(createPdfHubSdkFromModule)
      .toBe(createPdfHubSdk);
    expect(PDF_HUB_SDK_API_VERSION)
      .toBe('1');
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

  it('routes bounded existing-text replacement through CommandBus with API source', async () => {
    openTestDocument();
    const execute =
      vi.spyOn(
        commandBus,
        'execute',
      )
      .mockResolvedValue({
        success: true,
        commandId:
          'sdk-text-command',
        commandType:
          'REPLACE_EXISTING_TEXT',
        source: 'api',
        mutated: true,
        message: 'replaced',
      });

    const sdk =
      createPdfHubSdk();
    const draft =
      sdkExistingTextDraft();
    const execution =
      await sdk.executeCommand(
        draft,
        {
          commandId:
            'sdk-text-command',
        },
      );

    expect(execution.result)
      .toMatchObject({
        success: true,
        commandType:
          'REPLACE_EXISTING_TEXT',
      });
    expect(
      execute.mock.calls[0]?.[0]
        ?.command,
    ).toMatchObject({
      id: 'sdk-text-command',
      type:
        'REPLACE_EXISTING_TEXT',
      source: 'api',
      documentKey: 'sdk-doc',
    });
  });

  it('rejects malformed existing-text replacement before CommandBus execution', async () => {
    openTestDocument();
    const execute =
      vi.spyOn(
        commandBus,
        'execute',
      );
    const sdk =
      createPdfHubSdk();

    await expect(
      sdk.executeCommand(
        sdkExistingTextDraft(
          'Ω',
        ),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(execute)
      .not.toHaveBeenCalled();
  });

  it('rejects internal compatibility commands at the public boundary', async () => {
    openTestDocument();
    const execute = vi.spyOn(
      commandBus,
      'execute',
    );
    const sdk = createPdfHubSdk();

    await expect(
      sdk.executeCommand(
        {
          type: 'APPLY_WORKING_COPY',
          payload: {
            binaryResourceId:
              'working-copy',
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

  it('rejects malformed runtime command values before CommandBus execution', async () => {
    openTestDocument();
    const execute = vi.spyOn(
      commandBus,
      'execute',
    );
    const sdk = createPdfHubSdk();

    await expect(
      sdk.executeCommand(
        {
          type: 'INSERT_BLANK_PAGE',
          payload: {
            atIndex: 0,
          },
        } as never,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });

    expect(execute)
      .not.toHaveBeenCalled();
  });

  it('rejects malformed execute options before CommandBus execution', async () => {
    openTestDocument();
    const execute = vi.spyOn(
      commandBus,
      'execute',
    );
    const sdk = createPdfHubSdk();

    await expect(
      sdk.executeCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        {
          binaryResources: {
            invalid:
              [1, 2, 3],
          },
        } as never,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });

    expect(execute)
      .not.toHaveBeenCalled();
  });

  it('rejects malformed runtime donor input before shared admission', async () => {
    openTestDocument();
    const countPages = vi.spyOn(
      PdfEditAdapter,
      'countPages',
    );
    const sdk = createPdfHubSdk();

    await expect(
      sdk.admitDonors(
        {
          commandTarget:
            'INSERT_PAGES',
          donors: [
            {
              fileName: 'donor.pdf',
              bytes: [1, 2, 3],
            },
          ],
        } as never,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });

    expect(countPages)
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

  it('admits donors behind opaque resource IDs and routes them through CommandBus', async () => {
    openTestDocument();
    vi.spyOn(
      PdfEditAdapter,
      'countPages',
    ).mockResolvedValue(2);

    const execute = vi
      .spyOn(commandBus, 'execute')
      .mockResolvedValue({
        success: true,
        commandId: 'insert-command',
        commandType: 'INSERT_PAGES',
        source: 'api',
        mutated: true,
        message: 'inserted',
      });

    const sdk = createPdfHubSdk();
    const admission =
      await sdk.admitDonors({
        commandTarget:
          'INSERT_PAGES',
        donors: [
          {
            fileName: 'donor.pdf',
            bytes:
              donorPdfBytes(),
          },
        ],
      });

    expect(admission.documentKey)
      .toBe('sdk-doc');
    expect(admission.donors)
      .toHaveLength(1);
    expect(admission.donors[0])
      .toMatchObject({
        fileName: 'donor.pdf',
        pageCount: 2,
      });
    expect(admission.donors[0])
      .not.toHaveProperty('bytes');
    expect(admission.donors[0])
      .not.toHaveProperty('handle');

    const resourceId =
      admission.donors[0].resourceId;

    await sdk.executeCommand({
      type: 'INSERT_PAGES',
      payload: {
        atIndex: 1,
        donorResourceId:
          resourceId,
      },
    });

    const input =
      execute.mock.calls[0][0];
    expect(input.command.type)
      .toBe('INSERT_PAGES');
    expect(
      input.resources?.donors?.[
        resourceId
      ],
    ).toMatchObject({
      fileName: 'donor.pdf',
      pageCount: 2,
      commandTarget:
        'INSERT_PAGES',
      ownerDocumentKey:
        'sdk-doc',
    });

    await expect(
      sdk.executeCommand({
        type: 'INSERT_PAGES',
        payload: {
          atIndex: 1,
          donorResourceId:
            resourceId,
        },
      }),
    ).rejects.toMatchObject({
      code: 'DONOR_ADMISSION_INVALID',
    });
  });

  it('binds donor admissions to their command target and complete resource order', async () => {
    openTestDocument();
    vi.spyOn(
      PdfEditAdapter,
      'countPages',
    )
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const execute = vi.spyOn(
      commandBus,
      'execute',
    );
    const sdk = createPdfHubSdk();
    const admission =
      await sdk.admitDonors({
        commandTarget: 'MERGE_PDF',
        donors: [
          {
            fileName: 'first.pdf',
            bytes:
              donorPdfBytes('first'),
          },
          {
            fileName: 'second.pdf',
            bytes:
              donorPdfBytes('second'),
          },
        ],
      });

    const ids =
      admission.donors.map(
        (donor) =>
          donor.resourceId,
      );

    await expect(
      sdk.executeCommand({
        type: 'MERGE_PDF',
        payload: {
          donorResourceIds:
            [...ids].reverse(),
        },
      }),
    ).rejects.toMatchObject({
      code: 'DONOR_ADMISSION_INVALID',
    });

    expect(execute)
      .not.toHaveBeenCalled();

    const released =
      sdk.releaseDonorAdmission(
        admission.admissionId,
      );
    expect(released).toBe(true);
    expect(
      sdk.releaseDonorAdmission(
        admission.admissionId,
      ),
    ).toBe(false);
  });

  it('rejects donor resources after the active document changes', async () => {
    openTestDocument();
    vi.spyOn(
      PdfEditAdapter,
      'countPages',
    ).mockResolvedValue(1);

    const sdk = createPdfHubSdk();
    const admission =
      await sdk.admitDonors({
        commandTarget:
          'REPLACE_PAGE',
        donors: [
          {
            fileName: 'donor.pdf',
            bytes:
              donorPdfBytes(),
          },
        ],
      });

    useSessionStore
      .getState()
      .openDocument({
        documentKey: 'other-doc',
        fileName: 'other.pdf',
        bytes:
          new Uint8Array([5, 6]),
        pageCount: 1,
      });

    expect(
      sdk.releaseDonorAdmission(
        admission.admissionId,
      ),
    ).toBe(false);

    await expect(
      sdk.executeCommand({
        type: 'REPLACE_PAGE',
        payload: {
          atIndex: 0,
          donorResourceId:
            admission.donors[0]
              .resourceId,
          donorPageIndex: 0,
        },
      }),
    ).rejects.toMatchObject({
      code: 'DONOR_ADMISSION_INVALID',
    });
  });

  it('emits typed session and command lifecycle events and detaches cleanly', async () => {
    const sdk = createPdfHubSdk();
    const listener = vi.fn();
    const unsubscribe =
      sdk.subscribeEvents(listener);

    expect(listener.mock.calls[0][0])
      .toMatchObject({
        type: 'session-changed',
        session: {
          documentKey: null,
        },
      });

    openTestDocument();
    vi.spyOn(commandBus, 'execute')
      .mockResolvedValue({
        success: true,
        commandId: 'event-command',
        commandType: 'ROTATE_PAGES',
        source: 'api',
        mutated: true,
        message: 'rotated',
      });

    await sdk.executeCommand(
      {
        type: 'ROTATE_PAGES',
        payload: {
          pageIndices: [0],
          angle: 90,
        },
      },
      {
        commandId: 'event-command',
      },
    );

    expect(
      listener.mock.calls
        .map(([event]) => event.type),
    ).toEqual(
      expect.arrayContaining([
        'session-changed',
        'command-started',
        'command-finished',
      ]),
    );

    expect(
      listener.mock.calls
        .map(([event]) => event)
        .find(
          (event) =>
            event.type
            === 'command-finished',
        ),
    ).toMatchObject({
      commandId: 'event-command',
      commandType: 'ROTATE_PAGES',
      success: true,
      mutated: true,
    });

    const callCount =
      listener.mock.calls.length;
    unsubscribe();
    useSessionStore
      .getState()
      .setDirty(true);

    expect(listener)
      .toHaveBeenCalledTimes(
        callCount,
      );
  });

  it('isolates event-listener exceptions from SDK and session execution', async () => {
    const sdk = createPdfHubSdk();
    const unsubscribe =
      sdk.subscribeEvents(
        () => {
          throw new Error(
            'consumer listener failure',
          );
        },
      );

    expect(() =>
      openTestDocument(),
    ).not.toThrow();

    vi.spyOn(commandBus, 'execute')
      .mockResolvedValue({
        success: true,
        commandId: 'isolated-command',
        commandType: 'ROTATE_PAGES',
        source: 'api',
        mutated: false,
        message: 'noop',
      });

    await expect(
      sdk.executeCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        {
          commandId:
            'isolated-command',
        },
      ),
    ).resolves.toMatchObject({
      result: {
        success: true,
      },
    });

    unsubscribe();
  });

  it('emits a terminal command event when CommandBus throws', async () => {
    openTestDocument();
    const sdk = createPdfHubSdk();
    const listener = vi.fn();
    const unsubscribe =
      sdk.subscribeEvents(
        listener,
        {
          emitCurrentSession: false,
        },
      );

    vi.spyOn(commandBus, 'execute')
      .mockRejectedValue(
        new Error('queue failure'),
      );

    await expect(
      sdk.executeCommand(
        {
          type: 'ROTATE_PAGES',
          payload: {
            pageIndices: [0],
            angle: 90,
          },
        },
        {
          commandId:
            'throwing-command',
        },
      ),
    ).rejects.toThrow(
      'queue failure',
    );

    expect(
      listener.mock.calls
        .map(([event]) => event)
        .find(
          (event) =>
            event.type
            === 'command-finished',
        ),
    ).toMatchObject({
      commandId:
        'throwing-command',
      success: false,
      mutated: false,
      exception: true,
      failureMessage:
        'queue failure',
    });

    unsubscribe();
  });

  it('emits donor admission and release metadata without donor capabilities', async () => {
    openTestDocument();
    vi.spyOn(
      PdfEditAdapter,
      'countPages',
    ).mockResolvedValue(1);

    const sdk = createPdfHubSdk();
    const listener = vi.fn();
    const unsubscribe =
      sdk.subscribeEvents(
        listener,
        {
          emitCurrentSession: false,
        },
      );

    const admission =
      await sdk.admitDonors({
        commandTarget:
          'INSERT_PAGES',
        donors: [
          {
            fileName: 'donor.pdf',
            bytes:
              donorPdfBytes(),
          },
        ],
      });

    sdk.releaseDonorAdmission(
      admission.admissionId,
    );

    const donorAdmitted =
      listener.mock.calls
        .map(([event]) => event)
        .find(
          (event) =>
            event.type
            === 'donor-admitted',
        );
    expect(donorAdmitted)
      .toMatchObject({
        type: 'donor-admitted',
        admission: {
          admissionId:
            admission.admissionId,
        },
      });
    expect(
      donorAdmitted.admission
        .donors[0],
    ).not.toHaveProperty('bytes');

    expect(
      listener.mock.calls
        .map(([event]) => event)
        .find(
          (event) =>
            event.type
            === 'donor-released',
        ),
    ).toMatchObject({
      type: 'donor-released',
      admissionId:
        admission.admissionId,
      reason: 'explicit',
    });

    unsubscribe();
  });

  it('isolates session-listener exceptions and validates subscription options', () => {
    const sdk = createPdfHubSdk();

    const unsubscribe =
      sdk.subscribeSession(
        () => {
          throw new Error(
            'session listener failure',
          );
        },
      );

    expect(() =>
      openTestDocument(),
    ).not.toThrow();
    unsubscribe();

    let thrown: unknown;
    try {
      sdk.subscribeEvents(
        vi.fn(),
        null as never,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown)
      .toMatchObject({
        code: 'INVALID_ARGUMENT',
      });
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
