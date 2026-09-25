import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  dispatchDurableWriterUiCommand,
} from '@/core/writer-v2/durableWriterUiDispatch';
import type {
  WriterV2CommandResult,
} from '@/core/writer-v2/writerCommandStore';
import type {
  WriterElementPatch,
} from '@/core/writer-v2/writerCommands';
import {
  alignSelectedWriterElements,
  bringSelectedWriterElementToFront,
  deleteSelectedWriterElements,
  distributeSelectedWriterElements,
  duplicateSelectedWriterElements,
  hideSelectedWriterElements,
  nudgeSelectedWriterElements,
  sendSelectedWriterElementToBack,
  showAllWriterElements,
  toggleLockSelectedWriterElements,
} from '@/core/writer-v2/writerSelectionActions';
import {
  addActiveTableColumn,
  addActiveTableRow,
  removeActiveTableColumn,
  removeActiveTableRow,
  updateActiveTableCell,
  updateActiveTableColumnLabel,
} from '@/core/writer-v2/writerTableBoxActions';
import {
  clearActiveImageBoxAsset,
  replaceActiveImageBoxAsset,
} from '@/core/writer-v2/writerImageBoxActions';
import {
  clearActiveWriterReviewMetadata,
  ensureActiveWriterReviewMetadata,
  isReviewableWriterElement,
  markActiveWriterReviewResolved,
  updateActiveWriterReviewMetadata,
} from '@/core/writer-v2/writerReviewActions';
import type {
  WriterElementV2,
  WriterReviewCategory,
  WriterReviewPriority,
  WriterReviewStatus,
} from '@/core/writer-v2/types';
import { ColorPickerPopover } from '@/components/ui/ColorPickerPopover';

const FONT_FAMILIES = [
  'Inter', 'IBM Plex Sans', 'Georgia', 'Arial',
  'Times New Roman', 'Courier New', 'Trebuchet MS',
];

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, color: '#64748b', width: 48, flexShrink: 0 }}>{children}</span>;
}

interface DraftCommitResult {
  changed: boolean;
}

function DraftTextInput({
  value,
  onCommit,
  resetKey,
  style,
  ariaLabel,
}: {
  value: string;
  onCommit: (
    value: string,
  ) => Promise<DraftCommitResult>;
  resetKey: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const [draft, setDraft] =
    React.useState(value);
  const cancelBlurRef =
    React.useRef(false);

  React.useEffect(() => {
    setDraft(value);
    cancelBlurRef.current = false;
  }, [resetKey, value]);

  const commit = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      setDraft(value);
      return;
    }

    if (draft === value) return;

    void onCommit(draft)
      .then((result) => {
        if (!result.changed) {
          setDraft(value);
        }
      })
      .catch(() => {
        setDraft(value);
      });
  };

  return (
    <input
      value={draft}
      onChange={(event) =>
        setDraft(
          event.currentTarget.value,
        )
      }
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
          return;
        }

        if (event.key === 'Escape') {
          cancelBlurRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      style={style}
      aria-label={ariaLabel}
    />
  );
}

function DraftNumberInput({
  value,
  onCommit,
  resetKey,
  min,
  max,
  step = 1,
  style,
}: {
  value: number;
  onCommit: (
    value: number,
  ) => Promise<DraftCommitResult>;
  resetKey: string;
  min?: number;
  max?: number;
  step?: number;
  style?: React.CSSProperties;
}) {
  const [draft, setDraft] = React.useState(
    String(value),
  );
  const cancelBlurRef = React.useRef(false);

  React.useEffect(() => {
    setDraft(String(value));
    cancelBlurRef.current = false;
  }, [resetKey, value]);

  const commit = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      setDraft(String(value));
      return;
    }

    const parsed = Number(draft);

    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }

    const next = Math.max(
      min ?? Number.NEGATIVE_INFINITY,
      Math.min(
        max ?? Number.POSITIVE_INFINITY,
        parsed,
      ),
    );

    setDraft(String(next));

    if (next === value) return;

    void onCommit(next)
      .then((result) => {
        if (!result.changed) {
          setDraft(String(value));
        }
      })
      .catch(() => {
        setDraft(String(value));
      });
  };

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      onChange={(event) =>
        setDraft(event.currentTarget.value)
      }
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
          return;
        }

        if (event.key === 'Escape') {
          cancelBlurRef.current = true;
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
      style={{
        height: 24,
        borderRadius: 5,
        border: '1px solid #e2e8f0',
        padding: '0 5px',
        fontSize: 11,
        width: 52,
        background: '#f8fafc',
        ...style,
      }}
    />
  );
}

