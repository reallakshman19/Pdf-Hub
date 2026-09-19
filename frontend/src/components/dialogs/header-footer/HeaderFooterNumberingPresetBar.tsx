import React from 'react';

import {
  PRINTED_NUMBERING_PRESETS,
  type PrintedNumberingPresetId,
} from '@/core/header-footer/numberingPresets';

interface HeaderFooterNumberingPresetBarProps {
  onApply: (presetId: PrintedNumberingPresetId) => void;
}

export const HeaderFooterNumberingPresetBar: React.FC<
  HeaderFooterNumberingPresetBarProps
> = ({ onApply }) => (
  <div>
    <div className="mb-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
      Printed numbering presets
    </div>
    <div className="flex flex-wrap gap-1">
      {PRINTED_NUMBERING_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onApply(preset.id)}
          title={preset.description}
          aria-label={`Preset: ${preset.label}`}
          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/40"
        >
          {preset.label}
        </button>
      ))}
    </div>
    <p className="mt-1 text-[10px] text-slate-500">
      Presets replace the footer text layout; targeting, header content and styles
      stay unchanged.
    </p>
  </div>
);
