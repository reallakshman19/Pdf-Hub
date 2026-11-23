import React, { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  formatBatesNumber,
  type BatesNumberingOptions,
  type BatesPosition,
} from '@/core/pdf-mutation/pdfBatesNumbering';
import { Hash, AlignRight, Type, Palette } from 'lucide-react';

export interface BatesNumberingDialogProps {
  isOpen: boolean;
  totalDocumentPages: number;
  selectedPages: number[];
  currentPage: number;
  onClose: () => void;
  onConfirm: (options: BatesNumberingOptions) => Promise<void> | void;
}

const POSITION_OPTIONS: Array<{ value: BatesPosition; label: string }> = [
  { value: 'bottom-right', label: 'Bottom Right (Standard)' },
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'top-center', label: 'Top Center' },
  { value: 'top-left', label: 'Top Left' },
];

const PRESET_PREFIXES = ['BATES-', 'DWG-', 'REV-', 'CAESAR-', 'DOC-'];
const PRESET_SUFFIXES = ['', '-REV-A', '-IFC', '-DRAFT', '-FINAL'];
const COLOR_SWATCHES = ['#000000', '#334155', '#dc2626', '#1d4ed8', '#047857'];

export const BatesNumberingDialog: React.FC<BatesNumberingDialogProps> = ({
  isOpen,
  totalDocumentPages,
  selectedPages,
  currentPage,
  onClose,
  onConfirm,
}) => {
  const [prefix, setPrefix] = useState('BATES-');
  const [startNumber, setStartNumber] = useState(1);
  const [digits, setDigits] = useState(4);
  const [suffix, setSuffix] = useState('');
  const [position, setPosition] = useState<BatesPosition>('bottom-right');
  const [fontSize, setFontSize] = useState(10);
  const [fontFamily, setFontFamily] = useState<'Helvetica' | 'Courier' | 'TimesRoman'>('Helvetica');
  const [color, setColor] = useState('#000000');
  const [marginX, setMarginX] = useState(36);
  const [marginY, setMarginY] = useState(24);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialTargetPages = selectedPages.length > 0 ? selectedPages : [currentPage || 1];
  const [scope, setScope] = useState<'selected' | 'all'>(
    selectedPages.length > 0 ? 'selected' : 'all',
  );

  const targetCount = scope === 'selected' ? initialTargetPages.length : totalDocumentPages;

  const sampleStart = useMemo(() => {
    return formatBatesNumber(startNumber, prefix, digits, suffix);
  }, [startNumber, prefix, digits, suffix]);

  const sampleEnd = useMemo(() => {
    return formatBatesNumber(startNumber + Math.max(0, targetCount - 1), prefix, digits, suffix);
  }, [startNumber, targetCount, prefix, digits, suffix]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const pageIndices = scope === 'selected'
        ? initialTargetPages.map((p) => p - 1)
        : undefined;

      await onConfirm({
        prefix,
        startNumber,
        digits,
        suffix,
        position,
        fontSize,
        fontFamily,
        color,
        marginXPt: marginX,
        marginYPt: marginY,
        pageIndices,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bates Numbering / Drawing Revision Stamping"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-700 dark:text-slate-200">
        {/* Live Preview Card */}
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 p-3 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            <span className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5" />
              Live Stamp Sequence Preview
            </span>
            <span>{targetCount} page(s) affected</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-900 dark:text-white">
            <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800">
              {sampleStart}
            </span>
            {targetCount > 1 && (
              <>
                <span className="text-slate-400">...</span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800">
                  {sampleEnd}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Prefix & Suffix */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Prefix
            </label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
              placeholder="e.g. DWG-"
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_PREFIXES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrefix(p)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-400"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Suffix
            </label>
            <input
              type="text"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
              placeholder="e.g. -REV-A"
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_SUFFIXES.filter(Boolean).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSuffix(s)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-400"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Start Number & Digits */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Start Number
            </label>
            <input
              type="number"
              min="0"
              value={startNumber}
              onChange={(e) => setStartNumber(parseInt(e.target.value, 10) || 0)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Total Digits (Padding)
            </label>
            <select
              value={digits}
              onChange={(e) => setDigits(parseInt(e.target.value, 10))}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
            >
              {[1, 2, 3, 4, 5, 6, 8].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? 'digit' : 'digits'} (e.g. {String(1).padStart(d, '0')})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Position & Font */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              <AlignRight className="w-3.5 h-3.5" />
              Position on Page
            </label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as BatesPosition)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
            >
              {POSITION_OPTIONS.map((pos) => (
                <option key={pos.value} value={pos.value}>
                  {pos.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              <Type className="w-3.5 h-3.5" />
              Font & Size
            </label>
            <div className="flex gap-2">
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value as typeof fontFamily)}
                className="w-2/3 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                <option value="Helvetica">Helvetica (Standard)</option>
                <option value="Courier">Courier (Monospace)</option>
                <option value="TimesRoman">Times Roman</option>
              </select>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="w-1/3 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {[8, 9, 10, 11, 12, 14, 16].map((s) => (
                  <option key={s} value={s}>{s}pt</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Color & Margins */}
        <div className="grid grid-cols-2 gap-3 items-center">
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              <Palette className="w-3.5 h-3.5" />
              Text Color
            </label>
            <div className="flex items-center gap-1.5">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border ${color === c ? 'ring-2 ring-indigo-500 ring-offset-1' : 'border-slate-300'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono ml-1"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="w-1/2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Margin X (pt)
              </label>
              <input
                type="number"
                min="0"
                value={marginX}
                onChange={(e) => setMarginX(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
            <div className="w-1/2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Margin Y (pt)
              </label>
              <input
                type="number"
                min="0"
                value={marginY}
                onChange={(e) => setMarginY(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Target Scope */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Apply To
          </label>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="batesScope"
                checked={scope === 'selected'}
                onChange={() => setScope('selected')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>Selected Pages ({initialTargetPages.join(', ')})</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="batesScope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>All Pages ({totalDocumentPages} pages)</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Stamping...' : `Apply Stamp to ${targetCount} Page${targetCount === 1 ? '' : 's'}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