function DraftOpacityInput({
  value,
  onCommit,
  resetKey,
}: {
  value: number;
  onCommit: (
    value: number,
  ) => Promise<DraftCommitResult>;
  resetKey: string;
}) {
  const [draft, setDraft] =
    React.useState(value);
  const lastCommittedRef =
    React.useRef(value);

  React.useEffect(() => {
    setDraft(value);
    lastCommittedRef.current = value;
  }, [resetKey, value]);

  const commit = () => {
    if (draft === lastCommittedRef.current) {
      return;
    }

    const previous =
      lastCommittedRef.current;
    lastCommittedRef.current = draft;

    void onCommit(draft)
      .then((result) => {
        if (!result.changed) {
          lastCommittedRef.current = previous;
          setDraft(value);
        }
      })
      .catch(() => {
        lastCommittedRef.current = previous;
        setDraft(value);
      });
  };

  return (
    <>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={draft}
        onChange={(event) =>
          setDraft(
            Number(event.currentTarget.value),
          )
        }
        onPointerUp={commit}
        onKeyUp={(event) => {
          if (
            event.key.startsWith('Arrow')
            || event.key === 'Home'
            || event.key === 'End'
          ) {
            commit();
          }
        }}
        onBlur={commit}
        style={{ flex: 1 }}
      />
      <span
        style={{
          fontSize: 11,
          color: '#64748b',
          width: 28,
          textAlign: 'right',
        }}
      >
        {Math.round(draft * 100)}%
      </span>
    </>
  );
}

function DraftColorPicker({
  value,
  onCommit,
  resetKey,
  label,
}: {
  value: string;
  onCommit: (
    value: string,
  ) => Promise<DraftCommitResult>;
  resetKey: string;
  label: string;
}) {
  const [draft, setDraft] =
    React.useState(value);
  const timerRef =
    React.useRef<number | null>(null);

  React.useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDraft(value);
  }, [resetKey, value]);

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const scheduleCommit = (next: string) => {
    setDraft(next);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        if (next === value) return;

        void onCommit(next)
          .then((result) => {
            if (!result.changed) {
              setDraft(value);
            }
          })
          .catch(() => {
            setDraft(value);
          });
      },
      250,
    );
  };

  return (
    <ColorPickerPopover
      value={draft}
      onChange={scheduleCommit}
      label={label}
    />
  );
}

