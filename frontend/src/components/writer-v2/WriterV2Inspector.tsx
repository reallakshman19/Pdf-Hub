import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
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

function NumberInput({ value, onChange, min, max, step = 1, style }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; style?: React.CSSProperties;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
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

export const WriterV2Inspector: React.FC = () => {
  const imageReplaceInputRef = React.useRef<HTMLInputElement | null>(null);
  const elements = useWriterV2Store((state) => state.elements);
  const activeId = useWriterV2Store((state) => state.activeId);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);

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
          onClick={() => showAllWriterElements()}
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

  const patchStyle = (patch: Partial<typeof style>) => {
    dispatchWriterCommand({
      type: 'UPDATE_WRITER_ELEMENT',
      id: selected.id,
      patch: { style: { ...style, ...patch } },
    });
  };

  const patchRect = (patch: Partial<typeof selected.rect>) => {
    dispatchWriterCommand({
      type: 'UPDATE_WRITER_ELEMENT',
      id: selected.id,
      patch: { rect: { ...selected.rect, ...patch } },
    });
  };

  const patchCallout = (patch: Partial<NonNullable<typeof selected.callout>>) => {
    if (!selected.callout) return;
    dispatchWriterCommand({
      type: 'UPDATE_WRITER_ELEMENT',
      id: selected.id,
      patch: { callout: { ...selected.callout, ...patch } },
    });
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
          <NumberInput value={Math.round(selected.rect.x)} onChange={(v) => patchRect({ x: v })} />
          <NumberInput value={Math.round(selected.rect.y)} onChange={(v) => patchRect({ y: v })} />
        </Row>
        <Row>
          <Label>W / H</Label>
          <NumberInput value={Math.round(selected.rect.width)} min={12} onChange={(v) => patchRect({ width: v })} />
          <NumberInput value={Math.round(selected.rect.height)} min={12} onChange={(v) => patchRect({ height: v })} />
        </Row>
      </Section>

      {/* Text — only for text element types */}
      {isText && (
        <Section title="Text">
          <Row>
            <Label>Font</Label>
            <select
              value={style.fontFamily ?? 'Inter'}
              onChange={(e) => patchStyle({ fontFamily: e.target.value })}
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
              onChange={(e) => patchStyle({ fontSize: Number(e.target.value) })}
              style={{
                width: 60, height: 24, borderRadius: 5, border: '1px solid #e2e8f0',
                fontSize: 11, background: '#f8fafc', cursor: 'pointer',
              }}
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ColorPickerPopover
              value={style.textColor ?? '#111827'}
              onChange={(v) => patchStyle({ textColor: v })}
              label="Color"
            />
          </Row>
        </Section>
      )}

      {/* Fill & Stroke */}
      <Section title="Fill & Stroke">
        <Row>
          <ColorPickerPopover
            value={style.backgroundColor ?? '#ffffff'}
            onChange={(v) => patchStyle({ backgroundColor: v })}
            label="Fill"
          />
        </Row>
        <Row>
          <ColorPickerPopover
            value={style.borderColor ?? '#2563eb'}
            onChange={(v) => patchStyle({ borderColor: v })}
            label="Border"
          />
          <NumberInput
            value={style.borderWidth ?? 1}
            min={0}
            max={20}
            onChange={(v) => patchStyle({ borderWidth: v })}
            style={{ width: 44 }}
          />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>px</span>
        </Row>
        <Row>
          <Label>Opacity</Label>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={style.opacity ?? 1}
            onChange={(e) => patchStyle({ opacity: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, color: '#64748b', width: 28, textAlign: 'right' }}>
            {Math.round((style.opacity ?? 1) * 100)}%
          </span>
        </Row>
      </Section>

      {/* Callout — only for textCallout */}
      {isCallout && selected.callout && (
        <Section title="Callout">
          <Row>
            <Label>Leader</Label>
            <select
              value={selected.callout.leaderStyle}
              onChange={(e) => patchCallout({ leaderStyle: e.target.value as 'none' | 'line' | 'arrow' })}
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
                <ColorPickerPopover
                  value={selected.callout.leaderColor}
                  onChange={(v) => patchCallout({ leaderColor: v })}
                  label="Color"
                />
              </Row>
              <Row>
                <Label>Width</Label>
                <NumberInput
                  value={selected.callout.leaderWidth}
                  min={1}
                  max={20}
                  onChange={(v) => patchCallout({ leaderWidth: v })}
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
              onClick={() => addActiveTableRow()}
              style={btnStyle}
            >
              + Row
            </button>
            <button
              type="button"
              onClick={() => removeActiveTableRow()}
              style={btnStyle}
            >
              - Row
            </button>
            <button
              type="button"
              onClick={() => addActiveTableColumn()}
              style={btnStyle}
            >
              + Col
            </button>
            <button
              type="button"
              onClick={() => removeActiveTableColumn()}
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
                <input
                  key={column.id}
                  aria-label={`Column label ${column.label ?? column.id}`}
                  value={column.label ?? ''}
                  onChange={(event) =>
                    updateActiveTableColumnLabel(column.id, event.currentTarget.value)
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
                    <input
                      key={cell?.id ?? `${row.id}-${column.id}`}
                      aria-label={`Table cell ${rowIndex + 1}-${columnIndex + 1}`}
                      value={cell?.text ?? ''}
                      onChange={(event) => {
                        if (!cell) return;
                        updateActiveTableCell(row.id, cell.id, event.currentTarget.value);
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
              onClick={() => clearActiveImageBoxAsset()}
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
                onClick={() => ensureActiveWriterReviewMetadata()}
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
                  onChange={(event) =>
                    updateActiveWriterReviewMetadata({
                      status: event.currentTarget.value as WriterReviewStatus,
                    })
                  }
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
                  onChange={(event) =>
                    updateActiveWriterReviewMetadata({
                      priority: event.currentTarget.value as WriterReviewPriority,
                    })
                  }
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
                  onChange={(event) =>
                    updateActiveWriterReviewMetadata({
                      category: event.currentTarget.value as WriterReviewCategory,
                    })
                  }
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
                <input
                  value={selected.review.assignee ?? ''}
                  onChange={(event) =>
                    updateActiveWriterReviewMetadata({
                      assignee: event.currentTarget.value,
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
                  onChange={(event) =>
                    updateActiveWriterReviewMetadata({
                      dueDate: event.currentTarget.value,
                    })
                  }
                  style={inputStyle}
                />
              </Row>

              <Row>
                <button
                  type="button"
                  onClick={() => markActiveWriterReviewResolved()}
                  style={btnStyle}
                >
                  Mark Resolved
                </button>
                <button
                  type="button"
                  onClick={() => clearActiveWriterReviewMetadata()}
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
            onClick={() => alignSelectedWriterElements('left')}
            title="Align left"
            style={btnStyle}
          >
            Align L
          </button>
          <button
            type="button"
            onClick={() => alignSelectedWriterElements('center')}
            title="Align center"
            style={btnStyle}
          >
            Align C
          </button>
          <button
            type="button"
            onClick={() => alignSelectedWriterElements('right')}
            title="Align right"
            style={btnStyle}
          >
            Align R
          </button>
        </Row>

        <Row>
          <button
            type="button"
            onClick={() => alignSelectedWriterElements('top')}
            title="Align top"
            style={btnStyle}
          >
            Align T
          </button>
          <button
            type="button"
            onClick={() => alignSelectedWriterElements('middle')}
            title="Align middle"
            style={btnStyle}
          >
            Align M
          </button>
          <button
            type="button"
            onClick={() => alignSelectedWriterElements('bottom')}
            title="Align bottom"
            style={btnStyle}
          >
            Align B
          </button>
        </Row>

        <Row>
          <button
            type="button"
            onClick={() => distributeSelectedWriterElements('horizontal')}
            title="Distribute horizontally"
            style={btnStyle}
          >
            Dist H
          </button>
          <button
            type="button"
            onClick={() => distributeSelectedWriterElements('vertical')}
            title="Distribute vertically"
            style={btnStyle}
          >
            Dist V
          </button>
        </Row>

        <Row>
          <button
            type="button"
            onClick={() => nudgeSelectedWriterElements(-1, 0)}
            title="Nudge left"
            style={btnStyle}
          >
            Left
          </button>
          <button
            type="button"
            onClick={() => nudgeSelectedWriterElements(0, 1)}
            title="Nudge up"
            style={btnStyle}
          >
            Up
          </button>
          <button
            type="button"
            onClick={() => nudgeSelectedWriterElements(0, -1)}
            title="Nudge down"
            style={btnStyle}
          >
            Down
          </button>
          <button
            type="button"
            onClick={() => nudgeSelectedWriterElements(1, 0)}
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
          <button type="button" onClick={() => bringSelectedWriterElementToFront()} title="Bring to front"
            style={btnStyle}>↑ Front</button>
          <button type="button" onClick={() => sendSelectedWriterElementToBack()} title="Send to back"
            style={btnStyle}>↓ Back</button>
        </Row>
        <Row>
          <button type="button" onClick={() => duplicateSelectedWriterElements()} title="Duplicate"
            aria-label="Duplicate"
            style={btnStyle}>⧉ Dup</button>
          <button type="button" onClick={() => toggleLockSelectedWriterElements()} title={selected.locked ? 'Unlock' : 'Lock'}
            aria-label={selected.locked ? 'Unlock' : 'Lock'}
            style={btnStyle}>{selected.locked ? '🔓' : '🔒'} {selected.locked ? 'Unlock' : 'Lock'}</button>
        </Row>
        {hasHidden && (
          <Row>
            <button type="button" onClick={() => showAllWriterElements()} style={{ ...btnStyle, flex: 1 }}>
              Show Hidden
            </button>
          </Row>
        )}
        <button type="button" onClick={() => hideSelectedWriterElements()} style={{ ...btnStyle, width: '100%' }}>
          Hide
        </button>
      </Section>

      {/* Delete */}
      <div style={{ padding: '8px 12px' }}>
        <button
          type="button"
          aria-label="Delete"
          onClick={() => deleteSelectedWriterElements()}
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
