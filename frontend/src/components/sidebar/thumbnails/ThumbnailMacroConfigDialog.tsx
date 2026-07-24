import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { DocumentCommand } from '@/core/commands/types';
import { VISUAL_MASK_WARNING } from '@/core/redaction/capability';

export type ThumbnailMacroKind = 'pageNumbers' | 'fileHeader' | 'textStamp' | 'watermark' | 'redaction';

interface ThumbnailMacroConfigDialogProps {
  kind: ThumbnailMacroKind;
  pageIndices: number[];
  onCancel: () => void;
  onApply: (command: DocumentCommand, successMessage: string) => void;
}

const TITLES: Record<ThumbnailMacroKind, string> = {
  pageNumbers: 'Add Page Numbers (Footer)',
  fileHeader: 'Add File Header',
  textStamp: 'Batch Text Stamp',
  watermark: 'Diagonal Watermark',
  redaction: 'Visual Mask (Not Secure Redaction)',
};

const ALIGN_OPTIONS = ['left', 'center', 'right'] as const;
type Align = (typeof ALIGN_OPTIONS)[number];

const DEFAULTS: Record<
  ThumbnailMacroKind,
  {
    text: string;
    align: Align;
    fontSize: number;
    color: string;
    opacity: number;
    marginY: number;
    x: number;
    y: number;
    rotation?: number;
    width?: number;
    height?: number;
  }
> = {
  pageNumbers: {
    text: 'Page {page} of {pages}',
    align: 'center',
    fontSize: 10,
    color: '#475569',
    opacity: 0.9,
    marginY: 20,
    x: 24,
    y: 32,
  },
  fileHeader: {
    text: '{file}',
    align: 'right',
    fontSize: 10,
    color: '#334155',
    opacity: 0.85,
    marginY: 18,
    x: 24,
    y: 32,
  },
  textStamp: {
    text: 'REVIEW COPY',
    align: 'left',
    fontSize: 11,
    color: '#7c2d12',
    opacity: 0.75,
    marginY: 20,
    x: 32,
    y: 32,
  },
  watermark: {
    text: 'DRAFT',
    align: 'left',
    fontSize: 80,
    color: '#94a3b8',
    opacity: 0.18,
    marginY: 0,
    x: 100,
    y: 300,
    rotation: 45,
  },
  redaction: {
    text: '',
    align: 'left',
    fontSize: 0,
    color: '#000000',
    opacity: 1,
    marginY: 0,
    x: 36,
    y: 100,
    width: 300,
    height: 30,
  },
};

export const ThumbnailMacroConfigDialog: React.FC<
  ThumbnailMacroConfigDialogProps
