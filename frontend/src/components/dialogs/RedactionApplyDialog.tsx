import React, { useMemo, useState } from 'react';
import { FileText, Lock, ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { RedactionRegion } from '@/core/redaction/types';

export interface RedactionApplyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  regions: readonly RedactionRegion[];
  documentName: string;
  onConfirm: (options: {
    saveAsCopy: boolean;
    outputFileName: string;
    downloadAuditManifest: boolean;
    scrubMetadata?: boolean;
  }) => Promise<void> | void;
}

export const RedactionApplyDialog: React.FC<RedactionApplyDialogProps> = ({
  isOpen,
  onClose,
  regions,
  documentName,
  onConfirm,
}) => {
  const [saveAsCopy, setSaveAsCopy] = useState(true);
  const [downloadAuditManifest, setDownloadAuditManifest] = useState(true);
  const [scrubMetadata, setScrubMetadata] = useState(false);

  const cleanBase = useMemo(() => {
    return documentName.replace(/\.[^/.]+$/, '').trim() || 'document';
  }, [documentName]);

  const [outputFileName, setOutputFileName] = useState(`${cleanBase}_redacted.pdf`);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute affected pages and reasons breakdown
  const affectedPages = useMemo(() => {
    const pages = Array.from(new Set(regions.map((r) => r.pageNumber))).sort((a, b) => a - b);
    return pages;
  }, [regions]);

  const reasonsBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of regions) {
      const reason = r.reason?.trim() || 'Confidential';
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [regions]);

  const canSubmit = regions.length > 0 && (!saveAsCopy || outputFileName.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let finalName = outputFileName.trim();
      if (saveAsCopy && !finalName.toLowerCase().endsWith('.pdf')) {
        finalName = `${finalName}.pdf`;
      }
      await onConfirm({
        saveAsCopy,
        outputFileName: finalName,
        downloadAuditManifest,
        ...(scrubMetadata ? { scrubMetadata: true } : {}),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Apply Permanent Redactions">
      <form onSubmit={handleSubmit} className="space-y-4" data-testid="redaction-apply-dialog">
        {/* Irreversible Security Alert Banner */}
        <div className="flex gap-3 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-800 dark:text-red-300">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <span className="font-semibold block text-sm mb-0.5 text-red-900 dark:text-red-200">
              Irreversible Content Removal
            </span>
            Underlying text operators, characters, annotations, and OCR indexes within marked
            redaction boxes will be permanently removed from the PDF content stream. This cannot
            be undone from the exported file.
          </div>
        </div>

        {/* Summary Card */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
          <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
            <span className="font-medium flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-blue-500" />
              <span>Pending Redactions:</span>
            </span>
            <span className="font-semibold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
              {regions.length} {regions.length === 1 ? 'region' : 'regions'}
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
            <span>Affected Pages:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {affectedPages.length > 0 ? affectedPages.join(', ') : 'None'}
            </span>
          </div>

          {reasonsBreakdown.length > 0 && (
            <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">Categories:</span>
              {reasonsBreakdown.map(([reason, count]) => (
                <span
                  key={reason}
                  className="px-2 py-0.5 text-[11px] rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                >
                  {reason} ({count})
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Safe Output Options */}
        <div className="space-y-3 pt-1">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              data-testid="redaction-save-copy-checkbox"
              checked={saveAsCopy}
              onChange={(e) => setSaveAsCopy(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Save as new redacted copy (Safe Default)
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                Keeps your original active document unchanged and saves the redacted version to a separate file.
              </span>
            </div>
          </label>

          {saveAsCopy && (
            <div className="pl-6 space-y-1">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Redacted Document Name
              </label>
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  data-testid="redaction-filename-input"
                  value={outputFileName}
                  onChange={(e) => setOutputFileName(e.target.value)}
                  placeholder="e.g. document_redacted.pdf"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              data-testid="redaction-audit-checkbox"
              checked={downloadAuditManifest}
              onChange={(e) => setDownloadAuditManifest(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Export cryptographic audit manifest (.json)
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                Generates a verifiable report containing document hashes, purged character counts, and timestamps.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              data-testid="redaction-scrub-metadata-checkbox"
              checked={scrubMetadata}
              onChange={(e) => setScrubMetadata(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Scrub PDF document metadata (/Info &amp; XMP)
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                Strips Title, Author, Subject, Keywords, and embedded XMP metadata packets from the redacted output.
              </span>
            </div>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            data-testid="redaction-confirm-button"
            disabled={!canSubmit || isSubmitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? 'Sanitizing...' : 'Sanitize & Apply Redactions'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
