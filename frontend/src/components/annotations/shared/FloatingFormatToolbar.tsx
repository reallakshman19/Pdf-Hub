import React, { useState } from 'react';
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  X,
  RotateCw,
  Palette,
} from 'lucide-react';

export interface FloatingFormatToolbarProps {
  fontSize: number;
  fontWeight?: string | number;
  fontStyle?: string;
  textColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  rotation?: number;
  isUnrotated?: boolean;
  onToggleUnrotate?: () => void;
  onUpdateStyle: (patch: Record<string, unknown>) => void;
  onInsertSymbol: (symbol: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

const CAD_SYMBOLS = [
  { label: 'Ø', name: 'Diameter' },
  { label: '°', name: 'Degree' },
  { label: '±', name: 'Plus/Minus' },
  { label: '℄', name: 'Centerline' },
  { label: 'Δ', name: 'Delta' },
  { label: 'µ', name: 'Micro' },
  { label: 'Ω', name: 'Ohm' },
  { label: '²', name: 'Squared' },
  { label: '³', name: 'Cubed' },
  { label: '≤', name: 'Less or equal' },
  { label: '≥', name: 'Greater or equal' },
  { label: '≈', name: 'Approx' },
  { label: '≠', name: 'Not equal' },
];

const QUICK_COLORS = [
  '#111827', // Black / Dark Slate
  '#dc2626', // Red
  '#2563eb', // Blue
  '#16a34a', // Green
  '#d97706', // Amber
  '#7c3aed', // Purple
  '#ffffff', // White
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 32];

export const FloatingFormatToolbar: React.FC<FloatingFormatToolbarProps> = ({
  fontSize,
  fontWeight = 'normal',
  fontStyle = 'normal',
  textColor = '#111827',
  backgroundColor,
  textAlign = 'left',
  rotation = 0,
  isUnrotated = false,
  onToggleUnrotate,
  onUpdateStyle,
  onInsertSymbol,
  onCommit,
  onCancel,
}) => {
  const [showSymbols, setShowSymbols] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const isBold = fontWeight === 'bold' || fontWeight === 700 || fontWeight === '700';
  const isItalic = fontStyle === 'italic';
  const isTransparentBg = backgroundColor === 'transparent';
  const hasRotation = rotation % 360 !== 0;

  return (
    <div
      data-testid="floating-format-toolbar"
      className="absolute -top-11 left-0 z-50 flex items-center gap-1 p-1 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl text-slate-800 dark:text-slate-200 select-none pointer-events-auto"
      style={{ transform: 'translateY(-4px)' }}
      onPointerDown={(e) => {
        // Prevent clicking toolbar items from stealing focus / blurring the textarea
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Font Size Selector */}
      <select
        value={fontSize}
        onChange={(e) => onUpdateStyle({ fontSize: Number(e.target.value) })}
        className="h-6 px-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none"
        title="Font Size"
      >
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}pt
          </option>
        ))}
      </select>

