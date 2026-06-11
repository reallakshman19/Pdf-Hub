import React from 'react';
import { Button } from '@/components/ui/Button';
import { useSessionStore } from '@/core/session/store';
import { updateActiveWriterElementGeometry } from '@/core/writer-v2/writerGeometryActions';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

export const WriterGeometryQuickPanel: React.FC = () => {
  const selectedIds = useWriterV2Store((state) => state.selectedIds);
  const activeId = useWriterV2Store((state) => state.activeId);
  const elements = useWriterV2Store((state) => state.elements);
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);
  const selectedId = selectedIds.length === 1 ? activeId ?? selectedIds[0] : null;
  const selected = selectedId
    ? elements.find((element) => element.id === selectedId) ?? null
    : null;
  const [draft, setDraft] = React.useState({
    x: '',
    y: '',
    width: '',
    height: '',
  });

  React.useEffect(() => {
    if (!selected) {
      // The panel owns local input drafts and must clear them when selection disappears.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft({ x: '', y: '', width: '', height: '' });
      return;
    }

    // The panel owns local input drafts and must resync when active selection geometry changes.
    setDraft({
      x: formatNumber(selected.rect.x),
      y: formatNumber(selected.rect.y),
      width: formatNumber(selected.rect.width),
      height: formatNumber(selected.rect.height),
    });
  }, [selected]);

  if (!selected || selected.locked || selected.hidden) {
    return null;
  }

  const apply = () => {
    const result = updateActiveWriterElementGeometry({
      x: parseNumber(draft.x, selected.rect.x),
      y: parseNumber(draft.y, selected.rect.y),
      width: parseNumber(draft.width, selected.rect.width),
      height: parseNumber(draft.height, selected.rect.height),
    });

    if (result.changed) {
      completeSaveOperation(result.message);
    } else {
      failSaveOperation(result.message);
    }
  };

  return (
    <div
      data-testid="writer-geometry-quick-panel"
      aria-label="Writer geometry quick panel"
      className="flex items-center gap-1 rounded-md border border-slate-200 bg-white/80 px-1 py-0.5 dark:border-slate-800 dark:bg-slate-950/80"
    >
      <GeometryInput label="X" value={draft.x} onChange={(x) => setDraft((current) => ({ ...current, x }))} onApply={apply} />
      <GeometryInput label="Y" value={draft.y} onChange={(y) => setDraft((current) => ({ ...current, y }))} onApply={apply} />
      <GeometryInput label="W" value={draft.width} onChange={(width) => setDraft((current) => ({ ...current, width }))} onApply={apply} />
      <GeometryInput label="H" value={draft.height} onChange={(height) => setDraft((current) => ({ ...current, height }))} onApply={apply} />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Apply Writer geometry"
        className="h-7 px-2 text-xs"
        onClick={apply}
      >
        Apply
      </Button>
    </div>
  );
};

interface GeometryInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
}

const GeometryInput: React.FC<GeometryInputProps> = ({ label, value, onChange, onApply }) => (
  <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
    <span>{label}</span>
    <input
      aria-label={`Writer geometry ${label}`}
      value={value}
      inputMode="decimal"
      className="h-7 w-14 rounded border border-slate-200 bg-white px-1 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onApply();
        }
      }}
    />
  </label>
);

function parseNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, '');
}