> = ({ kind, pageIndices, onCancel, onApply }) => {
  const defaults = DEFAULTS[kind];
  const [text, setText] = React.useState(defaults.text);
  const [align, setAlign] = React.useState<Align>(defaults.align);
  const [fontSize, setFontSize] = React.useState(defaults.fontSize);
  const [color, setColor] = React.useState(defaults.color);
  const [opacity, setOpacity] = React.useState(defaults.opacity);
  const [marginY, setMarginY] = React.useState(defaults.marginY);
  const [x, setX] = React.useState(defaults.x);
  const [y, setY] = React.useState(defaults.y);

  const isHeaderFooter = kind === 'pageNumbers' || kind === 'fileHeader';
  const isWatermark = kind === 'watermark';
  const isRedaction = kind === 'redaction';
  const pageCount = pageIndices.length;

  const [rotation, setRotation] = React.useState(defaults.rotation ?? 0);
  const [width, setWidth] = React.useState(defaults.width ?? 300);
  const [height, setHeight] = React.useState(defaults.height ?? 30);

  const handleApply = () => {
    if (isHeaderFooter) {
      const command: DocumentCommand = {
        type: 'ADD_HEADER_FOOTER_TEXT',
        pageIndices,
        options: {
          zone: kind === 'pageNumbers' ? 'footer' : 'header',
          text,
          align,
          marginX: 24,
          marginY,
          fontSize,
          color,
          opacity,
          pageNumberToken: kind === 'pageNumbers',
          fileNameToken: kind === 'fileHeader',
        },
      };
      onApply(
        command,
        kind === 'pageNumbers'
          ? 'Added page numbers to footer.'
          : 'Added file name to header.',
      );
      return;
    }

    if (isRedaction) {
      const command: DocumentCommand = {
        type: 'DRAW_REDACTION_BOX',
        pageIndices,
        options: { x, y, width, height, fillColor: color },
      };
      onApply(
        command,
        'Applied a visual mask. Underlying PDF content was not securely removed.',
      );
      return;
    }

    const command: DocumentCommand = {
      type: 'DRAW_TEXT_ON_PAGES',
      pageIndices,
      options: {
        text,
        x,
        y,
        fontSize,
        color,
        opacity,
        align,
        ...(isWatermark ? { rotation } : {}),
      },
    };
    onApply(
      command,
      isWatermark
        ? 'Applied diagonal watermark on selected pages.'
        : 'Applied text stamp on selected pages.',
    );
  };

  return (
    <Modal isOpen onClose={onCancel} title={TITLES[kind]}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Applies to {pageCount} selected page{pageCount === 1 ? '' : 's'}.
          {isHeaderFooter && ' Use {page}, {pages}, {file}, {date} as tokens.'}
          {isWatermark && ' Large diagonal text stamped across each page.'}
          {isRedaction && ' Draws an opaque rectangle over content.'}
        </p>

        {isRedaction && (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          >
            {VISUAL_MASK_WARNING} Text may remain searchable, copyable, or extractable.
          </div>
        )}

        {!isRedaction && (
          <Field label="Text">
            <input
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        {!isRedaction && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alignment">
              <select
                value={align}
                onChange={(event) => setAlign(event.target.value as Align)}
                className={inputClass}
              >
                {ALIGN_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Font size">
              <input
                type="number"
                min={6}
                max={96}
                value={fontSize}
                onChange={(event) => setFontSize(clampNumber(event.target.value, 6, 96, defaults.fontSize))}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        <div className={isRedaction ? '' : 'grid grid-cols-2 gap-3'}>
          <Field label={isRedaction ? 'Mask color' : 'Color'}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-8 w-10 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                aria-label={isRedaction ? 'Mask color' : 'Color'}
              />
              <input
                type="text"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className={inputClass}
              />
            </div>
          </Field>
          {!isRedaction && (
            <Field label={`Opacity (${opacity.toFixed(2)})`}>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                className="w-full"
                aria-label="Opacity"
              />
            </Field>
          )}
        </div>

        {isHeaderFooter ? (
          <Field label="Vertical margin (pt)">
            <input
              type="number"
              min={0}
              max={200}
              value={marginY}
              onChange={(event) => setMarginY(clampNumber(event.target.value, 0, 200, defaults.marginY))}
              className={inputClass}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="X (pt)">
              <input
                type="number"
                value={x}
                onChange={(event) => setX(clampNumber(event.target.value, 0, 2000, defaults.x))}
                className={inputClass}
              />
            </Field>
            <Field label="Y (pt)">
              <input
                type="number"
                value={y}
                onChange={(event) => setY(clampNumber(event.target.value, 0, 2000, defaults.y))}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {isWatermark && (
          <Field label="Rotation (degrees, CCW)">
            <input
              type="number"
              min={0}
              max={360}
              value={rotation}
              onChange={(event) => setRotation(clampNumber(event.target.value, 0, 360, 45))}
              className={inputClass}
            />
          </Field>
        )}

        {isRedaction && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Width (pt)">
              <input
                type="number"
                min={1}
                max={2000}
                value={width}
                onChange={(event) => setWidth(clampNumber(event.target.value, 1, 2000, 300))}
                className={inputClass}
              />
            </Field>
            <Field label="Height (pt)">
              <input
                type="number"
                min={1}
                max={2000}
                value={height}
                onChange={(event) => setHeight(clampNumber(event.target.value, 1, 2000, 30))}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={!isRedaction && !text.trim()}
          >
            {isRedaction ? 'Apply Visual Mask' : 'Apply'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const inputClass =
  'w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
      {label}
    </span>
    {children}
  </label>
);

function clampNumber(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
