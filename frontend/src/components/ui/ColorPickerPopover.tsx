import React from 'react';

const PRESETS = [
  '#000000','#ffffff','#ef4444','#f97316',
  '#eab308','#22c55e','#3b82f6','#8b5cf6',
  '#ec4899','#14b8a6','#64748b','#1e293b',
  '#fef2f2','#eff6ff','#f0fdf4','#fdf4ff',
];

export interface ColorPickerPopoverProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  value,
  onChange,
  label,
}) => {
  const [open, setOpen] = React.useState(false);
  const [hexDraft, setHexDraft] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const hex = hexDraft ?? value;

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const commit = (v: string) => {
    setHexDraft(v);
    onChange(v);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {label && <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>}
      <button
        type="button"
        title={value}
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) {
              setHexDraft(value);
            } else {
              setHexDraft(null);
            }
            return next;
          });
        }}
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          border: '1px solid #cbd5e1',
          background: value || '#ffffff',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 9999,
            marginTop: 4,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(15,23,42,0.18)',
            padding: 10,
            width: 180,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4, marginBottom: 8 }}>
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => {
                  commit(c);
                  setOpen(false);
                  setHexDraft(null);
                }}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  border: c === value ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: c,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="text"
              value={hex}
              maxLength={7}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={() => { if (/^#[0-9a-fA-F]{6}$/.test(hex)) commit(hex); }}
              style={{
                flex: 1,
                height: 26,
                borderRadius: 5,
                border: '1px solid #cbd5e1',
                padding: '0 6px',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            />
            <input
              type="color"
              value={hex.match(/^#[0-9a-fA-F]{6}$/) ? hex : '#000000'}
              onChange={(e) => commit(e.target.value)}
              style={{ width: 26, height: 26, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4 }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
