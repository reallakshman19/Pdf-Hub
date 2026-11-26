import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Info,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { createBlankDocumentPdfBytes } from '@/core/writer-v2/export/exportCurrentWriterPdf';
import { error as logError } from '@/core/logger/service';
import { useToastStore } from '@/core/toast/store';
import {
  PDFA_PROFILES,
  createDefaultPdfAMetadata,
  createDefaultPdfARemediationOptions,
  exportCurrentPdfA,
  runPdfAPreflight,
  type PdfAArchivalMetadata,
  type PdfACheckItem,
  type PdfAConformanceLevel,
  type PdfAPreflightReport,
  type PdfARemediationOptions,
} from '@/core/pdfa';

export interface PdfAExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialConformance?: PdfAConformanceLevel;
}

const CONFORMANCE_ORDER: PdfAConformanceLevel[] = [
  'PDFA_2B',
  'PDFA_2U',
  'PDFA_3B',
  'PDFA_1B',
];

function checkBadgeClasses(check: PdfACheckItem): string {
  if (check.severity === 'pass') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
  }
  if (check.severity === 'blocker') {
    return 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300';
  }
  return check.autoFixable
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
    : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
}

function checkBadgeLabel(check: PdfACheckItem): string {
  if (check.severity === 'pass') return 'Pass';
  if (check.severity === 'blocker') return 'Blocker';
  return check.autoFixable ? 'Auto-Fix' : 'Notice';
}

