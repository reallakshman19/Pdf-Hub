import React from 'react';

import type { HeaderFooterEditorImageDraft } from '@/core/header-footer/editorDraft';

interface HeaderFooterImagePanelProps {
  image: HeaderFooterEditorImageDraft | null;
  previewUrl: string | null;
  busy: boolean;
  error: string | null;
  onFileSelected: (file: File) => void;
  onChange: (patch: Partial<HeaderFooterEditorImageDraft>) => void;
  onRemove: () => void;
}

export const HeaderFooterImagePanel: React.FC<
  HeaderFooterImagePanelProps
> = ({
  image,
  previewUrl,
  busy,
  error,
  onFileSelected,
  onChange,
  onRemove,
}) => (
  <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          Logo / image
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          PNG or JPEG. The image replaces text in its chosen slot.
        </p>
      </div>
      {image && (
        <button
          type="button"
          onClick={onRemove}
          className="text-[11px] text-red-600 hover:underline dark:text-red-400"
        >
          Remove
        </button>
      )}
    </div>

    <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
            Image file
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelected(file);
              event.currentTarget.value = '';
            }}
            className="block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs dark:text-slate-300 dark:file:bg-slate-800"
            aria-label="Header footer image file"
          />
        </label>

        {image && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Band">
                <select
                  value={image.band}
                  onChange={(event) =>
                    onChange({
                      band: event.target.value as 'header' | 'footer',
                    })
                  }
                  className={inputClass}
                >
                  <option value="header">Header</option>
                  <option value="footer">Footer</option>
                </select>
              </Field>
              <Field label="Slot">
                <select
                  value={image.slot}
                  onChange={(event) =>
                    onChange({
                      slot: event.target.value as
                        | 'left'
                        | 'center'
                        | 'right',
                    })
                  }
                  className={inputClass}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </Field>
              <Field label="Width (pt)">
                <input
                  type="number"
                  min={8}
                  max={240}
                  value={image.widthPt}
                  onChange={(event) =>
                    onChange({
                      widthPt: clampNumber(
                        event.target.value,
                        8,
                        240,
                        image.widthPt,
                      ),
                    })
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <p className="truncate text-[11px] text-slate-500" title={image.fileName}>
              {image.fileName}
            </p>
          </>
        )}

        {busy && (
          <p className="text-[11px] text-slate-500">
            Checking image…
          </p>
        )}
        {error && (
          <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      <div className="flex min-h-20 items-center justify-center overflow-hidden rounded border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        {previewUrl && image ? (
          <img
            src={previewUrl}
            alt={image.altText || image.fileName}
            className="max-h-24 max-w-full object-contain"
          />
        ) : (
          <span className="px-2 text-center text-[10px] text-slate-400">
            No logo selected
          </span>
        )}
      </div>
    </div>
  </div>
);

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-medium text-slate-500">
      {label}
    </span>
    {children}
  </label>
);

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

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