export const WriterV2Inspector: React.FC = () => {
  const imageReplaceInputRef = React.useRef<HTMLInputElement | null>(null);
  const elements = useWriterV2Store((state) => state.elements);
  const activeId = useWriterV2Store((state) => state.activeId);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const inspectorCommitTailRef =
    React.useRef<Promise<void>>(
      Promise.resolve(),
    );

  const queueInspectorPatch =
    React.useCallback((
      elementId: string,
      context: string,
      buildPatch: (
        element: WriterElementV2,
      ) => WriterElementPatch,
    ): Promise<WriterV2CommandResult> => {
      const run =
        inspectorCommitTailRef.current.then(
          async () => {
            const element =
              useWriterV2Store
                .getState()
                .elements
                .find(
                  (item) =>
                    item.id === elementId,
                );

            if (!element) {
              throw new Error(
                `Writer Inspector target "${elementId}" no longer exists.`,
              );
            }

            return dispatchDurableWriterUiCommand(
              {
                type: 'UPDATE_WRITER_ELEMENT',
                id: elementId,
                patch: buildPatch(element),
              },
              context,
            );
          },
        );

      inspectorCommitTailRef.current =
        run.then(
          () => undefined,
          () => undefined,
        );

      return run;
    }, []);

  const selected =
    elements.find((el) => el.id === activeId) ??
    elements.find((el) => selectedIds.includes(el.id)) ??
    null;

  const hasHidden = elements.some((el) => el.hidden);

  if (!selected && !hasHidden) return null;

  if (!selected && hasHidden) {
    return (
      <div
        data-writer-v2-inspector="empty"
        style={{
          position: 'fixed', right: 16, top: 76, zIndex: 200,
          background: '#ffffff', border: '1px solid #e2e8f0',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
          width: 224, padding: '10px 12px',
        }}
      >
        <button
          type="button"
          onClick={() => { void showAllWriterElements(); }}
          style={{
            width: '100%', height: 28, borderRadius: 6, border: '1px solid #cbd5e1',
            background: '#f8fafc', fontSize: 12, cursor: 'pointer', color: '#374151',
          }}
        >
          Show all hidden elements
        </button>
      </div>
    );
  }

  if (!selected) return null;

  const style = selected.style;
  const isTableBox = selected.type === 'tableBox';
  const isImageBox = selected.type === 'imageBox';
  const isReviewable = isReviewableWriterElement(selected);
  const isText =
    selected.type === 'richTextBox' ||
    selected.type === 'textCallout' ||
    selected.type === 'reviewLabel' ||
    selected.type === 'textStamp' ||
    selected.type === 'richNote';
  const isCallout = selected.type === 'textCallout';

  const patchStyle = (
    patch: Partial<typeof style>,
  ) =>
    queueInspectorPatch(
      selected.id,
      'WriterV2Inspector style',
      (latest) => ({
        style: {
          ...latest.style,
          ...patch,
        },
      }),
    );

  const patchRect = (
    patch: Partial<typeof selected.rect>,
  ) =>
    queueInspectorPatch(
      selected.id,
      'WriterV2Inspector transform',
      (latest) => ({
        rect: {
          ...latest.rect,
          ...patch,
        },
      }),
    );

  const patchCallout = (
    patch: Partial<
      NonNullable<typeof selected.callout>
    >,
  ) => {
    if (!selected.callout) {
      return Promise.resolve({
        state: {
          elements: [],
          selectedIds: [],
          activeId: null,
          undoStack: [],
          redoStack: [],
          dirty: false,
        },
        changed: false,
        reason:
          'Selected Writer element has no callout.',
      });
    }

    return queueInspectorPatch(
      selected.id,
      'WriterV2Inspector callout',
      (latest) => ({
        callout: {
          ...(latest.callout
            ?? selected.callout!),
          ...patch,
        },
      }),
    );
  };

  return (
    <div
      data-writer-v2-inspector="active"
      aria-label="Writer V2 inspector"
      style={{
        position: 'fixed',
        right: 16,
        top: 76,
        zIndex: 200,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
        width: 224,
        maxHeight: 'calc(100vh - 96px)',
        overflowY: 'auto',
        fontFamily: 'inherit',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{selected.type}</span>
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>
            p{selected.pageIndex + 1} · {Math.round(selected.rect.width)}×{Math.round(selected.rect.height)}
          </span>
        </div>
        <button
          type="button"
          title="Deselect"
          onClick={() => dispatchWriterCommand({ type: 'CLEAR_WRITER_SELECTION' })}
          style={{ fontSize: 14, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Transform */}
      <Section title="Transform">
        <Row>
          <Label>X / Y</Label>
          <DraftNumberInput
            value={Math.round(selected.rect.x)}
            resetKey={selected.id}
            onCommit={(value) =>
              patchRect({ x: value })
            }
          />
          <DraftNumberInput
            value={Math.round(selected.rect.y)}
            resetKey={selected.id}
            onCommit={(value) =>
              patchRect({ y: value })
            }
          />
        </Row>
        <Row>
          <Label>W / H</Label>
          <DraftNumberInput
            value={Math.round(selected.rect.width)}
            resetKey={selected.id}
            min={12}
            onCommit={(value) =>
              patchRect({ width: value })
            }
          />
          <DraftNumberInput
            value={Math.round(selected.rect.height)}
            resetKey={selected.id}
            min={12}
            onCommit={(value) =>
              patchRect({ height: value })
            }
          />
        </Row>
      </Section>

      {/* Text — only for text element types */}
      {isText && (
        <Section title="Text">
          <Row>
            <Label>Font</Label>
            <select
              value={style.fontFamily ?? 'Inter'}
              onChange={(event) => {
                void patchStyle({
                  fontFamily:
                    event.currentTarget.value,
                }).catch(() => undefined);
              }}
              style={{
                flex: 1, height: 24, borderRadius: 5, border: '1px solid #e2e8f0',
                fontSize: 11, background: '#f8fafc', cursor: 'pointer',
              }}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Row>
          <Row>
            <Label>Size</Label>
            <select
              value={style.fontSize ?? 14}
              onChange={(event) => {
                void patchStyle({
                  fontSize: Number(
                    event.currentTarget.value,
                  ),
                }).catch(() => undefined);
              }}
              style={{
                width: 60, height: 24, borderRadius: 5, border: '1px solid #e2e8f0',
                fontSize: 11, background: '#f8fafc', cursor: 'pointer',
              }}
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <DraftColorPicker
              value={style.textColor ?? '#111827'}
              resetKey={selected.id}
              onCommit={(value) =>
                patchStyle({
                  textColor: value,
                })
              }
              label="Color"
            />
          </Row>
        </Section>
      )}

      {/* Fill & Stroke */}
      <Section title="Fill & Stroke">
        <Row>
          <DraftColorPicker
            value={style.backgroundColor ?? '#ffffff'}
            resetKey={selected.id}
            onCommit={(value) =>
              patchStyle({
                backgroundColor: value,
              })
            }
            label="Fill"
          />
        </Row>
        <Row>
          <DraftColorPicker
            value={style.borderColor ?? '#2563eb'}
            resetKey={selected.id}
            onCommit={(value) =>
              patchStyle({
                borderColor: value,
              })
            }
            label="Border"
          />
          <DraftNumberInput
            value={style.borderWidth ?? 1}
            resetKey={selected.id}
            min={0}
            max={20}
            onCommit={(value) =>
              patchStyle({
                borderWidth: value,
              })
            }
            style={{ width: 44 }}
          />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>px</span>
        </Row>
        <Row>
          <Label>Opacity</Label>
          <DraftOpacityInput
            value={style.opacity ?? 1}
            resetKey={selected.id}
            onCommit={(value) =>
              patchStyle({
                opacity: value,
              })
            }
          />
        </Row>
      </Section>

      {/* Callout — only for textCallout */}
      {isCallout && selected.callout && (
        <Section title="Callout">
          <Row>
            <Label>Leader</Label>
            <select
              value={selected.callout.leaderStyle}
              onChange={(event) => {
                void patchCallout({
                  leaderStyle:
                    event.currentTarget.value as 'none' | 'line' | 'arrow',
                }).catch(() => undefined);
              }}
              style={{
                flex: 1, height: 24, borderRadius: 5, border: '1px solid #e2e8f0',
                fontSize: 11, background: '#f8fafc', cursor: 'pointer',
              }}
            >
              <option value="none">None</option>
              <option value="line">Line</option>
              <option value="arrow">Arrow</option>
            </select>
          </Row>
          {selected.callout.leaderStyle !== 'none' && (
            <>
              <Row>
                <DraftColorPicker
                  value={selected.callout.leaderColor}
                  resetKey={selected.id}
                  onCommit={(value) =>
                    patchCallout({
                      leaderColor: value,
                    })
                  }
                  label="Color"
                />
              </Row>
              <Row>
                <Label>Width</Label>
                <DraftNumberInput
                  value={selected.callout.leaderWidth}
                  resetKey={selected.id}
                  min={1}
                  max={20}
                  onCommit={(value) =>
                    patchCallout({
                      leaderWidth: value,
                    })
                  }
                  style={{ width: 44 }}
                />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>px</span>
              </Row>
            </>
          )}
        </Section>
      )}

      {isTableBox && selected.tableData ? (
        <Section title="Table">
          <Row>
            <button
              type="button"
              onClick={() => { void addActiveTableRow(); }}
              style={btnStyle}
            >
              + Row
            </button>
            <button
              type="button"
              onClick={() => { void removeActiveTableRow(); }}
              style={btnStyle}
            >
              - Row
            </button>
            <button
              type="button"
              onClick={() => { void addActiveTableColumn(); }}
              style={btnStyle}
            >
              + Col
            </button>
            <button
              type="button"
              onClick={() => { void removeActiveTableColumn(); }}
              style={btnStyle}
            >
              - Col
            </button>
          </Row>

          <div
            style={{
              display: 'grid',
              gap: 6,
              maxHeight: 240,
              overflow: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: 6,
              background: '#f8fafc',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${selected.tableData.columns.length}, minmax(70px, 1fr))`,
                gap: 4,
              }}
            >
              {selected.tableData.columns.map((column) => (
                <DraftTextInput
                  key={column.id}
                  ariaLabel={`Column label ${column.label ?? column.id}`}
                  resetKey={`${selected.id}:${column.id}`}
                  value={column.label ?? ''}
                  onCommit={(value) =>
                    updateActiveTableColumnLabel(
                      column.id,
                      value,
                    )
                  }
                  style={tableInputStyle}
                />
              ))}
            </div>

            {selected.tableData.rows.map((row, rowIndex) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${selected.tableData?.columns.length ?? 1}, minmax(70px, 1fr))`,
                  gap: 4,
                }}
              >
                {selected.tableData?.columns.map((column, columnIndex) => {
                  const cell = row.cells[columnIndex];

                  return (
                    <DraftTextInput
                      key={cell?.id ?? `${row.id}-${column.id}`}
                      ariaLabel={`Table cell ${rowIndex + 1}-${columnIndex + 1}`}
                      resetKey={`${selected.id}:${row.id}:${cell?.id ?? column.id}`}
                      value={cell?.text ?? ''}
                      onCommit={(value) => {
                        if (!cell) {
                          return Promise.resolve({
                            changed: false,
                          });
                        }

                        return updateActiveTableCell(
                          row.id,
                          cell.id,
                          value,
                        );
                      }}
                      style={tableInputStyle}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {isImageBox ? (
        <Section title="Image">
          <Row>
            <button
              type="button"
              onClick={() => imageReplaceInputRef.current?.click()}
              style={btnStyle}
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => { void clearActiveImageBoxAsset(); }}
              style={btnStyle}
            >
              Clear
            </button>
          </Row>

          <Row>
            <Label>Asset</Label>
            <span
              style={{
                flex: 1,
                fontSize: 11,
                color: selected.imageAssetId ? '#334155' : '#dc2626',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={selected.imageAssetId ?? 'Missing asset'}
            >
              {selected.imageAssetId ?? 'Missing asset'}
            </span>
          </Row>

          <input
            ref={imageReplaceInputRef}
            aria-label="Replace selected Writer image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];

              if (file) {
                void replaceActiveImageBoxAsset(file);
              }

              event.currentTarget.value = '';
            }}
          />
        </Section>
      ) : null}

      {isReviewable ? (
        <Section title="Review">
          {!selected.review ? (
            <Row>
              <button
                type="button"
                onClick={() => { void ensureActiveWriterReviewMetadata(); }}
                style={btnStyle}
              >
                Add Review Metadata
              </button>
            </Row>
          ) : (
            <>
              <Row>
                <Label>Status</Label>
                <select
                  value={selected.review.status}
                  onChange={(event) => {
                    void updateActiveWriterReviewMetadata({
                      status:
                        event.currentTarget.value as WriterReviewStatus,
                    });
                  }}
                  style={selectStyle}
                >
                  <option value="open">Open</option>
                  <option value="inProgress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </Row>

              <Row>
                <Label>Priority</Label>
                <select
                  value={selected.review.priority}
                  onChange={(event) => {
                    void updateActiveWriterReviewMetadata({
                      priority:
                        event.currentTarget.value as WriterReviewPriority,
                    });
                  }}
                  style={selectStyle}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Row>

              <Row>
                <Label>Category</Label>
                <select
                  value={selected.review.category}
                  onChange={(event) => {
                    void updateActiveWriterReviewMetadata({
                      category:
                        event.currentTarget.value as WriterReviewCategory,
                    });
                  }}
                  style={selectStyle}
                >
                  <option value="general">General</option>
                  <option value="engineering">Engineering</option>
                  <option value="design">Design</option>
                  <option value="safety">Safety</option>
                  <option value="client">Client</option>
                  <option value="construction">Construction</option>
                  <option value="qa">QA</option>
                </select>
              </Row>

              <Row>
                <Label>Assignee</Label>
                <DraftTextInput
                  value={selected.review.assignee ?? ''}
                  resetKey={`${selected.id}:review-assignee`}
                  ariaLabel="Writer review assignee"
                  onCommit={(value) =>
                    updateActiveWriterReviewMetadata({
                      assignee: value,
                    })
                  }
                  style={inputStyle}
                />
              </Row>

              <Row>
                <Label>Due</Label>
                <input
                  type="date"
                  value={selected.review.dueDate ?? ''}
                  onChange={(event) => {
                    void updateActiveWriterReviewMetadata({
                      dueDate:
                        event.currentTarget.value,
                    });
                  }}
                  style={inputStyle}
                />
              </Row>

              <Row>
                <button
                  type="button"
                  onClick={() => { void markActiveWriterReviewResolved(); }}
                  style={btnStyle}
                >
                  Mark Resolved
                </button>
                <button
                  type="button"
                  onClick={() => { void clearActiveWriterReviewMetadata(); }}
                  style={btnStyle}
                >
                  Clear
                </button>
              </Row>
            </>
          )}
        </Section>
      ) : null}

      {/* Precision */}
      <Section title="Precision">
        <Row>
          <button
            type="button"
            onClick={() => { void alignSelectedWriterElements('left'); }}
            title="Align left"
            style={btnStyle}
          >
            Align L
          </button>
          <button
            type="button"
            onClick={() => { void alignSelectedWriterElements('center'); }}
            title="Align center"
            style={btnStyle}
          >
            Align C
          </button>
          <button
            type="button"
            onClick={() => { void alignSelectedWriterElements('right'); }}
            title="Align right"
            style={btnStyle}
          >
            Align R
          </button>
        </Row>

        <Row>
          <button
            type="button"
            onClick={() => { void alignSelectedWriterElements('top'); }}
            title="Align top"
            style={btnStyle}
          >
            Align T
          </button>
          <button
            type="button"
            onClick={() => { void alignSelectedWriterElements('middle'); }}
            title="Align middle"
            style={btnStyle}
          >
            Align M
          </button>
          <button
            type="button"
            onClick={() => { void alignSelectedWriterElements('bottom'); }}
            title="Align bottom"
            style={btnStyle}
          >
            Align B
          </button>
        </Row>

        <Row>
          <button
            type="button"
            onClick={() => { void distributeSelectedWriterElements('horizontal'); }}
            title="Distribute horizontally"
            style={btnStyle}
          >
            Dist H
          </button>
          <button
            type="button"
            onClick={() => { void distributeSelectedWriterElements('vertical'); }}
            title="Distribute vertically"
            style={btnStyle}
          >
            Dist V
          </button>
        </Row>

        <Row>
          <button
            type="button"
            onClick={() => { void nudgeSelectedWriterElements(-1, 0); }}
            title="Nudge left"
            style={btnStyle}
          >
            Left
          </button>
          <button
            type="button"
            onClick={() => { void nudgeSelectedWriterElements(0, 1); }}
            title="Nudge up"
            style={btnStyle}
          >
            Up
          </button>
          <button
            type="button"
            onClick={() => { void nudgeSelectedWriterElements(0, -1); }}
            title="Nudge down"
            style={btnStyle}
          >
            Down
          </button>
          <button
            type="button"
            onClick={() => { void nudgeSelectedWriterElements(1, 0); }}
            title="Nudge right"
            style={btnStyle}
          >
            Right
          </button>
        </Row>
      </Section>

      {/* Arrange */}
      <Section title="Arrange">
        <Row>
          <button type="button" onClick={() => { void bringSelectedWriterElementToFront(); }} title="Bring to front"
            style={btnStyle}>↑ Front</button>
          <button type="button" onClick={() => { void sendSelectedWriterElementToBack(); }} title="Send to back"
            style={btnStyle}>↓ Back</button>
        </Row>
        <Row>
          <button type="button" onClick={() => { void duplicateSelectedWriterElements(); }} title="Duplicate"
            aria-label="Duplicate"
            style={btnStyle}>⧉ Dup</button>
          <button type="button" onClick={() => { void toggleLockSelectedWriterElements(); }} title={selected.locked ? 'Unlock' : 'Lock'}
            aria-label={selected.locked ? 'Unlock' : 'Lock'}
            style={btnStyle}>{selected.locked ? '🔓' : '🔒'} {selected.locked ? 'Unlock' : 'Lock'}</button>
        </Row>
        {hasHidden && (
          <Row>
            <button type="button" onClick={() => { void showAllWriterElements(); }} style={{ ...btnStyle, flex: 1 }}>
              Show Hidden
            </button>
          </Row>
        )}
        <button type="button" onClick={() => { void hideSelectedWriterElements(); }} style={{ ...btnStyle, width: '100%' }}>
          Hide
        </button>
      </Section>

      {/* Delete */}
      <div style={{ padding: '8px 12px' }}>
        <button
          type="button"
          aria-label="Delete"
          onClick={() => { void deleteSelectedWriterElements(); }}
          style={{
            width: '100%', height: 28, borderRadius: 6,
            border: '1px solid #fca5a5', background: '#fff1f2',
            color: '#dc2626', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  flex: 1, height: 26, borderRadius: 6, border: '1px solid #e2e8f0',
  background: '#f8fafc', fontSize: 11, cursor: 'pointer', color: '#374151',
};

const tableInputStyle: React.CSSProperties = {
  minWidth: 0,
  height: 24,
  border: '1px solid #cbd5e1',
  borderRadius: 4,
  padding: '0 5px',
  fontSize: 11,
  background: '#ffffff',
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  height: 24,
  borderRadius: 5,
  border: '1px solid #e2e8f0',
  fontSize: 11,
  background: '#ffffff',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 24,
  borderRadius: 5,
  border: '1px solid #e2e8f0',
  fontSize: 11,
  padding: '0 6px',
  background: '#ffffff',
};
