import React from 'react';

import type { HeaderFooterEditorDraft } from '@/core/header-footer/editorDraft';

interface HeaderFooterOptionsPanelProps {
  draft: HeaderFooterEditorDraft;
  hasSelection: boolean;
  hasPageLabelSections: boolean;
  onChange: (patch: Partial<HeaderFooterEditorDraft>) => void;
}

export const HeaderFooterOptionsPanel: React.FC<
  HeaderFooterOptionsPanelProps
> = ({
  draft,
  hasSelection,
  hasPageLabelSections,
  onChange,
}) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <Field label="Apply to">
        <select
          value={draft.targetMode}
          onChange={(event) =>
            onChange({
              targetMode:
                event.target.value as HeaderFooterEditorDraft['targetMode'],
            })
          }
          className={inputClass}
        >
          <option value="all">All pages</option>
          <option value="current">Current page</option>
          <option value="selected" disabled={!hasSelection}>
            Selected pages
          </option>
          <option
            value="current-page-label-section"
            disabled={!hasPageLabelSections}
          >
            Current PageLabel section
          </option>
        </select>
      </Field>
      <Field label="Physical parity">
        <select
          value={draft.parity}
          onChange={(event) =>
            onChange({
              parity:
                event.target.value as HeaderFooterEditorDraft['parity'],
            })
          }
          className={inputClass}
        >
          <option value="all">All matched pages</option>
          <option value="odd">Odd physical pages</option>
          <option value="even">Even physical pages</option>
        </select>
      </Field>
    </div>

    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
      <Check
        label="Exclude first physical page"
        checked={draft.excludeFirstPhysicalPage}
        onChange={(value) =>
          onChange({ excludeFirstPhysicalPage: value })
        }
      />
      <Check
        label="Exclude last physical page"
        checked={draft.excludeLastPhysicalPage}
        onChange={(value) =>
          onChange({ excludeLastPhysicalPage: value })
        }
      />
    </div>

    <div className="grid grid-cols-3 gap-3">
      <Field label="Font">
        <select
          value={draft.fontFamily}
          onChange={(event) =>
            onChange({ fontFamily: event.target.value })
          }
          className={inputClass}
        >
          <option value="Helvetica">Helvetica</option>
          <option value="Times">Times</option>
          <option value="Courier">Courier</option>
        </select>
      </Field>
      <Field label="Size (pt)">
        <input
          type="number"
          min={6}
          max={48}
          value={draft.fontSizePt}
          onChange={(event) =>
            onChange({
              fontSizePt: clampNumber(
                event.target.value,
                6,
                48,
                draft.fontSizePt,
              ),
            })
          }
          className={inputClass}
        />
      </Field>
      <Field label="Color">
        <div className="flex gap-1">
          <input
            type="color"
            value={draft.color}
            onChange={(event) =>
              onChange({ color: event.target.value })
            }
            className="h-8 w-10 rounded border border-slate-300 bg-transparent dark:border-slate-700"
            aria-label="Header footer color"
          />
          <input
            value={draft.color}
            onChange={(event) =>
              onChange({ color: event.target.value })
            }
            className={inputClass}
            aria-label="Header footer hex color"
          />
        </div>
      </Field>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <Field label={`Opacity (${draft.opacity.toFixed(2)})`}>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={draft.opacity}
          onChange={(event) =>
            onChange({ opacity: Number(event.target.value) })
          }
          className="w-full"
        />
      </Field>
      <div className="flex items-end gap-4 pb-1 text-xs">
        <Check
          label="Bold"
          checked={draft.fontWeight === 'bold'}
          onChange={(value) =>
            onChange({ fontWeight: value ? 'bold' : 'normal' })
          }
        />
        <Check
          label="Italic"
          checked={draft.fontStyle === 'italic'}
          onChange={(value) =>
            onChange({ fontStyle: value ? 'italic' : 'normal' })
          }
        />
      </div>
    </div>

    <div className="grid grid-cols-4 gap-2">
      <NumberField
        label="Left margin"
        value={draft.leftMarginPt}
        onChange={(value) => onChange({ leftMarginPt: value })}
      />
      <NumberField
        label="Right margin"
        value={draft.rightMarginPt}
        onChange={(value) => onChange({ rightMarginPt: value })}
      />
      <NumberField
        label="Header top"
        value={draft.headerOffsetFromTopPt}
        onChange={(value) =>
          onChange({ headerOffsetFromTopPt: value })
        }
      />
      <NumberField
        label="Footer bottom"
        value={draft.footerOffsetFromBottomPt}
        onChange={(value) =>
          onChange({ footerOffsetFromBottomPt: value })
        }
      />
    </div>

    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
      <Check
        label="Header separator"
        checked={draft.headerSeparator}
        onChange={(value) => onChange({ headerSeparator: value })}
      />
      <Check
        label="Footer separator"
        checked={draft.footerSeparator}
        onChange={(value) => onChange({ footerSeparator: value })}
      />
    </div>
  </div>
);

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
      {label}
    </span>
    {children}
  </label>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => (
  <Field label={`${label} (pt)`}>
    <input
      type="number"
      min={0}
      max={240}
      value={value}
      onChange={(event) =>
        onChange(clampNumber(event.target.value, 0, 240, value))
      }
      className={inputClass}
    />
  </Field>
);

const Check: React.FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>{label}</span>
  </label>
);

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

function clampNumber(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
