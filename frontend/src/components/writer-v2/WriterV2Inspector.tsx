import React from 'react';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  bringSelectedWriterElementToFront,
  deleteSelectedWriterElements,
  duplicateSelectedWriterElements,
  hideSelectedWriterElements,
  sendSelectedWriterElementToBack,
  showAllWriterElements,
  toggleLockSelectedWriterElements,
} from '@/core/writer-v2/writerSelectionActions';
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
  const isText = selected.type === 'richTextBox' || selected.type === 'textCallout';
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
