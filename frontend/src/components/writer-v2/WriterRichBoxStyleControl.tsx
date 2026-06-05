import React from 'react';
import { PaintBucket } from 'lucide-react';
import { ColorPickerPopover } from '@/components/ui/ColorPickerPopover';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import {
  applyRichBoxStylePreset,
  getActiveRichBoxStyleTarget,
  patchActiveRichBoxStyle,
  WRITER_RICH_BOX_STYLE_PRESETS,
  type WriterRichBoxStylePresetId,
} from '@/core/writer-v2/writerRichBoxStyleActions';
import { fitActiveRichBoxToContent } from '@/core/writer-v2/writerRichBoxFitActions';

export const WriterRichBoxStyleControl: React.FC = () => {
  const elements = useWriterV2Store((state) => state.elements);
  const activeId = useWriterV2Store((state) => state.activeId);
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const editingId = useWriterV2Store((state) => state.editingId);
  const [open, setOpen] = React.useState(false);

  const target = React.useMemo(
    () => getActiveRichBoxStyleTarget(),
    [activeId, editingId, elements, selectedIds],
  );

  const style = target?.style;

  const fill = style?.backgroundColor ?? '#ffffff';
  const border = style?.borderColor ?? '#2563eb';
  const borderWidth = style?.borderWidth ?? 1;
  const padding = style?.padding ?? 8;
  const opacity = style?.opacity ?? 1;

  return (
    <div
      data-writer-rich-box-style-control="true"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Writer box style"
        title="Style Writer rich box background, border, padding, and opacity"
        onClick={() => setOpen((value) => !value)}
        style={{
          height: 30,
          borderRadius: 7,
          border: '1px solid #cbd5e1',
          background: open ? '#eff6ff' : '#ffffff',
          color: open ? '#1d4ed8' : '#334155',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 8px',
          fontSize: 11,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        <PaintBucket size={15} />
        Box
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Writer rich box style panel"
          style={{
            position: 'absolute',
            top: 36,
            left: 0,
            zIndex: 260,
            width: 260,
            padding: 10,
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            boxShadow: '0 14px 36px rgba(15, 23, 42, 0.18)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div>
            <div style={sectionTitleStyle}>Preset</div>
            <select
              aria-label="Writer box style preset"
              defaultValue=""
              onChange={(event) => {
                const value = event.currentTarget.value as WriterRichBoxStylePresetId;
                if (!value) return;
                void applyRichBoxStylePreset(value);
                event.currentTarget.value = '';
              }}
              style={selectStyle}
            >
              <option value="">Apply preset...</option>
              {WRITER_RICH_BOX_STYLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              void fitActiveRichBoxToContent();
            }}
            style={{
              height: 28,
              borderRadius: 6,
              border: '1px solid #93c5fd',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Fit content height
          </button>

          <div style={rowStyle}>
            <span style={labelStyle}>Fill</span>
            <ColorPickerPopover
              value={fill}
              onChange={(value) => {
                void patchActiveRichBoxStyle({ backgroundColor: value });
              }}
              label="Fill"
            />
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>Border</span>
            <ColorPickerPopover
              value={border}
              onChange={(value) => {
                void patchActiveRichBoxStyle({ borderColor: value });
              }}
              label="Border"
            />
            <input
              aria-label="Writer box border width"
              type="number"
              min={0}
              max={20}
              value={borderWidth}
              onChange={(event) => {
                void patchActiveRichBoxStyle({
                  borderWidth: Number(event.currentTarget.value),
                });
              }}
              style={numberStyle}
            />
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>Padding</span>
            <input
              aria-label="Writer box padding"
              type="number"
              min={0}
              max={60}
              value={padding}
              onChange={(event) => {
                void patchActiveRichBoxStyle({
                  padding: Number(event.currentTarget.value),
                });
              }}
              style={numberStyle}
            />
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>Opacity</span>
            <input
              aria-label="Writer box opacity"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => {
                void patchActiveRichBoxStyle({
                  opacity: Number(event.currentTarget.value),
                });
              }}
              style={{ flex: 1 }}
            />
            <span
              style={{
                width: 34,
                textAlign: 'right',
                fontSize: 11,
                color: '#64748b',
              }}
            >
              {Math.round(opacity * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              height: 26,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  width: 48,
  flexShrink: 0,
  fontSize: 11,
  color: '#475569',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: 28,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  fontSize: 11,
  padding: '0 6px',
};

const numberStyle: React.CSSProperties = {
  width: 52,
  height: 26,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  fontSize: 11,
  padding: '0 5px',
};
