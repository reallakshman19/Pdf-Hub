import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { PdfCommandDraft } from '@/core/commands/types';
import type { PageId } from '@/core/pages/types';
import { parsePageRangeString } from '@/core/pages/pageRangeParser';
import { createSimpleHeaderFooterTextTemplate } from '@/core/header-footer/simpleTextTemplate';
import { VISUAL_MASK_WARNING } from '@/core/redaction/capability';

export type ThumbnailMacroKind = 'pageNumbers' | 'fileHeader' | 'textStamp' | 'watermark' | 'visualMask';

interface ThumbnailMacroConfigDialogProps {
  kind: ThumbnailMacroKind;
  pageIndices: number[];
  pageIds: PageId[];
  /** Full document page IDs so users can switch between Selected, All, Current, or Range scopes. */
  allPageIds?: PageId[];
  /** Zero-based current page index for Current page scope. */
  currentPageIndex?: number;
  /** Page height in points (default 792pt) for computing top/middle placement presets. */
  pageHeightPt?: number;
  onCancel: () => void;
  onApply: (command: PdfCommandDraft, successMessage: string) => void;
}

const TITLES: Record<ThumbnailMacroKind, string> = {
  pageNumbers: 'Add Page Numbers (Footer)',
  fileHeader: 'Add File Header',
  textStamp: 'Batch Text Stamp',
  watermark: 'Diagonal Watermark',
  visualMask: 'Visual Mask (Not Secure Redaction)',
};

type Zone = 'header' | 'footer';

const ALIGN_OPTIONS = ['left', 'center', 'right'] as const;
type Align = (typeof ALIGN_OPTIONS)[number];

const FONT_FAMILIES = [
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times Roman', label: 'Times Roman' },
  { value: 'Courier', label: 'Courier' },
] as const;

const FONT_STYLE_OPTIONS = [
  { value: 'normal', label: 'Regular', weight: 'normal' as const, style: 'normal' as const },
  { value: 'bold', label: 'Bold', weight: 'bold' as const, style: 'normal' as const },
  { value: 'italic', label: 'Italic', weight: 'normal' as const, style: 'italic' as const },
  { value: 'bold-italic', label: 'Bold Italic', weight: 'bold' as const, style: 'italic' as const },
] as const;
type FontStylePreset = (typeof FONT_STYLE_OPTIONS)[number]['value'];

const PAGE_NUMBER_FORMATS = [
  { value: 'page-n-of-m', label: 'Page N of M', template: 'Page {{physicalPage}} of {{pageCount}}' },
  { value: 'page-n', label: 'Page N', template: 'Page {{physicalPage}}' },
  { value: 'n-of-m', label: 'N / M', template: '{{physicalPage}} / {{pageCount}}' },
  { value: 'n', label: 'N', template: '{{physicalPage}}' },
  { value: 'logical', label: 'Logical Label', template: '{{pageLabel}}' },
  { value: 'custom', label: 'Custom', template: '' },
] as const;
type PageNumberFormatPreset = (typeof PAGE_NUMBER_FORMATS)[number]['value'];

const STAMP_PLACEMENTS = [
  { value: 'bottom-left', label: 'Bottom Left', align: 'left' as const, vertical: 'bottom' as const },
  { value: 'bottom-center', label: 'Bottom Center', align: 'center' as const, vertical: 'bottom' as const },
  { value: 'bottom-right', label: 'Bottom Right', align: 'right' as const, vertical: 'bottom' as const },
  { value: 'center', label: 'Center', align: 'center' as const, vertical: 'middle' as const },
  { value: 'top-left', label: 'Top Left', align: 'left' as const, vertical: 'top' as const },
  { value: 'top-center', label: 'Top Center', align: 'center' as const, vertical: 'top' as const },
  { value: 'top-right', label: 'Top Right', align: 'right' as const, vertical: 'top' as const },
  { value: 'custom', label: 'Custom Coordinates', align: null, vertical: null },
] as const;
type StampPlacementPreset = (typeof STAMP_PLACEMENTS)[number]['value'];

type PageScopeMode = 'selection' | 'all' | 'current' | 'range';

