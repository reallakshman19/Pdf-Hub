import React from 'react';

import type { HeaderFooterEditorSlots } from '@/core/header-footer/editorDraft';

export type HeaderFooterEditorSlotKey =
  | 'header.left'
  | 'header.center'
  | 'header.right'
  | 'footer.left'
  | 'footer.center'
  | 'footer.right';

interface HeaderFooterSlotGridProps {
  header: HeaderFooterEditorSlots;
  footer: HeaderFooterEditorSlots;
  activeSlot: HeaderFooterEditorSlotKey;
  onActiveSlotChange: (slot: HeaderFooterEditorSlotKey) => void;
  onChange: (
    band: 'header' | 'footer',
    slot: keyof HeaderFooterEditorSlots,
    value: string,
  ) => void;
}

const SLOT_ORDER = ['left', 'center', 'right'] as const;

export const HeaderFooterSlotGrid: React.FC<
  HeaderFooterSlotGridProps
> = ({
  header,
  footer,
  activeSlot,
  onActiveSlotChange,
  onChange,
}) => (
  <div className="space-y-3">
    <BandEditor
      band="header"
      label="Header"
      slots={header}
      activeSlot={activeSlot}
      onActiveSlotChange={onActiveSlotChange}
      onChange={onChange}
    />
    <BandEditor
      band="footer"
      label="Footer"
      slots={footer}
      activeSlot={activeSlot}
      onActiveSlotChange={onActiveSlotChange}
      onChange={onChange}
    />
  </div>
);

const BandEditor: React.FC<{
  band: 'header' | 'footer';
  label: string;
  slots: HeaderFooterEditorSlots;
  activeSlot: HeaderFooterEditorSlotKey;
  onActiveSlotChange: (slot: HeaderFooterEditorSlotKey) => void;
  onChange: HeaderFooterSlotGridProps['onChange'];
}> = ({
  band,
  label,
  slots,
  activeSlot,
  onActiveSlotChange,
  onChange,
}) => (
  <fieldset>
    <legend className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      {label}
    </legend>
    <div className="grid grid-cols-3 gap-2">
      {SLOT_ORDER.map((slot) => {
        const key = `${band}.${slot}` as HeaderFooterEditorSlotKey;
        const isActive = key === activeSlot;
        return (
          <label key={key} className="min-w-0">
            <span className="mb-1 block text-[11px] capitalize text-slate-500">
              {slot}
            </span>
            <textarea
              value={slots[slot]}
              onFocus={() => onActiveSlotChange(key)}
              onChange={(event) =>
                onChange(band, slot, event.target.value)
              }
              rows={2}
              aria-label={`${label} ${slot}`}
              className={[
                'w-full resize-none rounded-md border bg-white px-2 py-1.5 text-xs text-slate-900 outline-none dark:bg-slate-800 dark:text-slate-100',
                isActive
                  ? 'border-blue-500 ring-1 ring-blue-500'
                  : 'border-slate-300 dark:border-slate-700',
              ].join(' ')}
              placeholder={`${label} ${slot}`}
            />
          </label>
        );
      })}
    </div>
  </fieldset>
);
