import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import {
  evaluateExistingTextUiCapability,
  type ExistingTextUiCapability,
} from '@/adapters/pdf-text/PdfLibExistingTextUiEvaluation';
import {
  PdfRendererAdapter,
  type PdfDocumentLease,
} from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { Button } from '@/components/ui/Button';
import {
  commandBus,
} from '@/core/commands/bus';
import {
  materializePdfCommand,
} from '@/core/commands/types';
import {
  isOperationCancelledError,
} from '@/core/cancellation/operationCancellation';
import {
  buildExistingTextPageInspection,
} from '@/core/existing-text/model';
import type {
  ExistingTextSpan,
} from '@/core/existing-text/types';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';

type InspectionState =
  | {
      status: 'idle';
      spans: ExistingTextSpan[];
    }
  | {
      status: 'loading';
      spans: ExistingTextSpan[];
    }
  | {
      status: 'ready';
      spans: ExistingTextSpan[];
    }
  | {
      status: 'error';
      spans: ExistingTextSpan[];
      message: string;
    };

export const ExistingTextInspectorTab: React.FC = () => {
  const {
    workingBytes,
    documentKey,
    pageGraph,
    viewState,
  } = useSessionStore(
    useShallow((state) => ({
      workingBytes:
        state.workingBytes,
      documentKey:
        state.documentKey,
      pageGraph:
        state.pageGraph,
      viewState:
        state.viewState,
    })),
  );
  const addToast =
    useToastStore(
      (state) =>
        state.addToast,
    );
  const {
    existingTextSelection,
    setExistingTextSelection,
  } = useEditorStore(
    useShallow((state) => ({
      existingTextSelection:
        state.existingTextSelection,
      setExistingTextSelection:
        state.setExistingTextSelection,
    })),
  );

  const [inspection, setInspection] =
    React.useState<InspectionState>({
      status: 'idle',
      spans: [],
    });
  const [
    selectedSpanId,
    setSelectedSpanId,
  ] = React.useState<string | null>(
    null,
  );
  const [
    replacementText,
    setReplacementText,
  ] = React.useState('');
  const [
    capability,
    setCapability,
  ] =
    React.useState<ExistingTextUiCapability | null>(
      null,
    );
  const [
    checking,
    setChecking,
  ] = React.useState(false);
  const [
    replacing,
    setReplacing,
  ] = React.useState(false);

  const pageIndex =
    viewState.currentPage - 1;
  const pageNode =
    pageGraph?.pages[
      pageIndex
    ] ?? null;

  React.useEffect(() => {
    const controller =
      new AbortController();
    let lease:
      PdfDocumentLease | null =
      null;

    const release =
      async () => {
        if (!lease) return;
        const current = lease;
        lease = null;
        await current.release();
      };

    const inspect = async () => {
      setCapability(null);

      if (
        !workingBytes
        || !documentKey
        || !pageNode
      ) {
        setInspection({
          status: 'idle',
          spans: [],
        });
        setSelectedSpanId(
          null,
        );
        return;
      }

      setInspection((current) => ({
        status: 'loading',
        spans: current.spans,
      }));

      try {
        lease =
          await PdfRendererAdapter
            .acquireDocument(
              workingBytes,
            );
        const page =
          await lease.doc.getPage(
            viewState.currentPage,
          );
        try {
          const items =
            await PdfRendererAdapter
              .getPageExistingTextSourceItems(
                page,
                controller.signal,
              );
          const next =
            buildExistingTextPageInspection(
              {
                revisionId:
                  documentKey,
                pageId:
                  pageNode.pageId,
                pageIndex,
              },
              items,
            );
          setInspection({
            status: 'ready',
            spans: next.spans,
          });
          setSelectedSpanId(
            (current) => {
              if (
                current
                && next.spans.some(
                  (span) =>
                    span.id
                    === current,
                )
              ) {
                return current;
              }
              return (
                next.spans.find(
                  (span) =>
                    span.editability
                    === 'native-replacement-candidate',
                )?.id
                ?? next.spans[0]
                  ?.id
                ?? null
              );
            },
          );
        } finally {
          page.cleanup();
        }
      } catch (error) {
        if (
          isOperationCancelledError(
            error,
          )
        ) {
          return;
        }
        setInspection({
          status: 'error',
          spans: [],
          message:
            error instanceof Error
              ? error.message
              : String(error),
        });
        setSelectedSpanId(
          null,
        );
      } finally {
        await release();
      }
    };

    void inspect();

    return () => {
      controller.abort(
        'Existing-text Inspector page changed',
      );
      void release();
    };
  }, [
    workingBytes,
    documentKey,
    pageNode?.pageId,
    pageIndex,
    viewState.currentPage,
  ]);

  React.useEffect(() => {
    if (
      !existingTextSelection
      || !documentKey
      || !pageNode
      || existingTextSelection.revisionId
        !== documentKey
      || existingTextSelection.pageId
        !== pageNode.pageId
    ) {
      return;
    }

    const directSelection =
      inspection.spans.find(
        (span) =>
          span.sourceIndex
          === existingTextSelection.sourceIndex,
      );

    if (
      directSelection
      && directSelection.id
        !== selectedSpanId
    ) {
      setSelectedSpanId(
        directSelection.id,
      );
    }
  }, [
    documentKey,
    existingTextSelection,
    inspection.spans,
    pageNode,
    selectedSpanId,
  ]);

  const selectedSpan =
    React.useMemo(
      () =>
        inspection.spans.find(
          (span) =>
            span.id
            === selectedSpanId,
        ) ?? null,
      [
        inspection.spans,
        selectedSpanId,
      ],
    );

  React.useEffect(() => {
    if (!selectedSpan) {
      setReplacementText('');
      setCapability(null);
      return;
    }
    setReplacementText(
      selectedSpan.text,
    );
    setCapability(null);
  }, [selectedSpan?.id]);

  const checkEdit =
    async () => {
      if (
        !workingBytes
        || !documentKey
        || !selectedSpan
      ) {
        return;
      }
      if (
        replacementText
        === selectedSpan.text
      ) {
        setCapability({
          status: 'unavailable',
          reasons: [
            'Enter replacement text that differs from the current PDF text.',
          ],
        });
        return;
      }

      const controller =
        new AbortController();
      setChecking(true);
      setCapability(null);

      try {
        const next =
          await evaluateExistingTextUiCapability({
            pdfBytes:
              workingBytes,
            currentRevisionId:
              documentKey,
            span:
              selectedSpan,
            replacementText,
            signal:
              controller.signal,
          });
        setCapability(next);
      } catch (error) {
        if (
          isOperationCancelledError(
            error,
          )
        ) {
          return;
        }
        setCapability({
          status: 'unavailable',
          reasons: [
            error instanceof Error
              ? error.message
              : String(error),
          ],
        });
      } finally {
        setChecking(false);
      }
    };

  const replaceNative =
    async () => {
      if (
        !workingBytes
        || !documentKey
        || !selectedSpan
        || capability?.status
          !== 'native'
      ) {
        return;
      }

      setReplacing(true);
      try {
        const result =
          await commandBus.execute({
            workingBytes,
            command:
              materializePdfCommand(
                {
                  type:
                    'REPLACE_EXISTING_TEXT',
                  payload: {
                    schemaVersion: 1,
                    span:
                      selectedSpan,
                    intent:
                      capability.intent,
                    provenance:
                      capability
                        .provenance,
                  },
                },
                'toolbar',
                documentKey,
              ),
          });

        if (!result.success) {
          addToast({
            type: 'error',
            title:
              'Text replacement failed',
            message:
              result.error
                ?.message
              ?? result.message,
          });
          return;
        }

        addToast({
          type: 'success',
          title:
            'Existing text replaced',
          message:
            result.message,
        });
        setCapability(null);
      } catch (error) {
        addToast({
          type: 'error',
          title:
            'Text replacement failed',
          message:
            error instanceof Error
              ? error.message
              : String(error),
        });
      } finally {
        setReplacing(false);
      }
    };

  const canInspect =
    Boolean(
      workingBytes
      && documentKey
      && pageNode,
    );

  return (
    <div
      className="p-4 space-y-4"
      data-testid="existing-text-inspector"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <FileText className="h-4 w-4" />
          Existing PDF text
        </div>
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
          Inspect page {viewState.currentPage} text and check whether a replacement
          can use the bounded native PDF path.
        </p>
      </div>

      {!canInspect && (
        <StatusCard tone="neutral">
          Existing-text editing needs an active revision, working PDF bytes and
          stable PageId metadata.
        </StatusCard>
      )}

      {canInspect
        && inspection.status
          === 'loading' && (
        <StatusCard tone="neutral">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Inspecting page text…
          </span>
        </StatusCard>
      )}

      {inspection.status
        === 'error' && (
        <StatusCard tone="danger">
          {inspection.message}
        </StatusCard>
      )}

      {inspection.status
        === 'ready'
        && inspection.spans.length
          === 0 && (
        <StatusCard tone="neutral">
          No inspectable PDF.js text spans were found on this page.
        </StatusCard>
      )}

      {inspection.spans.length > 0 && (
        <>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Text span
            </span>
            <select
              data-testid="existing-text-span-select"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={
                selectedSpanId
                ?? ''
              }
              onChange={(event) => {
                const nextId =
                  event.target.value
                  || null;
                setSelectedSpanId(
                  nextId,
                );

                const nextSpan =
                  inspection.spans.find(
                    (span) =>
                      span.id
                      === nextId,
                  ) ?? null;
                setExistingTextSelection(
                  nextSpan
                    ? {
                        revisionId:
                          nextSpan.revisionId,
                        pageId:
                          nextSpan.pageId,
                        sourceIndex:
                          nextSpan.sourceIndex,
                      }
                    : null,
                );
              }}
            >
              {inspection.spans.map(
                (span) => (
                  <option
                    key={span.id}
                    value={span.id}
                  >
                    {truncate(
                      span.text,
                      46,
                    )}
                    {' — '}
                    {classificationLabel(
                      span,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          {selectedSpan && (
            <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Source
                </span>
                <span
                  className={classificationClass(
                    selectedSpan,
                  )}
                >
                  {classificationLabel(
                    selectedSpan,
                  )}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-800 dark:text-slate-200">
                {selectedSpan.text}
              </p>
              <div className="mt-2 text-[10px] text-slate-500">
                PageId {selectedSpan.pageId}
              </div>
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Replacement
            </span>
            <textarea
              data-testid="existing-text-replacement-input"
              className="min-h-20 w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={replacementText}
              onChange={(event) => {
                setReplacementText(
                  event.target.value,
                );
                setCapability(null);
              }}
              disabled={
                !selectedSpan
                || selectedSpan
                  .editability
                  === 'unsupported'
                || checking
                || replacing
              }
            />
          </label>

          <Button
            data-testid="existing-text-check-btn"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={
              !selectedSpan
              || selectedSpan
                .editability
                === 'unsupported'
              || checking
              || replacing
            }
            onClick={() =>
              void checkEdit()
            }
          >
            {checking ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Checking…
              </>
            ) : (
              'Check edit'
            )}
          </Button>
        </>
      )}

      {capability?.status
        === 'native' && (
        <StatusCard tone="success">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">
                Native replacement available
              </div>
              <div className="mt-1 text-[11px] opacity-90">
                Projected advance {formatPt(capability.nativeFit.projectedReplacementAdvancePt)}
                {' / '}
                observed {formatPt(capability.nativeFit.observedAdvancePt)}.
                The edit will use the canonical history path.
              </div>
            </div>
          </div>
          <Button
            data-testid="existing-text-replace-btn"
            size="sm"
            className="mt-3 w-full"
            disabled={replacing}
            onClick={() =>
              void replaceNative()
            }
          >
            {replacing
              ? 'Replacing…'
              : 'Replace existing text'}
          </Button>
        </StatusCard>
      )}

      {capability?.status
        === 'fallback-proved' && (
        <StatusCard tone="warning">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">
                Replacement is too wide; fallback evidence is proved
              </div>
              <div className="mt-1 text-[11px] opacity-90">
                A solid background and foreign-paint-free clearance region were
                proved for this revision. Reconstructed overlay execution is not
                available yet, so no mutation action is exposed.
              </div>
            </div>
          </div>
        </StatusCard>
      )}

      {capability?.status
        === 'unavailable' && (
        <StatusCard tone="danger">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">
                Editing unavailable
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] opacity-90">
                {capability.reasons
                  .slice(0, 4)
                  .map(
                    (
                      reason,
                      index,
                    ) => (
                      <li
                        key={`${reason}-${index}`}
                      >
                        {humanizeReason(
                          reason,
                        )}
                      </li>
                    ),
                  )}
              </ul>
            </div>
          </div>
        </StatusCard>
      )}
    </div>
  );
};

const StatusCard: React.FC<{
  tone:
    | 'neutral'
    | 'success'
    | 'warning'
    | 'danger';
  children: React.ReactNode;
}> = ({
  tone,
  children,
}) => {
  const classes = {
    neutral:
      'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
    success:
      'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100',
    warning:
      'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100',
    danger:
      'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100',
  } as const;

  return (
    <div
      className={`rounded-md border p-3 text-xs leading-5 ${classes[tone]}`}
    >
      {children}
    </div>
  );
};

function classificationLabel(
  span: ExistingTextSpan,
): string {
  switch (span.editability) {
    case 'native-replacement-candidate':
      return 'Native candidate';
    case 'reconstructed-candidate':
      return 'Reconstructed candidate';
    case 'unsupported':
      return 'Unsupported';
  }
}

function classificationClass(
  span: ExistingTextSpan,
): string {
  const base =
    'rounded-full px-2 py-0.5 text-[10px] font-medium';
  switch (span.editability) {
    case 'native-replacement-candidate':
      return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200`;
    case 'reconstructed-candidate':
      return `${base} bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200`;
    case 'unsupported':
      return `${base} bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300`;
  }
}

function truncate(
  value: string,
  max: number,
): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function formatPt(
  value: number,
): string {
  return `${value.toFixed(2)} pt`;
}

function humanizeReason(
  value: string,
): string {
  if (
    /^[A-Z0-9_]+$/.test(value)
  ) {
    return value
      .toLowerCase()
      .replaceAll('_', ' ');
  }
  return value;
}