const DEFAULTS: Record<
  ThumbnailMacroKind,
  {
    text: string;
    zone: Zone;
    align: Align;
    fontSize: number;
    color: string;
    opacity: number;
    marginX: number;
    marginY: number;
    x: number;
    y: number;
    rotation?: number;
    width?: number;
    height?: number;
  }
> = {
  pageNumbers: {
    text: 'Page {{physicalPage}} of {{pageCount}}',
    zone: 'footer',
    align: 'center',
    fontSize: 10,
    color: '#475569',
    opacity: 0.9,
    marginX: 24,
    marginY: 20,
    x: 24,
    y: 32,
  },
  fileHeader: {
    text: '{{fileName}}',
    zone: 'header',
    align: 'right',
    fontSize: 10,
    color: '#334155',
    opacity: 0.85,
    marginX: 24,
    marginY: 18,
    x: 24,
    y: 32,
  },
  textStamp: {
    text: 'REVIEW COPY',
    zone: 'footer',
    align: 'left',
    fontSize: 11,
    color: '#7c2d12',
    opacity: 0.75,
    marginX: 24,
    marginY: 20,
    x: 32,
    y: 32,
  },
  watermark: {
    text: 'DRAFT',
    zone: 'footer',
    align: 'left',
    fontSize: 80,
    color: '#94a3b8',
    opacity: 0.18,
    marginX: 24,
    marginY: 0,
    x: 100,
    y: 300,
    rotation: 45,
  },
  visualMask: {
    text: '',
    zone: 'footer',
    align: 'left',
    fontSize: 0,
    color: '#000000',
    opacity: 1,
    marginX: 24,
    marginY: 0,
    x: 36,
    y: 100,
    width: 300,
    height: 30,
  },
};

export const ThumbnailMacroConfigDialog: React.FC<
  ThumbnailMacroConfigDialogProps
