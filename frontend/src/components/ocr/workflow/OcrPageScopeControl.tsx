import React from 'react';

export type OcrPageScope = 'current' | 'selected' | 'all';

export interface OcrPageScopeControlProps {
  value: OcrPageScope;
  currentPageIndex: number;
  selectedPageIndexes: number[];
  pageCount: number;
  disabled?: boolean;
  onChange: (scope: OcrPageScope) => void;
}

export const OcrPageScopeControl: React.FC<OcrPageScopeControlProps> = ({
  value,
  currentPageIndex,
  selectedPageIndexes,
  pageCount,
  disabled = false,
  onChange,
}) => {
  const currentPage = Math.max(
    1,
    Math.min(currentPageIndex + 1, Math.max(1, pageCount)),
  );
  const selectedCount = selectedPageIndexes.length;

  const options: Array<{
    value: OcrPageScope;
    label: string;
    detail: string;
    disabled?: boolean;
  }> = [
    {
      value: 'current',
      label: 'Current',
      detail: `Page ${currentPage}`,
    },
    {
      value: 'selected',
      label: 'Selected',
      detail: selectedCount > 0 ? `${selectedCount} page${selectedCount === 1 ? '' : 's'}` : 'No pages selected',
      disabled: selectedCount === 0,
    },
    {
      value: 'all',
      label: 'All',
      detail: `${Math.max(1, pageCount)} pages`,
    },
  ];

  return (
    <fieldset
      className="grid grid-cols-3 gap-2"
      data-testid="ocr-page-scope"
      disabled={disabled}
    >
      <legend className="sr-only">Pages to recognize</legend>
      {options.map((option) => {
        const checked = value === option.value;
        const optionDisabled = disabled || option.disabled === true;

        return (
          <label
            key={option.value}
            className={[
              'cursor-pointer rounded-lg border px-2 py-2 text-left transition',
              checked
                ? 'border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200',
              optionDisabled ? 'cursor-not-allowed opacity-45' : 'hover:border-blue-300',
            ].join(' ')}
          >
            <input
              className="sr-only"
              type="radio"
              name="ocr-page-scope"
              value={option.value}
              checked={checked}
              disabled={optionDisabled}
              onChange={() => onChange(option.value)}
            />
            <span className="block text-xs font-semibold">{option.label}</span>
            <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
              {option.detail}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};

export default OcrPageScopeControl;