      {/* Bold Toggle */}
      <button
        type="button"
        title="Bold"
        onClick={() => onUpdateStyle({ fontWeight: isBold ? 'normal' : 'bold' })}
        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
          isBold
            ? 'bg-blue-600 text-white'
            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
        }`}
      >
        <Bold className="w-3.5 h-3.5" />
      </button>

      {/* Italic Toggle */}
      <button
        type="button"
        title="Italic"
        onClick={() => onUpdateStyle({ fontStyle: isItalic ? 'normal' : 'italic' })}
        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
          isItalic
            ? 'bg-blue-600 text-white'
            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
        }`}
      >
        <Italic className="w-3.5 h-3.5" />
      </button>

      <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* Alignment Buttons */}
      <div className="flex items-center rounded border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/60">
        <button
          type="button"
          title="Align Left"
          onClick={() => onUpdateStyle({ textAlign: 'left' })}
          className={`w-5 h-5 flex items-center justify-center rounded ${
            textAlign === 'left' ? 'bg-white dark:bg-slate-700 shadow-xs text-blue-600' : 'text-slate-500'
          }`}
        >
          <AlignLeft className="w-3 h-3" />
        </button>
        <button
          type="button"
          title="Align Center"
          onClick={() => onUpdateStyle({ textAlign: 'center' })}
          className={`w-5 h-5 flex items-center justify-center rounded ${
            textAlign === 'center' ? 'bg-white dark:bg-slate-700 shadow-xs text-blue-600' : 'text-slate-500'
          }`}
        >
          <AlignCenter className="w-3 h-3" />
        </button>
        <button
          type="button"
          title="Align Right"
          onClick={() => onUpdateStyle({ textAlign: 'right' })}
          className={`w-5 h-5 flex items-center justify-center rounded ${
            textAlign === 'right' ? 'bg-white dark:bg-slate-700 shadow-xs text-blue-600' : 'text-slate-500'
          }`}
        >
          <AlignRight className="w-3 h-3" />
        </button>
      </div>

      <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* Color Palette Popover Button */}
      <div className="relative">
        <button
          type="button"
          title="Text & Background Color"
          onClick={() => {
            setShowColorPicker(!showColorPicker);
            setShowSymbols(false);
          }}
          className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
            showColorPicker
              ? 'bg-slate-200 dark:bg-slate-700'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <Palette className="w-3.5 h-3.5" style={{ color: textColor }} />
        </button>

        {showColorPicker && (
          <div
            className="absolute top-8 left-0 z-50 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col gap-2 min-w-[150px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div>
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Text Color
              </span>
              <div className="flex items-center gap-1.5">
                {QUICK_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    style={{ backgroundColor: col }}
                    onClick={() => {
                      onUpdateStyle({ textColor: col });
                      setShowColorPicker(false);
                    }}
                    className={`w-5 h-5 rounded-full border ${
                      textColor.toLowerCase() === col.toLowerCase()
                        ? 'ring-2 ring-blue-500 ring-offset-1'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Background Fill
              </span>
              <button
                type="button"
                onClick={() => {
                  onUpdateStyle({ backgroundColor: isTransparentBg ? '#ffffff' : 'transparent' });
                  setShowColorPicker(false);
                }}
                className={`w-full py-1 text-[11px] font-medium rounded border transition-colors ${
                  isTransparentBg
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {isTransparentBg ? 'Transparent Fill (Active)' : 'Make Transparent'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CAD Symbols Palette Popover */}
      <div className="relative">
        <button
          type="button"
          title="Insert Engineering Symbol (Ø, ±, °, ℄, Δ)"
          onClick={() => {
            setShowSymbols(!showSymbols);
            setShowColorPicker(false);
          }}
          className={`h-6 px-1.5 flex items-center justify-center font-bold text-xs rounded transition-colors ${
            showSymbols
              ? 'bg-blue-600 text-white'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          Ø±
        </button>

        {showSymbols && (
          <div
            className="absolute top-8 left-0 z-50 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl grid grid-cols-4 gap-1 min-w-[140px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {CAD_SYMBOLS.map((sym) => (
              <button
                key={sym.label}
                type="button"
                title={sym.name}
                onClick={() => {
                  onInsertSymbol(sym.label);
                  setShowSymbols(false);
                }}
                className="w-7 h-7 flex items-center justify-center text-xs font-semibold rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 transition-colors border border-transparent hover:border-blue-200"
              >
                {sym.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Unrotate for Horizontal Typing Button (Only if rotated) */}
      {hasRotation && onToggleUnrotate && (
        <button
          type="button"
          title={isUnrotated ? 'Restore Annotation Rotation' : 'Unrotate for Horizontal Typing'}
          onClick={onToggleUnrotate}
          className={`h-6 px-1.5 flex items-center gap-1 rounded text-[11px] font-medium transition-colors ${
            isUnrotated
              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <RotateCw className="w-3 h-3" />
          <span>{isUnrotated ? 'Unrotated' : 'Level'}</span>
        </button>
      )}

      <div className="w-[1px] h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* Commit (Save) */}
      <button
        type="button"
        title="Commit (Enter)"
        onClick={onCommit}
        className="w-6 h-6 flex items-center justify-center rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
      </button>

      {/* Cancel */}
      <button
        type="button"
        title="Cancel (Escape)"
        onClick={onCancel}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-600 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
