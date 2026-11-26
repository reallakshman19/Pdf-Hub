import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileCheck2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { createBlankDocumentPdfBytes } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import {
  PDFA_PROFILES,
  runPdfAPreflight,
  type PdfAConformanceLevel,
  type PdfAPreflightReport,
} from '@/core/pdfa';
import { PdfAExportDialog } from '@/components/dialogs/PdfAExportDialog';

const LEVELS: PdfAConformanceLevel[] = ['PDFA_2B', 'PDFA_2U', 'PDFA_3B', 'PDFA_1B'];

export const ComplianceInspectorTab: React.FC = () => {
  const workingBytes = useSessionStore((s) => s.workingBytes);
  const documentKey = useSessionStore((s) => s.documentKey);
  const fileName = useSessionStore((s) => s.fileName);
  const writerMeta = useWriterV2Store((s) => s.documentMeta);

  const [target, setTarget] = useState<PdfAConformanceLevel>('PDFA_2B');
  const [report, setReport] = useState<PdfAPreflightReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const hasSource = Boolean(workingBytes || writerMeta?.mode === 'blankDocument');

  useEffect(() => {
    if (!hasSource) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    const inspect = async () => {
      setLoading(true);
      setError(null);
      try {
        let bytes = workingBytes;
        if (!bytes && writerMeta?.mode === 'blankDocument') {
          bytes = await createBlankDocumentPdfBytes(writerMeta);
        }
        if (!bytes) return;

        const nextReport = await runPdfAPreflight(bytes, target, {
          signal: controller.signal,
          fileName: fileName ?? undefined,
        });
        if (!active || controller.signal.aborted) return;
        setReport(nextReport);
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'PDF/A inspection failed.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void inspect();
    return () => {
      active = false;
      controller.abort();
    };
  }, [hasSource, workingBytes, writerMeta, documentKey, fileName, target, refreshNonce]);

  if (!hasSource) {
    return (
      <div className="p-4 text-center space-y-2" data-testid="compliance-inspector-empty">
        <div className="mx-auto h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
          <FileCheck2 className="w-5 h-5" />
        </div>
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
          No active document
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Open a PDF or create a Writer document to run ISO 19005 archival preflight checks.
        </div>
      </div>
    );
  }

  const blockerCount = report?.checks.filter((c) => c.severity === 'blocker').length ?? 0;
  const warningCount = report?.checks.filter((c) => c.severity === 'warning').length ?? 0;
  const embeddedFontsCount = report?.fonts.filter((f) => f.embedded).length ?? 0;

  return (
    <div className="p-4 space-y-4 text-xs" data-testid="compliance-inspector-tab">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[11px]">
          Target Standard
        </span>
        <button
          type="button"
          onClick={() => setRefreshNonce((n) => n + 1)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
          title="Re-run preflight scan"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Re-check</span>
        </button>
      </div>

      <select
        aria-label="Target PDF/A Standard"
        value={target}
        onChange={(e) => setTarget(e.target.value as PdfAConformanceLevel)}
        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium"
      >
        {LEVELS.map((lvl) => (
          <option key={lvl} value={lvl}>
            {PDFA_PROFILES[lvl].label}
          </option>
        ))}
      </select>

      {loading && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 text-slate-600 dark:text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span>Inspecting PDF structure, fonts &amp; ICC profiles…</span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {report && !loading && (
        <>
          <div
            className={`rounded-lg border p-3 flex items-start gap-2.5 ${
              report.readyWithoutRemediation
                ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                : blockerCount > 0
                ? 'border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-red-900 dark:text-red-200'
                : 'border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
            }`}
          >
            {report.readyWithoutRemediation ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : blockerCount > 0 ? (
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="font-semibold">
                {report.readyWithoutRemediation
                  ? `${PDFA_PROFILES[target].shortLabel} Compliant`
                  : blockerCount > 0
                  ? `${blockerCount} Blocker(s) Detected`
                  : `${warningCount} Item(s) Ready for Auto-Remediation`}
              </div>
              <div className="text-[11px] opacity-90 mt-0.5">
                {report.declaredPdfAPart
                  ? `Declared PDF/A-${report.declaredPdfAPart}${report.declaredPdfAConformance?.toLowerCase() ?? ''}`
                  : 'No PDF/A XMP claim yet'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2">
              <div className="text-[10px] text-slate-500">Fonts Embedded</div>
              <div className="font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
                {embeddedFontsCount} / {report.fonts.length}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2">
              <div className="text-[10px] text-slate-500">OutputIntent ICC</div>
              <div className="font-semibold text-slate-800 dark:text-slate-100 mt-0.5 truncate">
                {report.hasOutputIntent ? report.outputIntentSummary ?? 'Present' : 'Missing'}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {report.checks.map((check) => (
              <div
                key={check.id}
                className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 space-y-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {check.title}
                  </span>
                  {check.severity === 'pass' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : check.severity === 'blocker' ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {check.detail}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Button
        type="button"
        className="w-full justify-center gap-2"
        data-testid="compliance-open-export-btn"
        onClick={() => setExportDialogOpen(true)}
      >
        <Archive className="w-4 h-4" />
        <span>Open Archival Export &amp; Remediation…</span>
      </Button>

      {exportDialogOpen && (
        <PdfAExportDialog
          isOpen
          onClose={() => setExportDialogOpen(false)}
          initialConformance={target}
        />
      )}
    </div>
  );
};
