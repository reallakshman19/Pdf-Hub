import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  evaluateExistingTextUiCapability,
} from '@/adapters/pdf-text/PdfLibExistingTextUiEvaluation';
import {
  PdfRendererAdapter,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import {
  commandBus,
} from '@/core/commands/bus';
import {
  createExistingTextEditIntent,
} from '@/core/existing-text/model';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import { ExistingTextInspectorTab } from './ExistingTextInspectorTab';

vi.mock(
  '@/adapters/pdf-text/PdfLibExistingTextUiEvaluation',
  () => ({
    evaluateExistingTextUiCapability:
      vi.fn(),
  }),
);

vi.mock(
  '@/adapters/pdf-renderer/PdfRendererAdapter',
  () => ({
    PdfRendererAdapter: {
      acquireDocument:
        vi.fn(),
      getPageExistingTextSourceItems:
        vi.fn(),
    },
  }),
);

vi.mock(
  '@/core/commands/bus',
  () => ({
    commandBus: {
      execute: vi.fn(),
    },
  }),
);

const page = {
  cleanup: vi.fn(),
};

const lease = {
  doc: {
    getPage:
      vi.fn().mockResolvedValue(
        page,
      ),
  },
  release: vi.fn()
    .mockResolvedValue(undefined),
};

const provenance = {
  streamIndex: 0,
  streamRef: '7 0 R',
  operatorIndex: 4,
  operator: 'Tj' as const,
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
    'ascii-literal' as const,
  fontResourceName: 'F1',
  fontSizePt: 12,
  textMatrix: [
    1, 0, 0, 1, 72, 700,
  ] as [
    number,
    number,
    number,
    number,
    number,
    number,
  ],
};

function nativeCapability(
  span:
    Parameters<
      typeof createExistingTextEditIntent
    >[0],
) {
  return {
    status: 'native' as const,
    intent:
      createExistingTextEditIntent(
        span,
        'Hi',
      ),
    provenance,
    nativeFit: {
      schemaVersion: 1 as const,
      status: 'fits' as const,
      baseFont: 'Helvetica',
      sourceText: 'Hello',
      replacementText: 'Hi',
      observedAdvancePt: 30,
      fontSizePt: 12,
      tolerancePt: 0.25,
      measuredSourceWidthPt: 27,
      measuredReplacementWidthPt:
        12,
      observedToMetricScale:
        30 / 27,
      projectedReplacementAdvancePt:
        12 * 30 / 27,
      overflowPt: 0,
    },
  };
}

function openSession() {
  useSessionStore.setState({
    documentKey: 'doc-1',
    workingBytes:
      new Uint8Array([
        1,
        2,
        3,
      ]),
    pageCount: 1,
    pageGraph: {
      pages: [
        {
          pageId: 'page-1',
          documentKey:
            'doc-1',
          originalPageNumber: 1,
          currentIndex: 0,
          width: 612,
          height: 792,
          rotation: 0,
        },
      ],
    },
    viewState: {
      currentPageId:
        'page-1',
      currentPage: 1,
      zoom: 100,
      fitMode: 'manual',
      viewMode:
        'continuous',
    },
  });
}

describe('ExistingTextInspectorTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openSession();
    useToastStore.setState({
      toasts: [],
    });
    useEditorStore.setState({
      existingTextSelection:
        null,
    });

    vi.mocked(
      PdfRendererAdapter
        .acquireDocument,
    ).mockResolvedValue(
      lease as never,
    );
    vi.mocked(
      PdfRendererAdapter
        .getPageExistingTextSourceItems,
    ).mockResolvedValue([
      {
        sourceIndex: 0,
        text: 'Hello',
        transform: [
          12,
          0,
          0,
          12,
          72,
          700,
        ],
        width: 30,
        height: 12,
        fontName:
          'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
      {
        sourceIndex: 1,
        text: 'Second',
        transform: [
          12,
          0,
          0,
          12,
          120,
          680,
        ],
        width: 36,
        height: 12,
        fontName:
          'g_d0_f1',
        direction: 'ltr',
        hasEol: false,
      },
    ]);
  });

  it('inspects the active page using the stable PageId and shows source classification', async () => {
    render(
      <ExistingTextInspectorTab />,
    );

    expect(
      await screen.findByText(
        'Hello',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Native candidate',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'PageId page-1',
      ),
    ).toBeInTheDocument();
  });

  it('honors a matching direct on-page selection and publishes Inspector changes back to editor state', async () => {
    useEditorStore.setState({
      existingTextSelection: {
        revisionId: 'doc-1',
        pageId: 'page-1',
        sourceIndex: 1,
      },
    });

    render(
      <ExistingTextInspectorTab />,
    );

    const select =
      await screen.findByTestId(
        'existing-text-span-select',
      );

    await waitFor(() =>
      expect(select).toHaveValue(
        'existing-text:doc-1:page-1:1',
      ),
    );
    expect(
      screen.getByText('Second'),
    ).toBeInTheDocument();

    fireEvent.change(
      select,
      {
        target: {
          value:
            'existing-text:doc-1:page-1:0',
        },
      },
    );

    expect(
      useEditorStore
        .getState()
        .existingTextSelection,
    ).toEqual({
      revisionId: 'doc-1',
      pageId: 'page-1',
      sourceIndex: 0,
    });
  });

  it('ignores stale direct selection from another revision or PageId', async () => {
    useEditorStore.setState({
      existingTextSelection: {
        revisionId: 'stale-doc',
        pageId: 'other-page',
        sourceIndex: 1,
      },
    });

    render(
      <ExistingTextInspectorTab />,
    );

    const select =
      await screen.findByTestId(
        'existing-text-span-select',
      );

    await waitFor(() =>
      expect(select).toHaveValue(
        'existing-text:doc-1:page-1:0',
      ),
    );
  });

  it('enables canonical native replacement only after capability proof', async () => {
    vi.mocked(
      evaluateExistingTextUiCapability,
    ).mockImplementation(
      async (input) =>
        nativeCapability(
          input.span,
        ),
    );
    vi.mocked(
      commandBus.execute,
    ).mockResolvedValue({
      success: true,
      commandId: 'cmd-1',
      commandType:
        'REPLACE_EXISTING_TEXT',
      source: 'toolbar',
      mutated: true,
      message:
        'Existing PDF text replaced',
    });

    render(
      <ExistingTextInspectorTab />,
    );

    const input =
      await screen.findByTestId(
        'existing-text-replacement-input',
      );
    fireEvent.change(
      input,
      {
        target: {
          value: 'Hi',
        },
      },
    );
    fireEvent.click(
      screen.getByTestId(
        'existing-text-check-btn',
      ),
    );

    expect(
      await screen.findByText(
        'Native replacement available',
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId(
        'existing-text-replace-btn',
      ),
    );

    await waitFor(() =>
      expect(
        commandBus.execute,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          workingBytes:
            expect.any(
              Uint8Array,
            ),
          command:
            expect.objectContaining({
              type:
                'REPLACE_EXISTING_TEXT',
              source:
                'toolbar',
              documentKey:
                'doc-1',
              payload:
                expect.objectContaining({
                  schemaVersion: 1,
                }),
            }),
        }),
      ),
    );
  });

  it('exposes proved fallback through the distinct reconstructed command without cached evidence', async () => {
    vi.mocked(
      evaluateExistingTextUiCapability,
    ).mockImplementation(
      async (input) => ({
        status:
          'fallback-proved',
        intent:
          createExistingTextEditIntent(
            input.span,
            input.replacementText,
          ),
        provenance,
        nativeFit: {
          schemaVersion: 1,
          status:
            'overflows',
          baseFont:
            'Helvetica',
          sourceText:
            'Hello',
          replacementText:
            input.replacementText,
          observedAdvancePt:
            30,
          fontSizePt: 12,
          tolerancePt: 0.25,
          measuredSourceWidthPt:
            27,
          measuredReplacementWidthPt:
            36,
          observedToMetricScale:
            30 / 27,
          projectedReplacementAdvancePt:
            40,
          overflowPt: 10,
        },
        evidence: {
          schemaVersion: 1,
          sourceRevisionId:
            'doc-1',
          pageId: 'page-1',
          spanId:
            input.span.id,
          sourceCoverage:
            'proved',
          clearanceRectPt: {
            x: 72,
            y: 697,
            width: 40,
            height: 15,
          },
          background: {
            kind: 'solid',
            colorHex:
              '#ffffff',
          },
          foreignPaintIntersections:
            0,
          replacementBoundsPt: {
            x: 72,
            y: 697,
            width: 40,
            height: 15,
          },
        },
      }),
    );

    render(
      <ExistingTextInspectorTab />,
    );

    const input =
      await screen.findByTestId(
        'existing-text-replacement-input',
      );
    fireEvent.change(
      input,
      {
        target: {
          value: 'World',
        },
      },
    );
    fireEvent.click(
      screen.getByTestId(
        'existing-text-check-btn',
      ),
    );

    expect(
      await screen.findByText(
        'Replacement is too wide; fallback evidence is proved',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(
        'existing-text-replace-btn',
      ),
    ).not.toBeInTheDocument();

    vi.mocked(
      commandBus.execute,
    ).mockResolvedValue({
      success: true,
      commandId: 'cmd-reconstruct',
      commandType:
        'RECONSTRUCT_EXISTING_TEXT',
      source: 'toolbar',
      mutated: true,
      message:
        'Existing PDF text reconstructed visually',
    });

    fireEvent.click(
      screen.getByTestId(
        'existing-text-reconstruct-btn',
      ),
    );

    await waitFor(() =>
      expect(
        commandBus.execute,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          workingBytes:
            expect.any(
              Uint8Array,
            ),
          command:
            expect.objectContaining({
              type:
                'RECONSTRUCT_EXISTING_TEXT',
              source:
                'toolbar',
              documentKey:
                'doc-1',
              payload:
                expect.objectContaining({
                  schemaVersion: 1,
                  span:
                    expect.any(
                      Object,
                    ),
                  intent:
                    expect.any(
                      Object,
                    ),
                  provenance:
                    expect.any(
                      Object,
                    ),
                }),
            }),
        }),
      ),
    );

    const call =
      vi.mocked(
        commandBus.execute,
      ).mock.calls.at(-1)?.[0];
    expect(
      call?.command.payload,
    ).not.toHaveProperty(
      'evidence',
    );
    expect(
      call?.command.payload,
    ).not.toHaveProperty(
      'nativeFit',
    );
  });

  it('invalidates checked fallback capability when replacement text changes', async () => {
    vi.mocked(
      evaluateExistingTextUiCapability,
    ).mockImplementation(
      async (input) => ({
        status:
          'fallback-proved',
        intent:
          createExistingTextEditIntent(
            input.span,
            input.replacementText,
          ),
        provenance,
        nativeFit: {
          schemaVersion: 1,
          status:
            'overflows',
          baseFont:
            'Helvetica',
          sourceText: 'Hello',
          replacementText:
            input.replacementText,
          observedAdvancePt:
            30,
          fontSizePt: 12,
          tolerancePt: 0.25,
          measuredSourceWidthPt:
            27,
          measuredReplacementWidthPt:
            36,
          observedToMetricScale:
            30 / 27,
          projectedReplacementAdvancePt:
            40,
          overflowPt: 10,
        },
        evidence: {
          schemaVersion: 1,
          sourceRevisionId:
            'doc-1',
          pageId: 'page-1',
          spanId:
            input.span.id,
          sourceCoverage:
            'proved',
          clearanceRectPt: {
            x: 72,
            y: 697,
            width: 40,
            height: 15,
          },
          background: {
            kind: 'solid',
            colorHex:
              '#ffffff',
          },
          foreignPaintIntersections:
            0,
          replacementBoundsPt: {
            x: 72,
            y: 697,
            width: 40,
            height: 15,
          },
        },
      }),
    );

    render(
      <ExistingTextInspectorTab />,
    );

    const input =
      await screen.findByTestId(
        'existing-text-replacement-input',
      );
    fireEvent.change(
      input,
      {
        target: {
          value: 'World',
        },
      },
    );
    fireEvent.click(
      screen.getByTestId(
        'existing-text-check-btn',
      ),
    );

    expect(
      await screen.findByTestId(
        'existing-text-reconstruct-btn',
      ),
    ).toBeInTheDocument();

    fireEvent.change(
      input,
      {
        target: {
          value:
            'World again',
        },
      },
    );

    expect(
      screen.queryByTestId(
        'existing-text-reconstruct-btn',
      ),
    ).not.toBeInTheDocument();
    expect(
      commandBus.execute,
    ).not.toHaveBeenCalled();
  });

  it('surfaces canonical command failure without claiming success', async () => {
    vi.mocked(
      evaluateExistingTextUiCapability,
    ).mockImplementation(
      async (input) =>
        nativeCapability(
          input.span,
        ),
    );
    vi.mocked(
      commandBus.execute,
    ).mockResolvedValue({
      success: false,
      commandId: 'cmd-1',
      commandType:
        'REPLACE_EXISTING_TEXT',
      source: 'toolbar',
      mutated: false,
      message: 'stale',
      error: {
        code:
          'VALIDATION_FAILED',
        message:
          'stale provenance',
      },
    });

    render(
      <ExistingTextInspectorTab />,
    );
    const input =
      await screen.findByTestId(
        'existing-text-replacement-input',
      );
    fireEvent.change(
      input,
      {
        target: {
          value: 'Hi',
        },
      },
    );
    fireEvent.click(
      screen.getByTestId(
        'existing-text-check-btn',
      ),
    );
    await screen.findByText(
      'Native replacement available',
    );
    fireEvent.click(
      screen.getByTestId(
        'existing-text-replace-btn',
      ),
    );

    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.at(-1),
      ).toMatchObject({
        type: 'error',
        title:
          'Text replacement failed',
        message:
          'stale provenance',
      }),
    );
  });
});
