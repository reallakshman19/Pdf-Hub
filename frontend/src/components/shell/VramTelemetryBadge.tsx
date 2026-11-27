import React, { useState, useRef, useEffect } from 'react';
import { useVramTelemetryStore, formatBytes } from '@/core/renderer/vramTelemetryStore';

export const VramTelemetryBadge: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const {
    totalCanvasesCount,
    formattedVram,
    status,
    pageCanvasesCount,
    pageVramBytes,
    thumbnailCanvasesCount,
    thumbnailVramBytes,
    peakVramBytes,
    formattedJsHeap,
    jsHeapLimitBytes,
    lastPurgeTimestamp,
    purgeInactiveCaches,
  } = useVramTelemetryStore();

  // Close popover on escape or outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const statusConfig = {
    optimal: {
      dotColor: 'bg-emerald-500',
      label: 'Optimal (<80MB)',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    },
    moderate: {
      dotColor: 'bg-amber-500',
      label: 'Moderate (80–200MB)',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
    critical: {
      dotColor: 'bg-rose-500 animate-pulse',
      label: 'High (>200MB)',
      textColor: 'text-rose-600 dark:text-rose-400',
    },
  }[status];

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-slate-600 dark:text-slate-300 select-none"
        title="Click to view GPU memory telemetry and purge cache"
        aria-expanded={isOpen}
        aria-label={`GPU VRAM: ${formattedVram}, ${totalCanvasesCount} active canvases`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusConfig.dotColor}`} />
        <span className="font-mono text-[10.5px]">
          {formattedVram} ({totalCanvasesCount})
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="VRAM Telemetry Details"
          className="absolute bottom-full mb-2 right-0 w-72 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl text-[11px] font-sans text-slate-700 dark:text-slate-300 z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-medium text-slate-900 dark:text-slate-100 font-mono text-[11.5px]">
              GPU VRAM Telemetry
            </span>
            <span className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 ${statusConfig.textColor}`}>
              {statusConfig.label}
            </span>
          </div>

          <div className="py-2.5 space-y-1.5 font-mono text-[10.5px]">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Page Canvases:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {pageCanvasesCount} active ({formatBytes(pageVramBytes)})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Thumbnail Memory:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {thumbnailCanvasesCount} cards ({formatBytes(thumbnailVramBytes)})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Total Surface VRAM:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formattedVram}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Session Peak VRAM:</span>
              <span className="text-slate-600 dark:text-slate-300">
                {formatBytes(peakVramBytes)}
              </span>
            </div>
            {formattedJsHeap && (
              <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400">JS Heap Used:</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {formattedJsHeap} {jsHeapLimitBytes ? `/ ${formatBytes(jsHeapLimitBytes)}` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => purgeInactiveCaches()}
              className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-[10.5px] font-medium transition-colors cursor-pointer"
            >
              Purge Inactive Cache
            </button>
            {lastPurgeTimestamp && (
              <span className="text-[9.5px] text-slate-400 font-mono">
                Purged
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
