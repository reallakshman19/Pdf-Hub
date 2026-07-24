import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Search,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSessionStore } from '@/core/session/store';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import type { PageSelector } from '@/core/macro/types';
import {
  buildPsIsonoteAnnotationRecipe,
  scanPsIsonoteReferences,
  type PsIsonotePlacement,
  type PsIsonoteScanResult,
} from '@/core/macro/psIsonote/psIsonoteRecipe';
import {
  buildPsIsonoteAuditReport,
  serializePsIsonoteSummaryCsv,
  type PsIsonoteAuditReport,
} from '@/core/macro/psIsonote/psIsonoteAudit';
import {
  parsePsIsonoteTable,
  type PsIsonoteParseResult,
} from '@/core/macro/psIsonote/psIsonoteTable';

interface ParsedState {
  result: PsIsonoteParseResult | null;
  error: string | null;
}

type ScopeMode = 'all' | 'current' | 'selected';

interface ScanArtifact {
  documentBytes: Uint8Array;
  sourceText: string;
  scope: ScopeMode;
  skipExisting: boolean;
  currentPage: number;
  selectedPagesKey: string;
  result: PsIsonoteScanResult;
}

interface AuditArtifact {
  sourceText: string;
  documentName: string;
  report: PsIsonoteAuditReport;
}

