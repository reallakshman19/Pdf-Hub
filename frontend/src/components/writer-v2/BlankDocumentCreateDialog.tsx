import React from 'react';
import { Button } from '@/components/ui/Button';
import type {
  WriterPagePreset,
  WriterPageSetupV2,
} from '@/core/writer-v2/types';
import { WRITER_PAGE_PRESETS } from '@/core/writer-v2/types';
import {
  createWriterPageSetup,
} from '@/core/writer-v2/writerDocumentMode';

export interface BlankDocumentCreateDialogProps {
  open: boolean;
  onCancel: () => void;
  onCreate: (input: {
    title: string;
    pageSetup: WriterPageSetupV2;
    pageCount: number;
  }) => void;
}

type Orientation = 'portrait' | 'landscape';
type MarginPreset = 'normal' | 'narrow' | 'custom';

export const BlankDocumentCreateDialog: React.FC<BlankDocumentCreateDialogProps> = ({
  open,
  onCancel,
  onCreate,
}) => {
  const [title, setTitle] = React.useState('Untitled document');
  const [preset, setPreset] = React.useState<WriterPagePreset>('A4');
  const [orientation, setOrientation] = React.useState<Orientation>('portrait');
  const [marginPreset, setMarginPreset] = React.useState<MarginPreset>('normal');
  const [pageCount, setPageCount] = React.useState(1);
  const [customWidth, setCustomWidth] = React.useState(WRITER_PAGE_PRESETS.A4.width);
  const [customHeight, setCustomHeight] = React.useState(WRITER_PAGE_PRESETS.A4.height);
  const [customMargin, setCustomMargin] = React.useState(72);

  if (!open) {
    return null;
  }

  const resolvedSetup = resolveDialogPageSetup({
    preset,
    orientation,
    marginPreset,
    customWidth,
    customHeight,
    customMargin,
  });

  const submit = () => {
    onCreate({
      title: title.trim() || 'Untitled document',
      pageSetup: resolvedSetup,
      pageCount: Math.max(1, Math.floor(pageCount)),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create blank Writer document"
      data-testid="blank-document-create-dialog"
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
            New blank document
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Create a Writer document without a PDF background.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Title
            <input
              data-testid="blank-document-title-input"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Page size
              <select
                data-testid="blank-document-preset-select"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={preset}
                onChange={(event) => setPreset(event.currentTarget.value as WriterPagePreset)}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
                <option value="Custom">Custom</option>
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Orientation
              <select
                data-testid="blank-document-orientation-select"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={orientation}
                onChange={(event) => setOrientation(event.currentTarget.value as Orientation)}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
          </div>

          {preset === 'Custom' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Width, pt
                <input
                  data-testid="blank-document-custom-width-input"
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  type="number"
                  min={144}
                  value={customWidth}
                  onChange={(event) => setCustomWidth(Number(event.currentTarget.value))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Height, pt
                <input
                  data-testid="blank-document-custom-height-input"
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  type="number"
                  min={144}
                  value={customHeight}
                  onChange={(event) => setCustomHeight(Number(event.currentTarget.value))}
                />
              </label>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Margins
              <select
                data-testid="blank-document-margin-select"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={marginPreset}
                onChange={(event) => setMarginPreset(event.currentTarget.value as MarginPreset)}
              >
                <option value="normal">Normal — 72 pt</option>
                <option value="narrow">Narrow — 36 pt</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Initial pages
              <input
                data-testid="blank-document-page-count-input"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                type="number"
                min={1}
                max={100}
                value={pageCount}
                onChange={(event) => setPageCount(Number(event.currentTarget.value))}
              />
            </label>
          </div>

          {marginPreset === 'custom' ? (
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Custom margin, pt
              <input
                data-testid="blank-document-custom-margin-input"
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                type="number"
                min={0}
                value={customMargin}
                onChange={(event) => setCustomMargin(Number(event.currentTarget.value))}
              />
            </label>
          ) : null}

          <div
            data-testid="blank-document-page-summary"
            className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            {Math.round(resolvedSetup.width)} × {Math.round(resolvedSetup.height)} pt · margins {Math.round(resolvedSetup.marginLeft)} pt
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            data-testid="blank-document-cancel-button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            data-testid="blank-document-create-button"
          >
            Create document
          </Button>
        </div>
      </div>
    </div>
  );
};

export function resolveDialogPageSetup(input: {
  preset: WriterPagePreset;
  orientation: Orientation;
  marginPreset: MarginPreset;
  customWidth: number;
  customHeight: number;
  customMargin: number;
}): WriterPageSetupV2 {
  const base = input.preset === 'Custom'
    ? createWriterPageSetup('Custom', {
        width: input.customWidth,
        height: input.customHeight,
      })
    : createWriterPageSetup(input.preset);

  const portraitWidth = Math.min(base.width, base.height);
  const portraitHeight = Math.max(base.width, base.height);
  const width = input.orientation === 'landscape' ? portraitHeight : portraitWidth;
  const height = input.orientation === 'landscape' ? portraitWidth : portraitHeight;

  const margin = input.marginPreset === 'narrow'
    ? 36
    : input.marginPreset === 'custom'
      ? input.customMargin
      : 72;

  return createWriterPageSetup(input.preset, {
    width,
    height,
    marginTop: margin,
    marginRight: margin,
    marginBottom: margin,
    marginLeft: margin,
    backgroundColor: '#ffffff',
  });
}
