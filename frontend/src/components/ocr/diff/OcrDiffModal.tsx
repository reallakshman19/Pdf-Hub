/**
 * Side-by-Side OCR Diff & Comparison Modal.
 *
 * Renders word-level token diffs between native PDF text (or ground truth)
 * and OCR recognition results, displaying similarity and error rate metrics.
 *
 * Invariant INV-4 & INV-11 compliant: Accessible modal, no console.log.
 */

import React, { useMemo } from 'react';
import { X, GitCompare, Copy } from 'lucide-react';
import { diffOcrText } from '@/core/ocr/diff/ocrDiffEngine';

export interface OcrDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  referenceTitle?: string;
  referenceText: string;
  ocrTitle?: string;
  ocrText: string;
}

export const OcrDiffModal: React.FC<OcrDiffModalProps> = ({
  isOpen,
  onClose,
  referenceTitle = 'Reference (Ground Truth / Native Text)',
  referenceText,
  ocrTitle = 'OCR Recognition Result',
  ocrText,
}) => {
  if (!isOpen) return null;

  const diffResult = useMemo(() => {
    return diffOcrText(referenceText, ocrText);
  }, [referenceText, ocrText]);

  const { metrics, segments } = diffResult;

  const handleCopySummary = () => {
    const summary = [
      `Similarity: ${metrics.similarity}%`,
      `Word Error Rate (WER): ${metrics.wordErrorRate}`,
      `Character Error Rate (CER): ${metrics.characterErrorRate}`,
      `Equal: ${metrics.equalWords}, Replaced: ${metrics.replacedWords}, Deleted: ${metrics.deletedWords}, Inserted: ${metrics.insertedWords}`,
    ].join('\n');

    navigator.clipboard?.writeText(summary);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      data-testid="ocr-diff-modal"
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-violet-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                OCR Comparison & Error Diff
              </h2>
              <p className="text-xs text-slate-500">
                Word-level discrepancy analysis between ground truth and OCR output
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            data-testid="ocr-diff-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Metrics Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="text-slate-500">Similarity:</span>
              <span
                className={`rounded px-1.5 py-0.5 font-bold ${
                  metrics.similarity >= 90
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : metrics.similarity >= 75
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                }`}
                data-testid="ocr-diff-similarity"
              >
                {metrics.similarity}%
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">WER:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200" data-testid="ocr-diff-wer">
                {metrics.wordErrorRate}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">CER:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {metrics.characterErrorRate}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="text-emerald-600">✓ {metrics.equalWords} equal</span>
            <span className="text-amber-600">✎ {metrics.replacedWords} replaced</span>
            <span className="text-rose-600">- {metrics.deletedWords} deleted</span>
            <span className="text-blue-600">+ {metrics.insertedWords} inserted</span>
          </div>
        </div>

        {/* Diff Flow Canvas */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Aligned Token Diff Flow</span>
            <span className="text-[11px] normal-case text-slate-500">
              Comparing: <strong className="text-slate-700 dark:text-slate-300">{referenceTitle}</strong> vs{' '}
              <strong className="text-slate-700 dark:text-slate-300">{ocrTitle}</strong>
            </span>
          </div>
          <div
            className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 font-mono text-sm leading-relaxed dark:border-slate-800 dark:bg-slate-950/50"
            data-testid="ocr-diff-content"
          >
            {segments.map((seg, idx) => {
              if (seg.op === 'equal') {
                return (
                  <span key={idx} className="text-slate-800 dark:text-slate-200 mr-1.5">
                    {seg.ocrText}
                  </span>
                );
              }
              if (seg.op === 'replace') {
                return (
                  <span key={idx} className="mr-1.5 inline-flex items-center gap-0.5">
                    <span className="rounded bg-rose-100 px-1 text-rose-800 line-through dark:bg-rose-950 dark:text-rose-300">
                      {seg.originalText}
                    </span>
                    <span className="rounded bg-emerald-100 px-1 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {seg.ocrText}
                    </span>
                  </span>
                );
              }
              if (seg.op === 'delete') {
                return (
                  <span
                    key={idx}
                    className="mr-1.5 rounded bg-rose-100 px-1 text-rose-800 line-through dark:bg-rose-950 dark:text-rose-300"
                  >
                    {seg.originalText}
                  </span>
                );
              }
              if (seg.op === 'insert') {
                return (
                  <span
                    key={idx}
                    className="mr-1.5 rounded bg-blue-100 px-1 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                  >
                    {seg.ocrText}
                  </span>
                );
              }
              return null;
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <button
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            data-testid="ocr-diff-copy-summary"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Metrics Summary
          </button>

          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