> = ({
  kind,
  pageIndices,
  pageIds,
  allPageIds,
  currentPageIndex = 0,
  pageHeightPt = 792,
  onCancel,
  onApply,
}) => {
  const defaults = DEFAULTS[kind];
  const [text, setText] = React.useState(defaults.text);
  const [zone, setZone] = React.useState<Zone>(defaults.zone);
  const [align, setAlign] = React.useState<Align>(defaults.align);
  const [formatPreset, setFormatPreset] = React.useState<PageNumberFormatPreset>('page-n-of-m');
  const [startNumber, setStartNumber] = React.useState(1);
  const [fontFamily, setFontFamily] = React.useState<string>('Helvetica');
  const [fontStylePreset, setFontStylePreset] = React.useState<FontStylePreset>('normal');
  const [fontSize, setFontSize] = React.useState(defaults.fontSize);
  const [color, setColor] = React.useState(defaults.color);
  const [opacity, setOpacity] = React.useState(defaults.opacity);
  const [marginX, setMarginX] = React.useState(defaults.marginX);
  const [marginY, setMarginY] = React.useState(defaults.marginY);
  const [placementPreset, setPlacementPreset] = React.useState<StampPlacementPreset>(
    kind === 'watermark' ? 'custom' : 'bottom-left',
  );
  const [x, setX] = React.useState(defaults.x);
  const [y, setY] = React.useState(defaults.y);
  const [rotation, setRotation] = React.useState(defaults.rotation ?? 0);
  const [width, setWidth] = React.useState(defaults.width ?? 300);
  const [height, setHeight] = React.useState(defaults.height ?? 30);

  const [pageScope, setPageScope] = React.useState<PageScopeMode>('selection');
  const [pageRangeInput, setPageRangeInput] = React.useState(() =>
    formatPageNumbersPreview(pageIndices),
  );

  const isPageNumbers = kind === 'pageNumbers';
  const isFileHeader = kind === 'fileHeader';
  const isHeaderFooter = isPageNumbers || isFileHeader;
  const isBatchTextStamp = kind === 'textStamp';
  const isWatermark = kind === 'watermark';
  const isVisualMask = kind === 'visualMask';

  const totalPages = React.useMemo(() => {
    if (allPageIds && allPageIds.length > 0) return allPageIds.length;
    const maxPassed = pageIndices.reduce((max, idx) => Math.max(max, idx + 1), 0);
    return Math.max(maxPassed, 1);
  }, [allPageIds, pageIndices]);

  const pageIdByIndex = React.useMemo(() => {
    const map = new Map<number, PageId>();
    if (allPageIds && allPageIds.length > 0) {
      allPageIds.forEach((id, idx) => map.set(idx, id));
      return map;
    }
    pageIndices.forEach((idx, i) => {
      const id = pageIds[i];
      if (id) map.set(idx, id);
    });
    return map;
  }, [allPageIds, pageIndices, pageIds]);

  const resolvedPages = React.useMemo(() => {
    if (pageScope === 'selection') {
      return {
        valid: pageIndices.length > 0,
        indices: pageIndices,
        ids: pageIds,
        error: pageIndices.length === 0 ? 'Select at least one page.' : null,
      };
    }
    if (pageScope === 'all' && allPageIds && allPageIds.length > 0) {
      return {
        valid: true,
        indices: allPageIds.map((_, idx) => idx),
        ids: allPageIds,
        error: null,
      };
    }
    if (pageScope === 'current') {
      const idx = Math.max(0, Math.min(totalPages - 1, currentPageIndex));
      const id = pageIdByIndex.get(idx);
      return {
        valid: !isHeaderFooter || Boolean(id),
        indices: [idx],
        ids: id ? [id] : [],
        error: isHeaderFooter && !id ? 'Current page ID is unavailable.' : null,
      };
    }
    const parsed = parsePageRangeString(pageRangeInput, totalPages);
    if (!parsed.valid || !parsed.pageIndices || parsed.pageIndices.length === 0) {
      return {
        valid: false,
        indices: [] as number[],
        ids: [] as PageId[],
        error: parsed.error ?? 'Enter valid page numbers (e.g. 1-3, 5).',
      };
    }
    const ids = parsed.pageIndices
      .map((idx) => pageIdByIndex.get(idx))
      .filter((id): id is PageId => Boolean(id));
    if (isHeaderFooter && ids.length !== parsed.pageIndices.length) {
      return {
        valid: false,
        indices: parsed.pageIndices,
        ids,
        error: 'Range must reference pages within the active selection.',
      };
    }
    return {
      valid: true,
      indices: parsed.pageIndices,
      ids,
      error: null,
    };
  }, [
    allPageIds,
    currentPageIndex,
    isHeaderFooter,
    pageIdByIndex,
    pageIds,
    pageIndices,
    pageRangeInput,
    pageScope,
    totalPages,
  ]);

  const selectedFontMeta = React.useMemo(
    () => FONT_STYLE_OPTIONS.find((item) => item.value === fontStylePreset) ?? FONT_STYLE_OPTIONS[0],
    [fontStylePreset],
  );

  const handleFormatPresetChange = (nextPreset: PageNumberFormatPreset) => {
    setFormatPreset(nextPreset);
    const entry = PAGE_NUMBER_FORMATS.find((item) => item.value === nextPreset);
    if (entry && entry.template) {
      setText(entry.template);
    }
  };

  const handlePageNumberTextChange = (nextText: string) => {
    setText(nextText);
    const matching = PAGE_NUMBER_FORMATS.find((item) => item.template === nextText && item.value !== 'custom');
    setFormatPreset(matching ? matching.value : 'custom');
  };

  const handlePlacementPresetChange = (nextPreset: StampPlacementPreset) => {
    setPlacementPreset(nextPreset);
    const found = STAMP_PLACEMENTS.find((item) => item.value === nextPreset);
    if (!found || !found.align || !found.vertical) return;
    setAlign(found.align);
    setX(found.align === 'center' ? 0 : 32);
    if (found.vertical === 'bottom') {
      setY(32);
    } else if (found.vertical === 'middle') {
      setY(Math.round(pageHeightPt / 2));
    } else {
      setY(Math.max(32, Math.round(pageHeightPt - 48)));
    }
  };

  const appendHeaderToken = (token: string) => {
    setText((prev) => (prev ? `${prev} ${token}` : token));
  };

  const handleApply = () => {
    if (!resolvedPages.valid) return;

    if (isHeaderFooter) {
      if (resolvedPages.ids.length !== resolvedPages.indices.length || resolvedPages.ids.length === 0) {
        return;
      }
      const command: PdfCommandDraft = {
        type: 'APPLY_HEADER_FOOTER_TEMPLATE',
        payload: {
          template: createSimpleHeaderFooterTextTemplate({
            name: isPageNumbers
              ? 'Thumbnail page numbers'
              : 'Thumbnail file header',
            selector: {
              include: {
                mode: 'pageIds',
                pageIds: resolvedPages.ids,
              },
            },
            zone,
            text,
            align,
            marginXPt: marginX,
            marginYPt: marginY,
            fontFamily,
            fontSizePt: fontSize,
            fontWeight: selectedFontMeta.weight,
            fontStyle: selectedFontMeta.style,
            color,
            opacity,
            ...(isPageNumbers && startNumber !== 1 ? { startNumber } : {}),
          }),
        },
      };
      onApply(
        command,
        isPageNumbers
          ? `Added page numbers to ${zone}.`
          : `Added file header text to ${zone}.`,
      );
      return;
    }

    if (isVisualMask) {
      const command: PdfCommandDraft = {
        type: 'DRAW_REDACTION_BOX',
        payload: {
          pageIndices: resolvedPages.indices,
          options: { x, y, width, height, fillColor: color },
        },
      };
      onApply(
        command,
        'Applied a visual mask. Underlying PDF content was not securely removed.',
      );
      return;
    }

    const command: PdfCommandDraft = {
      type: 'DRAW_TEXT_ON_PAGES',
      payload: {
        pageIndices: resolvedPages.indices,
        options: {
          text,
          x,
          y,
          fontSize,
          color,
          opacity,
          align,
          pageNumberToken: true,
          fileNameToken: true,
          dateToken: true,
          ...(isWatermark ? { rotation } : {}),
        },
      },
    };
    onApply(
      command,
      isWatermark
        ? 'Applied diagonal watermark on selected pages.'
        : `Applied text stamp on ${resolvedPages.indices.length} page(s).`,
    );
  };

  const applyDisabled =
    !resolvedPages.valid || (!isVisualMask && !text.trim());

  return (
    <Modal isOpen onClose={onCancel} title={TITLES[kind]}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Applies to {resolvedPages.valid ? resolvedPages.indices.length : 0} page
          {resolvedPages.indices.length === 1 ? '' : 's'}.
          {isHeaderFooter && ' Use {{physicalPage}}, {{pageCount}}, {{pageLabel}}, {{fileName}}, {{date}}.'}
          {isBatchTextStamp && ' Supports {page}, {pages}, {file}, {date} tokens.'}
          {isWatermark && ' Large diagonal text stamped across each page.'}
          {isVisualMask && ' Draws an opaque rectangle over content.'}
        </p>

        {isVisualMask && (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          >
            {VISUAL_MASK_WARNING} Text may remain searchable, copyable, or extractable.
          </div>
        )}

        {isPageNumbers && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Format">
              <select
                value={formatPreset}
                onChange={(event) => handleFormatPresetChange(event.target.value as PageNumberFormatPreset)}
                className={inputClass}
                aria-label="Page number format"
              >
                {PAGE_NUMBER_FORMATS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start number">
              <input
                type="number"
                min={1}
                max={99999}
                value={startNumber}
                onChange={(event) => setStartNumber(clampInteger(event.target.value, 1, 99999, 1))}
                className={inputClass}
                aria-label="Start number"
              />
            </Field>
          </div>
        )}

        {!isVisualMask && (
          <div>
            <Field label={isPageNumbers ? 'Format template' : 'Text'}>
              <input
                type="text"
                value={text}
                onChange={(event) =>
                  isPageNumbers
                    ? handlePageNumberTextChange(event.target.value)
                    : setText(event.target.value)
                }
                className={inputClass}
              />
            </Field>
            {isFileHeader && (
              <div className="mt-1 flex flex-wrap gap-1">
                {(
                  [
                    { label: '+ File Name', token: '{{fileName}}' },
                    { label: '+ Date', token: '{{date}}' },
                    { label: '+ Page #', token: '{{physicalPage}}' },
                    { label: '+ Total', token: '{{pageCount}}' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    onClick={() => appendHeaderToken(item.token)}
                    className="rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer bg-transparent"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isHeaderFooter ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Position">
                <select
                  value={zone}
                  onChange={(event) => setZone(event.target.value as Zone)}
                  className={inputClass}
                  aria-label="Position"
                >
                  <option value="header">Header (Top)</option>
                  <option value="footer">Footer (Bottom)</option>
                </select>
              </Field>
              <Field label="Alignment">
                <select
                  value={align}
                  onChange={(event) => setAlign(event.target.value as Align)}
                  className={inputClass}
                  aria-label="Alignment"
                >
                  {ALIGN_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Font">
                <select
                  value={fontFamily}
                  onChange={(event) => setFontFamily(event.target.value)}
                  className={inputClass}
                  aria-label="Font"
                >
                  {FONT_FAMILIES.map((font) => (
                    <option key={font.value} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Style">
                <select
                  value={fontStylePreset}
                  onChange={(event) => setFontStylePreset(event.target.value as FontStylePreset)}
                  className={inputClass}
                  aria-label="Font style"
                >
                  {FONT_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Horizontal margin (pt)">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={marginX}
                  onChange={(event) => setMarginX(clampNumber(event.target.value, 0, 200, defaults.marginX))}
                  className={inputClass}
                  aria-label="Horizontal margin (pt)"
                />
              </Field>
              <Field label="Vertical margin (pt)">
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={marginY}
                  onChange={(event) => setMarginY(clampNumber(event.target.value, 0, 200, defaults.marginY))}
                  className={inputClass}
                  aria-label="Vertical margin (pt)"
                />
              </Field>
            </div>
          </>
        ) : (
          !isVisualMask && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Placement">
                  <select
                    value={placementPreset}
                    onChange={(event) => handlePlacementPresetChange(event.target.value as StampPlacementPreset)}
                    className={inputClass}
                    aria-label="Placement"
                  >
                    {STAMP_PLACEMENTS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Alignment">
                  <select
                    value={align}
                    onChange={(event) => {
                      setPlacementPreset('custom');
                      setAlign(event.target.value as Align);
                    }}
                    className={inputClass}
                    aria-label="Alignment"
                  >
                    {ALIGN_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
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
            </>
          )
        )}

        <div className={isVisualMask ? '' : 'grid grid-cols-2 gap-3'}>
          <Field label={isVisualMask ? 'Mask color' : 'Color'}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-8 w-10 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                aria-label={isVisualMask ? 'Mask color' : 'Color'}
              />
              <input
                type="text"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className={inputClass}
              />
            </div>
          </Field>
          {!isVisualMask && (
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

        {!isHeaderFooter && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="X (pt)">
              <input
                type="number"
                value={x}
                onChange={(event) => {
                  setPlacementPreset('custom');
                  setX(clampNumber(event.target.value, 0, 2000, defaults.x));
                }}
                className={inputClass}
              />
            </Field>
            <Field label="Y (pt)">
              <input
                type="number"
                value={y}
                onChange={(event) => {
                  setPlacementPreset('custom');
                  setY(clampNumber(event.target.value, 0, 2000, defaults.y));
                }}
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

        {isVisualMask && (
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pages">
            <select
              value={pageScope}
              onChange={(event) => setPageScope(event.target.value as PageScopeMode)}
              className={inputClass}
              aria-label="Pages scope"
            >
              <option value="selection">
                Initial selection ({pageIndices.length})
              </option>
              {allPageIds && allPageIds.length > 0 && (
                <option value="all">All pages ({allPageIds.length})</option>
              )}
              <option value="current">Current page (p.{Math.min(totalPages, Math.max(1, currentPageIndex + 1))})</option>
              <option value="range">Page range…</option>
            </select>
          </Field>
          {pageScope === 'range' && (
            <Field label="Page range">
              <input
                type="text"
                value={pageRangeInput}
                onChange={(event) => setPageRangeInput(event.target.value)}
                placeholder="e.g. 1-3, 5"
                aria-label="Page range"
                className={inputClass}
              />
            </Field>
          )}
        </div>

        {resolvedPages.error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {resolvedPages.error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={applyDisabled}
          >
            {isVisualMask ? 'Apply Visual Mask' : 'Apply'}
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

function clampInteger(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Math.trunc(Number(raw));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function formatPageNumbersPreview(pageIndices: number[]): string {
  if (pageIndices.length === 0) return '1';
  const sorted = [...new Set(pageIndices)].sort((a, b) => a - b);
  return sorted.map((idx) => idx + 1).join(', ');
}