export const PdfAExportDialog: React.FC<PdfAExportDialogProps> = ({
  isOpen,
  onClose,
  initialConformance = 'PDFA_2B',
}) => {
  const workingBytes = useSessionStore((s) => s.workingBytes);
  const fileName = useSessionStore((s) => s.fileName);
  const beginExportOperation = useSessionStore((s) => s.beginExportOperation);
  const completeSaveOperation = useSessionStore((s) => s.completeSaveOperation);
  const failSaveOperation = useSessionStore((s) => s.failSaveOperation);
  const recordSaveExportAction = useSessionStore((s) => s.recordSaveExportAction);
  const writerMeta = useWriterV2Store((s) => s.documentMeta);
  const addToast = useToastStore((s) => s.addToast);

  const [conformance, setConformance] = useState<PdfAConformanceLevel>(initialConformance);
  const [report, setReport] = useState<PdfAPreflightReport | null>(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<PdfAArchivalMetadata>(() =>
    createDefaultPdfAMetadata(fileName),
  );
  const metadataDirtyRef = useRef(false);

  const [embedStandard14Fonts, setEmbedStandard14Fonts] = useState(true);
  const [substituteExternalUnembeddedFonts, setSubstituteExternalUnembeddedFonts] = useState(false);
  const [flattenAnnotations, setFlattenAnnotations] = useState(true);
  const [stripUnsafeActionsAndJs, setStripUnsafeActionsAndJs] = useState(true);
  const [stripNonCompliantAttachments, setStripNonCompliantAttachments] = useState(
    initialConformance !== 'PDFA_3B',
  );
  const [attachAuditCertificateInPdfA3b, setAttachAuditCertificateInPdfA3b] = useState(true);
  const [rasterizeTransparentPagesFor1b, setRasterizeTransparentPagesFor1b] = useState(false);
  const [downloadCertificate, setDownloadCertificate] = useState(true);
  const [showFontDetails, setShowFontDetails] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const selectConformance = (nextLevel: PdfAConformanceLevel) => {
    setConformance(nextLevel);
    setExportError(null);
    if (nextLevel === 'PDFA_3B') {
      setStripNonCompliantAttachments(false);
      setAttachAuditCertificateInPdfA3b(true);
    } else {
      setStripNonCompliantAttachments(true);
    }
    if (nextLevel !== 'PDFA_1B') {
      setRasterizeTransparentPagesFor1b(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    let active = true;

    const loadPreflight = async () => {
      setLoadingPreflight(true);
      setPreflightError(null);
      try {
        let bytes = workingBytes;
        if (!bytes && writerMeta?.mode === 'blankDocument') {
          bytes = await createBlankDocumentPdfBytes(writerMeta);
        }
        if (!bytes) {
          if (active) {
            setReport(null);
            setPreflightError('Open a PDF or Writer document before running PDF/A preflight.');
          }
          return;
        }
        const result = await runPdfAPreflight(bytes, conformance, {
          signal: controller.signal,
          fileName: fileName ?? undefined,
        });
        if (!active || controller.signal.aborted) return;
        setReport(result);
        if (!metadataDirtyRef.current) {
          setMetadata(result.metadata);
        }
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setPreflightError(
          err instanceof Error ? err.message : 'Unable to complete PDF/A preflight inspection.',
        );
      } finally {
        if (active) setLoadingPreflight(false);
      }
    };

    void loadPreflight();
    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen, workingBytes, writerMeta, conformance, fileName]);

  const hasExternalFontBlocker = useMemo(
    () => Boolean(report?.fonts.some((f) => f.classification === 'unembedded-external')),
    [report],
  );

  const has1bTransparencyBlocker = useMemo(
    () => conformance === 'PDFA_1B' && Boolean(report?.hasTransparency),
    [conformance, report],
  );

  const effectiveCanExport = useMemo(() => {
    if (!report || loadingPreflight || isExporting) return false;
    if (report.isEncrypted) return false;
    if (hasExternalFontBlocker && !substituteExternalUnembeddedFonts) return false;
    if (has1bTransparencyBlocker && !rasterizeTransparentPagesFor1b) return false;
    const hasHardUnresolvedBlocker = report.checks.some((check) => {
      if (check.severity !== 'blocker') return false;
      if (check.id === 'PDFA-FONTS-EXT' && substituteExternalUnembeddedFonts) return false;
      if (check.id === 'PDFA-TRANSP' && rasterizeTransparentPagesFor1b) return false;
      return true;
    });
    return !hasHardUnresolvedBlocker;
  }, [
    report,
    loadingPreflight,
    isExporting,
    hasExternalFontBlocker,
    substituteExternalUnembeddedFonts,
    has1bTransparencyBlocker,
    rasterizeTransparentPagesFor1b,
  ]);

  const updateMetaField = <K extends keyof PdfAArchivalMetadata>(
    key: K,
    value: PdfAArchivalMetadata[K],
  ) => {
    metadataDirtyRef.current = true;
    setMetadata((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!effectiveCanExport) return;

    setIsExporting(true);
    setExportError(null);

    const defaults = createDefaultPdfARemediationOptions(conformance, metadata);
    const options: PdfARemediationOptions = {
      ...defaults,
      targetConformance: conformance,
      metadata,
      embedStandard14Fonts,
      substituteExternalUnembeddedFonts,
      flattenAnnotations,
      stripUnsafeActionsAndJs,
      stripNonCompliantAttachments,
      attachAuditCertificateInPdfA3b,
      rasterizeTransparentPagesFor1b,
    };

    try {
      const profile = PDFA_PROFILES[conformance];
      beginExportOperation(`Exporting ${profile.shortLabel} archival copy…`);
      const result = await exportCurrentPdfA({ options, fileName: fileName ?? undefined });
      const baseName = (fileName ?? metadata.title ?? 'document').replace(/\.pdf$/i, '').trim() || 'document';
      const suffix = conformance.toLowerCase().replace('_', '-');
      const exportName = `${baseName}-${suffix}.pdf`;

      await FileAdapter.savePdfBytes(result.bytes, exportName, null);

      if (downloadCertificate) {
        const certJson = JSON.stringify(result.certificate, null, 2);
        const certBytes = new TextEncoder().encode(certJson);
        FileAdapter.downloadBytes(certBytes, `${baseName}-${suffix}-report.json`, 'application/json');
      }

      const statusMsg = result.certificate.passed
        ? `Exported verified ${profile.shortLabel} copy to ${exportName}`
        : `Exported ${exportName} with ${result.certificate.remainingBlockers.length} blocker notice(s)`;

      completeSaveOperation(statusMsg);
      recordSaveExportAction({ type: 'EXPORT_PDFA_ARCHIVE' }, 'success', statusMsg);
      addToast({
        type: result.certificate.passed ? 'success' : 'info',
        title: result.certificate.passed ? `${profile.shortLabel} Exported` : 'PDF/A Export Finished with Notices',
        message: statusMsg,
      });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('pdfa', 'Archival PDF/A export failed', { error: message, conformance, fileName });
      setExportError(message);
      failSaveOperation(message);
      recordSaveExportAction({ type: 'EXPORT_PDFA_ARCHIVE' }, 'failure', message);
      addToast({
        type: 'error',
        title: 'PDF/A Export Failed',
        message,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Archival PDF/A" size="xl">
      <form onSubmit={handleExport} className="space-y-4" data-testid="pdfa-export-dialog">
        {/* Conformance Profile Picker */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
            ISO 19005 Conformance Level
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONFORMANCE_ORDER.map((level) => {
              const p = PDFA_PROFILES[level];
              const active = conformance === level;
              return (
                <button
                  key={level}
                  type="button"
                  data-testid={`pdfa-level-${level}`}
                  onClick={() => selectConformance(level)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    active
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-1 ring-blue-500'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {p.label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                      PDF {p.pdfVersionLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    {p.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Signature Rewrite Warning */}
        {report && report.signatureStatus !== 'UNSIGNED' && (
          <div
            data-testid="pdfa-signature-warning"
            className="flex gap-2.5 p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Digital Signature Notice: </span>
              {report.signatureStatus === 'SIGNED'
                ? `This PDF carries ${report.signatureCount} signature(s). Writing an archival PDF/A copy invalidates existing cryptographic signatures in the exported file; your open document remains unchanged.`
                : 'Signature state could not be ruled out; archival export rewrites PDF structures and may invalidate any present signatures.'}
            </div>
          </div>
        )}

        {/* Preflight Audit Status */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              {loadingPreflight ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              ) : report?.readyWithoutRemediation ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ) : (
                <FileCheck2 className="w-4 h-4 text-blue-600" />
              )}
              <span>
                {loadingPreflight
                  ? 'Running ISO 19005 Preflight Audit…'
                  : report?.readyWithoutRemediation
                  ? 'Source Meets Selected PDF/A Profile'
                  : effectiveCanExport
                  ? 'Ready for Auto-Remediation & Export'
                  : 'Compliance Blocker Requires Selection'}
              </span>
            </div>

            {report && (
              <button
                type="button"
                onClick={() => setShowFontDetails((prev) => !prev)}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showFontDetails ? 'Hide Font Audit' : `Fonts (${report.fonts.length})`}
              </button>
            )}
          </div>

          {preflightError && (
            <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>{preflightError}</span>
            </div>
          )}

          {report && (
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {report.checks.map((check) => (
                <div
                  key={check.id}
                  data-testid={`pdfa-check-${check.id}`}
                  className="flex items-start justify-between gap-2 rounded border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950/70 px-2.5 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {check.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {check.detail}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${checkBadgeClasses(check)}`}
                  >
                    {checkBadgeLabel(check)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {showFontDetails && report && (
            <div className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 max-h-36 overflow-y-auto">
              {report.fonts.length === 0 ? (
                <div className="text-[11px] text-slate-500">No font resources referenced in document pages.</div>
              ) : (
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-1 pr-2">Font</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1 pr-2">ToUnicode</th>
                      <th className="py-1">Pages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.fonts.map((font) => (
                      <tr key={`${font.resourceName}:${font.baseFont}`} className="border-b border-slate-100 dark:border-slate-900">
                        <td className="py-1 pr-2 font-mono">{font.baseFont}</td>
                        <td className="py-1 pr-2">{font.classification}</td>
                        <td className="py-1 pr-2">{font.hasToUnicode ? 'Yes' : 'No'}</td>
                        <td className="py-1">{font.pages.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Archival XMP & Info Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label htmlFor="pdfa-meta-title" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Document Title
            </label>
            <input
              id="pdfa-meta-title"
              type="text"
              value={metadata.title}
              onChange={(e) => updateMetaField('title', e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label htmlFor="pdfa-meta-author" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Author / Creator
            </label>
            <input
              id="pdfa-meta-author"
              type="text"
              value={metadata.author}
              onChange={(e) => updateMetaField('author', e.target.value)}
              placeholder="Optional"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label htmlFor="pdfa-meta-subject" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Subject / Description
            </label>
            <input
              id="pdfa-meta-subject"
              type="text"
              value={metadata.subject}
              onChange={(e) => updateMetaField('subject', e.target.value)}
              placeholder="Optional"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="pdfa-meta-lang" className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Language Tag
              </label>
              <input
                id="pdfa-meta-lang"
                type="text"
                value={metadata.language}
                onChange={(e) => updateMetaField('language', e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <span className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Color Intent
              </span>
              <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 px-2 py-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">
                sRGB IEC61966-2.1
              </div>
            </div>
          </div>
        </div>

        {/* Remediation Toggles */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2 text-xs">
          <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-500" />
            <span>Remediation & Archival Packaging</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px] text-slate-700 dark:text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={embedStandard14Fonts}
                onChange={(e) => setEmbedStandard14Fonts(e.target.checked)}
              />
              <span>Embed Standard-14 fonts (Liberation / Foxit)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={flattenAnnotations}
                onChange={(e) => setFlattenAnnotations(e.target.checked)}
              />
              <span>Flatten annotations &amp; Writer overlays</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stripUnsafeActionsAndJs}
                onChange={(e) => setStripUnsafeActionsAndJs(e.target.checked)}
              />
              <span>Strip JavaScript &amp; interactive triggers</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={downloadCertificate}
                onChange={(e) => setDownloadCertificate(e.target.checked)}
              />
              <span>Download JSON compliance certificate</span>
            </label>

            {conformance === 'PDFA_3B' ? (
              <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  checked={attachAuditCertificateInPdfA3b}
                  onChange={(e) => setAttachAuditCertificateInPdfA3b(e.target.checked)}
                />
                <span>Attach archival summary JSON via Catalog /AF (/AFRelationship Supplement)</span>
              </label>
            ) : (
              report && report.attachments.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={stripNonCompliantAttachments}
                    onChange={(e) => setStripNonCompliantAttachments(e.target.checked)}
                  />
                  <span>Strip non-archival attachments ({report.attachments.length})</span>
                </label>
              )
            )}
          </div>

          {hasExternalFontBlocker && (
            <label className="flex items-start gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-800 text-[11.5px] text-amber-800 dark:text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={substituteExternalUnembeddedFonts}
                onChange={(e) => setSubstituteExternalUnembeddedFonts(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Substitute unembedded external font(s) with Liberation Sans fallback metrics (may slightly adjust line breaks)
              </span>
            </label>
          )}

          {has1bTransparencyBlocker && (
            <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <label className="flex items-start gap-2 text-[11.5px] text-amber-800 dark:text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rasterizeTransparentPagesFor1b}
                  onChange={(e) => setRasterizeTransparentPagesFor1b(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Rasterize transparent pages onto opaque white RGB for PDF/A-1b (disables selectable vector text on rasterized export)
                </span>
              </label>
              <div>
                <button
                  type="button"
                  onClick={() => selectConformance('PDFA_2B')}
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Switch to PDF/A-2b to keep crisp vectors &amp; transparency →
                </button>
              </div>
            </div>
          )}
        </div>

        {exportError && (
          <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {exportError}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Active editing session remains untouched.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="pdfa-export-submit"
              disabled={!effectiveCanExport}
            >
              {isExporting ? 'Exporting PDF/A…' : `Export ${PDFA_PROFILES[conformance].shortLabel}`}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
