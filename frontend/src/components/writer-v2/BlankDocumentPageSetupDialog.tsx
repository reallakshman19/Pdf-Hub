import React from 'react';
import type {
  WriterPagePreset,
  WriterPageSetupV2,
} from '@/core/writer-v2/types';
import { createWriterPageSetup } from '@/core/writer-v2/writerDocumentMode';

export interface BlankDocumentPageSetupDialogProps {
  open: boolean;
  pageSetup: WriterPageSetupV2;
  onCancel: () => void;
  onApply: (pageSetup: WriterPageSetupV2) => void;
}

export const BlankDocumentPageSetupDialog: React.FC<BlankDocumentPageSetupDialogProps> = ({
  open,
  pageSetup,
  onCancel,
  onApply,
}) => {
  const [preset, setPreset] = React.useState<WriterPagePreset>(pageSetup.preset);
  const [width, setWidth] = React.useState(pageSetup.width);
  const [height, setHeight] = React.useState(pageSetup.height);
  const [marginTop, setMarginTop] = React.useState(pageSetup.marginTop);
  const [marginRight, setMarginRight] = React.useState(pageSetup.marginRight);
  const [marginBottom, setMarginBottom] = React.useState(pageSetup.marginBottom);
  const [marginLeft, setMarginLeft] = React.useState(pageSetup.marginLeft);
  const [backgroundColor, setBackgroundColor] = React.useState(pageSetup.backgroundColor ?? '#ffffff');

  React.useEffect(() => {
    if (!open) return;

    // The dialog owns a local draft that must reset from committed page setup on every open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreset(pageSetup.preset);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWidth(pageSetup.width);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeight(pageSetup.height);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarginTop(pageSetup.marginTop);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarginRight(pageSetup.marginRight);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarginBottom(pageSetup.marginBottom);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarginLeft(pageSetup.marginLeft);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBackgroundColor(pageSetup.backgroundColor ?? '#ffffff');
  }, [open, pageSetup]);

  if (!open) {
    return null;
  }

  const applyPreset = (nextPreset: WriterPagePreset) => {
    setPreset(nextPreset);

    if (nextPreset === 'Custom') {
      return;
    }

    const setup = createWriterPageSetup(nextPreset, {
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
      backgroundColor,
    });

    setWidth(setup.width);
    setHeight(setup.height);
  };

  const submit = () => {
    onApply(createWriterPageSetup(preset, {
      width,
      height,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
      backgroundColor,
    }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Blank document page setup"
      data-testid="blank-document-page-setup-dialog"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Page setup
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Update page size, margins, and page background for this blank Writer document.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Page size
            <select
              data-testid="blank-page-setup-preset-select"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={preset}
              onChange={(event) => applyPreset(event.currentTarget.value as WriterPagePreset)}
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
              <option value="Custom">Custom</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Width, pt
              <input
                data-testid="blank-page-setup-width-input"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                type="number"
                min={144}
                value={width}
                onChange={(event) => {
                  setPreset('Custom');
                  setWidth(Number(event.currentTarget.value));
                }}
              />
            </label>

            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Height, pt
              <input
                data-testid="blank-page-setup-height-input"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                type="number"
                min={144}
                value={height}
                onChange={(event) => {
                  setPreset('Custom');
                  setHeight(Number(event.currentTarget.value));
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <MarginInput label="Top" testId="blank-page-setup-margin-top-input" value={marginTop} onChange={setMarginTop} />
            <MarginInput label="Right" testId="blank-page-setup-margin-right-input" value={marginRight} onChange={setMarginRight} />
            <MarginInput label="Bottom" testId="blank-page-setup-margin-bottom-input" value={marginBottom} onChange={setMarginBottom} />
            <MarginInput label="Left" testId="blank-page-setup-margin-left-input" value={marginLeft} onChange={setMarginLeft} />
          </div>

          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Background
            <input
              data-testid="blank-page-setup-background-input"
              className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              type="color"
              value={backgroundColor}
              onChange={(event) => setBackgroundColor(event.currentTarget.value)}
            />
          </label>

          <div
            data-testid="blank-page-setup-summary"
            className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            {Math.round(width)} × {Math.round(height)} pt · margins {Math.round(marginTop)} / {Math.round(marginRight)} / {Math.round(marginBottom)} / {Math.round(marginLeft)} pt
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="blank-page-setup-cancel-button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="blank-page-setup-apply-button"
            onClick={submit}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

interface MarginInputProps {
  label: string;
  testId: string;
  value: number;
  onChange: (value: number) => void;
}

const MarginInput: React.FC<MarginInputProps> = ({ label, testId, value, onChange }) => (
  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
    {label}
    <input
      data-testid={testId}
      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
      type="number"
      min={0}
      value={value}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
    />
  </label>
);