function parseSource(sourceText: string): ParsedState {
  if (!sourceText.trim()) return { result: null, error: null };
  try {
    return { result: parsePsIsonoteTable(sourceText), error: null };
  } catch (error) {
    return {
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildSelector(scope: ScopeMode): PageSelector {
  if (scope === 'current') return { mode: 'current' };
  if (scope === 'selected') return { mode: 'selected' };
  return { mode: 'all' };
}

function delimiterLabel(delimiter: PsIsonoteParseResult['delimiter']): string {
  if (delimiter === '\t') return 'tab';
  if (delimiter === '|') return 'pipe';
  if (delimiter === ';') return 'semicolon';
  return 'comma';
}

function auditFileName(documentName: string): string {
  const stem = documentName.replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_');
  return `${stem || 'document'}-ps-isonote-audit.csv`;
}

function downloadAuditCsv(report: PsIsonoteAuditReport, documentName: string): void {
  const blob = new Blob([serializePsIsonoteSummaryCsv(report)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = auditFileName(documentName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function confidenceLabel(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

export const PsIsonoteRecipeBuilder: React.FC = () => {
  const { workingBytes, fileName, pageCount, selectedPages, viewState } = useSessionStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [sourceText, setSourceText] = React.useState('');
  const [sourceName, setSourceName] = React.useState('');
  const [scope, setScope] = React.useState<ScopeMode>('all');
  const [placement, setPlacement] = React.useState<PsIsonotePlacement>('auto');
  const [noteWidth, setNoteWidth] = React.useState(220);
  const [fontSize, setFontSize] = React.useState(10);
  const [includeFamily, setIncludeFamily] = React.useState(true);
  const [skipExisting, setSkipExisting] = React.useState(true);
  const [scanArtifact, setScanArtifact] = React.useState<ScanArtifact | null>(null);
  const [auditArtifact, setAuditArtifact] = React.useState<AuditArtifact | null>(null);
  const [isScanning, setIsScanning] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const parsedState = React.useMemo(() => parseSource(sourceText), [sourceText]);
  const selectedPagesKey = selectedPages.join(',');
  const scanResult = scanArtifact &&
    scanArtifact.documentBytes === workingBytes &&
    scanArtifact.sourceText === sourceText &&
    scanArtifact.scope === scope &&
    scanArtifact.skipExisting === skipExisting &&
    scanArtifact.currentPage === viewState.currentPage &&
    scanArtifact.selectedPagesKey === selectedPagesKey
    ? scanArtifact.result
    : null;
  const auditReport = auditArtifact?.sourceText === sourceText
    ? auditArtifact.report
    : null;

  const runScan = React.useCallback(async (): Promise<PsIsonoteScanResult> => {
    if (!workingBytes) {
      throw new Error('Open a PDF before scanning for PS numbers.');
    }
    if (!parsedState.result) {
      throw new Error(parsedState.error ?? 'Load or paste a PS No. versus ISONOTE table.');
    }
    if (scope === 'selected' && selectedPages.length === 0) {
      throw new Error('Select at least one PDF page, or change the scope.');
    }

    return scanPsIsonoteReferences(workingBytes, parsedState.result.mappings, {
      selector: buildSelector(scope),
      currentPage: viewState.currentPage,
      selectedPages,
      skipExisting,
    });
  }, [parsedState, scope, selectedPages, skipExisting, viewState.currentPage, workingBytes]);

  const recordScanResult = (result: PsIsonoteScanResult) => {
    if (!workingBytes) return;
    setScanArtifact({
      documentBytes: workingBytes,
      sourceText,
      scope,
      skipExisting,
      currentPage: viewState.currentPage,
      selectedPagesKey,
      result,
    });
  };

  const recordAudit = (
    result: PsIsonoteScanResult,
    phase: PsIsonoteAuditReport['phase'],
    failureMessage?: string,
  ) => {
    if (!parsedState.result) return;
    setAuditArtifact({
      sourceText,
      documentName: fileName || 'document.pdf',
      report: buildPsIsonoteAuditReport(parsedState.result.mappings, result, {
        phase,
        parseWarnings: parsedState.result.warnings,
        failureMessage,
      }),
    });
  };

  const clearRunArtifacts = () => {
    setScanArtifact(null);
    setAuditArtifact(null);
    setMessage(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      setSourceText(text);
      setSourceName(file.name);
      clearRunArtifacts();
      setError(null);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : String(fileError));
    }
  };

  const handlePreview = async () => {
    setIsScanning(true);
    setError(null);
    setMessage(null);
    try {
      const result = await runScan();
      recordScanResult(result);
      recordAudit(result, 'preview');
      setMessage(
        `Found ${result.references.length} annotation target(s) across ${result.scannedPages.length} page(s).`,
      );
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setIsScanning(false);
    }
  };

  const handleAnnotate = async () => {
    setIsRunning(true);
    setError(null);
    setMessage(null);
    let scanned: PsIsonoteScanResult | null = null;
    try {
      scanned = await runScan();
      recordScanResult(scanned);
      recordAudit(scanned, 'preview');
      if (scanned.references.length === 0) {
        if (scanned.skippedExisting.length > 0) {
          throw new Error('All matched PS numbers are already annotated on the selected pages.');
        }
        throw new Error('No mapped PS numbers were found in searchable PDF text.');
      }

      const { recipe, callouts } = buildPsIsonoteAnnotationRecipe(scanned, {
        placement,
        noteWidth,
        fontSize,
        includeFamily,
      });
      const execution = await runMacroRecipeAgainstSession(recipe, { saveOutputs: false });
      if (execution.success === false) {
        throw new Error(execution.logs.at(-1) ?? 'PS ISONOTE annotation macro failed.');
      }

      recordAudit(scanned, 'annotated');
      setMessage(
        `Annotated ${callouts.length} PS occurrence(s). The loaded PDF working copy has been updated.`,
      );
    } catch (runError) {
      const failureMessage = runError instanceof Error ? runError.message : String(runError);
      if (scanned) recordAudit(scanned, 'failed', failureMessage);
      setError(failureMessage);
    } finally {
      setIsRunning(false);
    }
  };

  const parsed = parsedState.result;
  const disabled = !workingBytes || !parsed || isScanning || isRunning;
  const auditWarningCount = auditReport?.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning',
  ).length ?? 0;
  const auditErrorCount = auditReport?.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  ).length ?? 0;

  return (
    <section
      data-testid="ps-isonote-recipe-builder"
      className="m-3 mb-0 rounded-lg border border-orange-200 bg-orange-50/70 p-3 space-y-3 dark:border-orange-900 dark:bg-orange-950/20"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-300">
        <FileSpreadsheet className="h-4 w-4" />
        PS No. → ISONOTE Annotation
      </div>

      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        Load a CSV/TSV or paste a table containing PS No. and ISONOTE columns. The builder finds each
        mapped PS number in the loaded PDF and runs a macro recipe that places the matching ISONOTE
        beside it.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1 justify-center"
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning || isRunning}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Load CSV / Table
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>

      {sourceName && (
        <div className="truncate text-[11px] text-slate-500" title={sourceName}>
          Source: {sourceName}
        </div>
      )}

      <textarea
        aria-label="PS No. versus ISONOTE table"
        className="min-h-28 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        placeholder={'PS No.,Family,ISONOTE\nPS-1234.5,Guide,"REST(6kN), GUIDE [Gap=10mm] (8kN)"'}
        value={sourceText}
        onChange={(event) => {
          setSourceText(event.target.value);
          setSourceName('');
          clearRunArtifacts();
          setError(null);
        }}
      />

      {parsed && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <div className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {parsed.mappings.length} unique mapping(s) · {delimiterLabel(parsed.delimiter)} delimited
          </div>
          <div className="mt-1 text-emerald-700/80 dark:text-emerald-400/80">
            PS: {parsed.psColumn} · ISONOTE: {parsed.isonoteColumn}
            {parsed.familyColumn ? ` · Family: ${parsed.familyColumn}` : ''}
          </div>
        </div>
      )}

      {parsedState.error && (
        <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{parsedState.error}</span>
        </div>
      )}

      {parsed && parsed.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {parsed.warnings.slice(0, 3).map((warning) => <div key={warning}>{warning}</div>)}
          {parsed.warnings.length > 3 && <div>+{parsed.warnings.length - 3} more warning(s)</div>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-600 dark:text-slate-400">
          Pages
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as ScopeMode);
              clearRunArtifacts();
            }}
          >
            <option value="all">All pages</option>
            <option value="current">Current page</option>
            <option value="selected">Selected pages</option>
          </select>
        </label>

        <label className="text-[11px] text-slate-600 dark:text-slate-400">
          Placement
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={placement}
            onChange={(event) => setPlacement(event.target.value as PsIsonotePlacement)}
          >
            <option value="auto">Auto</option>
            <option value="right">Prefer right</option>
            <option value="left">Prefer left</option>
          </select>
        </label>

        <label className="text-[11px] text-slate-600 dark:text-slate-400">
          Note width
          <input
            type="number"
            min={120}
            max={480}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={noteWidth}
            onChange={(event) => setNoteWidth(Number(event.target.value) || 220)}
          />
        </label>

        <label className="text-[11px] text-slate-600 dark:text-slate-400">
          Font size
          <input
            type="number"
            min={7}
            max={18}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value) || 10)}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={includeFamily}
          onChange={(event) => setIncludeFamily(event.target.checked)}
        />
        Include support family when available
      </label>
      <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={skipExisting}
          onChange={(event) => {
            setSkipExisting(event.target.checked);
            clearRunArtifacts();
          }}
        />
        Skip PS numbers already annotated by this recipe
      </label>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handlePreview()}
          disabled={disabled}
          className="justify-center"
        >
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {isScanning ? 'Scanning...' : 'Preview Matches'}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleAnnotate()}
          disabled={disabled}
          className="justify-center bg-orange-600 text-white hover:bg-orange-700"
        >
          <WandSparkles className="mr-1.5 h-3.5 w-3.5" />
          {isRunning ? 'Annotating...' : 'Annotate PDF'}
        </Button>
      </div>

      {scanResult && (
        <div className="rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <div>{scanResult.references.length} target occurrence(s) found.</div>
          <div>{scanResult.missingPsNumbers.length} mapped PS number(s) not found in scope.</div>
          <div>{scanResult.skippedExisting.length} existing page annotation(s) skipped.</div>
          {scanResult.missingPsNumbers.length > 0 && (
            <div className="mt-1 truncate" title={scanResult.missingPsNumbers.join(', ')}>
              Missing: {scanResult.missingPsNumbers.slice(0, 8).join(', ')}
              {scanResult.missingPsNumbers.length > 8 ? '…' : ''}
            </div>
          )}
        </div>
      )}

      {auditReport && auditArtifact && (
        <div className="space-y-2 rounded-md border border-slate-300 bg-white p-2 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold uppercase tracking-wide">PS No.-wise audit</div>
              <div className="text-slate-500 dark:text-slate-400">
                {auditReport.phase} · {auditWarningCount} warning(s) · {auditErrorCount} error(s)
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 justify-center px-2 text-[10px]"
              onClick={() => downloadAuditCsv(auditReport, auditArtifact.documentName)}
            >
              <Download className="mr-1 h-3 w-3" />
              CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[620px] w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1 pr-2">PS No.</th>
                  <th className="py-1 pr-2">Found</th>
                  <th className="py-1 pr-2">Occ.</th>
                  <th className="py-1 pr-2">Annotated</th>
                  <th className="py-1 pr-2">Review</th>
                  <th className="py-1 pr-2">Missing</th>
                  <th className="py-1 pr-2">Avg.</th>
                  <th className="py-1 pr-2">Min.</th>
                  <th className="py-1">Errors</th>
                </tr>
              </thead>
              <tbody>
                {auditReport.summaryRows.slice(0, 8).map((row) => (
                  <tr key={row.psNo} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-1 pr-2 font-medium">{row.psNo}</td>
                    <td className="py-1 pr-2">{row.foundPs}</td>
                    <td className="py-1 pr-2">{row.occurrences}</td>
                    <td className="py-1 pr-2">{row.annotated}</td>
                    <td className="py-1 pr-2">{row.review}</td>
                    <td className="py-1 pr-2">{row.missing}</td>
                    <td className="py-1 pr-2">{confidenceLabel(row.averageConfidence)}</td>
                    <td className="py-1 pr-2">{confidenceLabel(row.minimumConfidence)}</td>
                    <td className="py-1">{row.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {auditReport.summaryRows.length > 8 && (
            <div className="text-slate-500">
              +{auditReport.summaryRows.length - 8} more PS number(s) in the CSV export.
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
        Confidence currently measures PDF text-match quality and geometry. OCR engine confidence requires
        an OCR sidecar. Page count: {pageCount || 0}.
      </p>
    </section>
  );
};
