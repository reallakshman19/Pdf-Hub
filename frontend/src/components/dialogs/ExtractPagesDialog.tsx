import React, { useState, useId } from 'react';
import { Download, Scissors, Split, AlertCircle, X, Archive } from 'lucide-react';
import { parsePageRange } from '@/core/pages/pageRangeParser';

export interface ExtractPagesDialogProps {
  isOpen: boolean;
  documentFileName: string;
  currentPage: number;
  totalDocumentPages: number;
  selectedPages: number[];
  initialMode?: 'extract' | 'split';
  onClose: () => void;
  onConfirm: (config: {
    pageIndices: number[];
    mode: 'extract' | 'split';
    outputFileName: string;
    packageAsZip?: boolean;
  }) => void;
}

export const ExtractPagesDialog: React.FC<ExtractPagesDialogProps> = ({
  isOpen,
  documentFileName,
  currentPage,
  totalDocumentPages,
  selectedPages,
  initialMode = 'extract',
  onClose,
  onConfirm,
}) => {
  const rangeInputId = useId();
  const filenameInputId = useId();
  const zipCheckboxId = useId();

  const defaultInitialRange =
    selectedPages.length > 0
      ? selectedPages.join(', ')
      : String(currentPage || 1);

  const [rawRange, setRawRange] = useState(defaultInitialRange);
  const [mode, setMode] = useState<'extract' | 'split'>(initialMode);
  const [packageAsZip, setPackageAsZip] = useState(false);

  const baseName = documentFileName.replace(/\.[^/.]+$/, '') || 'document';
  const defaultFileName =
    mode === 'split' ? `${baseName}_split.pdf` : `${baseName}_extracted.pdf`;
  const [outputFileName, setOutputFileName] = useState(defaultFileName);

  if (!isOpen) return null;

  const parseResult = parsePageRange(rawRange, totalDocumentPages);
  const isRangeValid = parseResult.ok;

  // Split mode validation: cannot split all pages from the document
  const isSplittingAll =
    mode === 'split' &&
    parseResult.ok &&
    parseResult.indices.length >= totalDocumentPages;

  const canSubmit = isRangeValid && !isSplittingAll && outputFileName.trim().length > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !parseResult.ok) return;

    let finalName = outputFileName.trim();
    if (packageAsZip) {
      if (!finalName.toLowerCase().endsWith('.zip')) {
        finalName += '.zip';
      }
    } else if (!finalName.toLowerCase().endsWith('.pdf')) {
      finalName += '.pdf';
    }

    onConfirm({
      pageIndices: parseResult.indices,
      mode,
      outputFileName: finalName,
      ...(packageAsZip ? { packageAsZip: true } : {}),
    });
  };

  const handleZipToggle = (checked: boolean) => {
    setPackageAsZip(checked);
    if (checked) {
      setOutputFileName(
        mode === 'split' ? `${baseName}_split_pages.zip` : `${baseName}_extracted_pages.zip`,
      );
    } else {
      setOutputFileName(
        mode === 'split' ? `${baseName}_split.pdf` : `${baseName}_extracted.pdf`,
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extract-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              {mode === 'split' ? <Split className="w-5 h-5" /> : <Scissors className="w-5 h-5" />}
            </div>
            <div>
              <h2 id="extract-dialog-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {mode === 'split' ? 'Split Document' : 'Extract Pages'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {documentFileName} ({totalDocumentPages} pages)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Operation Mode Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Operation Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="mode-extract-button"
                onClick={() => {
                  setMode('extract');
                  setOutputFileName(`${baseName}_extracted.pdf`);
                }}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                  mode === 'extract'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <Scissors className="w-4 h-4" />
                <div className="text-left">
                  <div>Extract Pages</div>
                  <div className="text-[10px] opacity-75 font-normal">Keep pages in original</div>
                </div>
              </button>
              <button
                type="button"
                data-testid="mode-split-button"
                onClick={() => {
                  setMode('split');
                  setOutputFileName(`${baseName}_split.pdf`);
                }}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                  mode === 'split'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <Split className="w-4 h-4" />
                <div className="text-left">
                  <div>Split Document</div>
                  <div className="text-[10px] opacity-75 font-normal">Remove from original</div>
                </div>
              </button>
            </div>
          </div>

          {/* Page Range Input */}
          <div>
            <label htmlFor={rangeInputId} className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Pages to {mode === 'split' ? 'Split' : 'Extract'}
            </label>
            <input
              id={rangeInputId}
              data-testid="extract-page-range-input"
              type="text"
              value={rawRange}
              onChange={(e) => setRawRange(e.target.value)}
              placeholder={`e.g. 1-3, 5 or all (1 to ${totalDocumentPages})`}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {parseResult.ok ? (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {parseResult.indices.length} page(s) selected: {parseResult.indices.map((i) => i + 1).join(', ')}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-rose-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {parseResult.error}
              </p>
            )}
            {isSplittingAll && (
              <p className="mt-1 text-[11px] text-rose-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Cannot split every page. At least one page must remain in the document.
              </p>
            )}
          </div>

          {/* Output Filename Input */}
          <div>
            <label htmlFor={filenameInputId} className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Download Filename
            </label>
            <input
              id={filenameInputId}
              data-testid="extract-filename-input"
              type="text"
              value={outputFileName}
              onChange={(e) => setOutputFileName(e.target.value)}
              placeholder="e.g. extracted_pages.pdf"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            />
          </div>

          {/* Package as ZIP Option */}
          <div className="flex items-center gap-2 pt-1">
            <input
              id={zipCheckboxId}
              data-testid="extract-zip-checkbox"
              type="checkbox"
              checked={packageAsZip}
              onChange={(e) => handleZipToggle(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor={zipCheckboxId} className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1.5 select-none">
              <Archive className="w-3.5 h-3.5 text-slate-500" />
              <span>Package into individual files (.zip)</span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="extract-submit-button"
              disabled={!canSubmit}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg text-white transition-all shadow-sm ${
                canSubmit
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  : 'bg-slate-300 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              {mode === 'split' ? 'Split & Download' : 'Extract & Download'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
