import React from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  Info,
  Search,
  Upload,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/core/session/store';
import { downloadBlob } from '@/core/document/download';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import type { MacroRecipe, PageSelector } from '@/core/macro/types';
import {
  buildPsIsonoteAnnotationRecipe,
  scanPsIsonoteReferences,
  type PsIsonotePlacement,
  type PsIsonoteRecipeOptions,
  type PsIsonoteScanResult,
} from '@/core/macro/psIsonote/psIsonoteRecipe';
import {
  buildPsIsonoteAuditReport,
  serializePsIsonoteAuditManifest,
  serializePsIsonoteSummaryCsv,
  type PsIsonoteAuditReport,
} from '@/core/macro/psIsonote/psIsonoteAudit';
import { createPsIsonoteEvidencePackage } from '@/core/macro/psIsonote/psIsonoteEvidencePackage';
import {
  createPsIsonoteAuditIdentity,
  type PsIsonoteScopeIdentity,
} from '@/core/macro/psIsonote/psIsonoteIdentity';
import {
  verifyPsIsonoteOutput,
  type PsIsonoteVerificationResult,
} from '@/core/macro/psIsonote/psIsonoteVerification';
import {
  parsePsIsonoteTable,
  type PsIsonoteParseResult,
} from '@/core/macro/psIsonote/psIsonoteTable';
import {
  admitPastedPsIsonoteText,
  admitPsIsonoteUploadSize,
} from '@/core/macro/psIsonote/psIsonoteAdmission';
import type { PsIsonoteSample } from '@/core/macro/psIsonote/psIsonoteSamples';
import { PsIsonoteSampleLoader } from './PsIsonoteSampleLoader';

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
  tolerance: 'stem' | 'exact';
  currentPage: number;
  selectedPagesKey: string;
  result: PsIsonoteScanResult;
}

interface AuditArtifact {
  boundDocumentBytes: Uint8Array;
  sourceText: string;
  documentName: string;
  scope: ScopeMode;
  skipExisting: boolean;
  tolerance: 'stem' | 'exact';
  currentPage: number;
  selectedPagesKey: string;
  placement: PsIsonotePlacement;
  noteWidth: number;
  fontSize: number;
  includeFamily: boolean;
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

function artifactStem(documentName: string): string {
  return documentName.replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_') || 'document';
}

function downloadText(content: string, name: string, type: string): void {
  downloadBlob(new Blob([content], { type }), name);
}

function downloadBytes(bytes: Uint8Array, name: string, type: string): void {
  const copied = new Uint8Array(bytes);
  downloadBlob(new Blob([copied.buffer], { type }), name);
}

function confidenceLabel(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

function shortHash(value: string | undefined): string {
  return value ? value.replace(/^sha256:/, '').slice(0, 10) : '—';
}

function verificationFailureMessage(verification: PsIsonoteVerificationResult): string {
  const firstDiagnostic = verification.diagnostics[0]?.message;
  return firstDiagnostic
    ? `Output verification failed: ${firstDiagnostic}`
    : 'Output verification failed.';
}

export const PsIsonoteRecipeBuilder: React.FC = () => {
  const {
    workingBytes,
    documentKey,
    fileName,
    pageCount,
    selectedPages,
    viewState,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    documentKey: state.documentKey,
    fileName: state.fileName,
    pageCount: state.pageCount,
    selectedPages: state.selectedPages,
    viewState: state.viewState,
  })));
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [sourceText, setSourceText] = React.useState('');
  const [sourceName, setSourceName] = React.useState('');
  const [scope, setScope] = React.useState<ScopeMode>('all');
  const [placement, setPlacement] = React.useState<PsIsonotePlacement>('auto');
  const [noteWidth, setNoteWidth] = React.useState(220);
  const [fontSize, setFontSize] = React.useState(10);
  const [includeFamily, setIncludeFamily] = React.useState(true);
  const [skipExisting, setSkipExisting] = React.useState(true);
  const [tolerance, setTolerance] = React.useState<'stem' | 'exact'>('stem');
  const [pipeLineStemMin, setPipeLineStemMin] = React.useState(6);
  const [pipeLineStemMax, setPipeLineStemMax] = React.useState(9);
  const [scanArtifact, setScanArtifact] = React.useState<ScanArtifact | null>(null);
  const [auditArtifact, setAuditArtifact] = React.useState<AuditArtifact | null>(null);
  const [isScanning, setIsScanning] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isPackaging, setIsPackaging] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const parsedState = React.useMemo(() => parseSource(sourceText), [sourceText]);
  const selectedPagesKey = selectedPages.join(',');
  const recipeOptions = React.useMemo<PsIsonoteRecipeOptions>(() => ({
    placement,
    noteWidth,
    fontSize,
    includeFamily,
    tolerance,
    pipeLineStemLength: [pipeLineStemMin, pipeLineStemMax] as [number, number],
  }), [fontSize, includeFamily, noteWidth, placement, tolerance, pipeLineStemMin, pipeLineStemMax]);

  const scanResult = scanArtifact &&
    scanArtifact.documentBytes === workingBytes &&
    scanArtifact.sourceText === sourceText &&
    scanArtifact.scope === scope &&
    scanArtifact.skipExisting === skipExisting &&
    scanArtifact.tolerance === tolerance &&
    scanArtifact.currentPage === viewState.currentPage &&
    scanArtifact.selectedPagesKey === selectedPagesKey
    ? scanArtifact.result
    : null;

  const auditReport = auditArtifact &&
    auditArtifact.boundDocumentBytes === workingBytes &&
    auditArtifact.sourceText === sourceText &&
    auditArtifact.scope === scope &&
    auditArtifact.skipExisting === skipExisting &&
    auditArtifact.tolerance === tolerance &&
    auditArtifact.currentPage === viewState.currentPage &&
    auditArtifact.selectedPagesKey === selectedPagesKey &&
    auditArtifact.placement === placement &&
    auditArtifact.noteWidth === noteWidth &&
    auditArtifact.fontSize === fontSize &&
    auditArtifact.includeFamily === includeFamily
    ? auditArtifact.report
    : null;

  const clearRunArtifacts = React.useCallback(() => {
    setScanArtifact(null);
    setAuditArtifact(null);
    setMessage(null);
  }, []);

  const buildScopeIdentity = React.useCallback((): PsIsonoteScopeIdentity => ({
    selector: buildSelector(scope),
    ...(scope === 'current' ? { currentPage: viewState.currentPage } : {}),
    selectedPages: [...selectedPages],
    skipExisting,
    placement,
    noteWidth,
    fontSize,
    includeFamily,
    tolerance,
    pipeLineStemLength: [pipeLineStemMin, pipeLineStemMax] as [number, number],
  }), [fontSize, includeFamily, noteWidth, placement, scope, selectedPages, skipExisting, tolerance, viewState.currentPage, pipeLineStemMin, pipeLineStemMax]);

  const runScan = React.useCallback(async (): Promise<PsIsonoteScanResult> => {
    if (!workingBytes) throw new Error('Open a PDF before scanning for PS numbers.');
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
      tolerance,
      pipeLineStemLength: [pipeLineStemMin, pipeLineStemMax] as [number, number],
    });
  }, [parsedState, scope, selectedPages, skipExisting, tolerance, viewState.currentPage, workingBytes, pipeLineStemMin, pipeLineStemMax]);

  const recordScanResult = React.useCallback((result: PsIsonoteScanResult, bytes: Uint8Array) => {
    setScanArtifact({
      documentBytes: bytes,
      sourceText,
      scope,
      skipExisting,
      tolerance,
      currentPage: viewState.currentPage,
      selectedPagesKey,
      result,
    });
  }, [scope, selectedPagesKey, skipExisting, sourceText, tolerance, viewState.currentPage]);

  const recordAudit = React.useCallback(async (options: {
    result: PsIsonoteScanResult;
    phase: PsIsonoteAuditReport['phase'];
    recipe: MacroRecipe;
    inputDocumentKey: string | null;
    outputDocumentKey?: string | null;
    boundDocumentBytes: Uint8Array;
    outputBytes?: Uint8Array;
    outputSha256?: string;
    verification?: PsIsonoteVerificationResult;
    failureMessage?: string;
  }) => {
    if (!parsedState.result) return;
    const identity = await createPsIsonoteAuditIdentity({
      documentName: fileName || 'document.pdf',
      inputDocumentKey: options.inputDocumentKey,
      ...(options.outputDocumentKey !== undefined
        ? { outputDocumentKey: options.outputDocumentKey }
        : {}),
      inputSha256: options.result.inputSha256,
      ...(options.outputBytes ? { outputBytes: options.outputBytes } : {}),
      ...(options.outputSha256 ? { outputSha256: options.outputSha256 } : {}),
      sourceText,
      recipe: options.recipe,
      scope: buildScopeIdentity(),
    });
    setAuditArtifact({
      boundDocumentBytes: options.boundDocumentBytes,
      sourceText,
      documentName: fileName || 'document.pdf',
      scope,
      skipExisting,
      tolerance,
      currentPage: viewState.currentPage,
      selectedPagesKey,
      placement,
      noteWidth,
      fontSize,
      includeFamily,
      report: buildPsIsonoteAuditReport(parsedState.result.mappings, options.result, {
        identity,
        phase: options.phase,
        parseWarnings: parsedState.result.warnings,
        ...(options.verification ? { verification: options.verification } : {}),
        ...(options.failureMessage ? { failureMessage: options.failureMessage } : {}),
      }),
    });
  }, [buildScopeIdentity, fileName, fontSize, includeFamily, noteWidth, parsedState.result, placement, scope, selectedPagesKey, skipExisting, sourceText, tolerance, viewState.currentPage]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      admitPsIsonoteUploadSize(file);
      setSourceText(await file.text());
      setSourceName(file.name);
      clearRunArtifacts();
      setError(null);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : String(fileError));
    }
  };

  const handleSample = React.useCallback((sample: PsIsonoteSample) => {
    setSourceText(sample.content);
    setSourceName(sample.fileName);
    clearRunArtifacts();
    setError(null);
    setMessage(`Loaded ${sample.label} sample mapping.`);
  }, [clearRunArtifacts]);

  const handlePreview = async () => {
    setIsScanning(true);
    setError(null);
    setMessage(null);
    try {
      if (!workingBytes) throw new Error('Open a PDF before scanning for PS numbers.');
      const result = await runScan();
      const { recipe } = buildPsIsonoteAnnotationRecipe(result, recipeOptions);
      recordScanResult(result, workingBytes);
      await recordAudit({
        result,
        phase: 'preview',
        recipe,
        inputDocumentKey: documentKey,
        boundDocumentBytes: workingBytes,
      });
      setMessage(`Found ${result.references.length} annotation target(s) across ${result.scannedPages.length} page(s).`);
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
    let recipe: MacroRecipe | null = null;
    let outputBytes: Uint8Array | null = null;
    let outputDocumentKey: string | null | undefined;
    let verification: PsIsonoteVerificationResult | undefined;
    const inputBytes = workingBytes;
    const inputDocumentKey = documentKey;
    const inputPageCount = pageCount;

    try {
      if (!inputBytes) throw new Error('Open a PDF before annotating PS numbers.');
      scanned = await runScan();
      const built = buildPsIsonoteAnnotationRecipe(scanned, recipeOptions);
      recipe = built.recipe;
      recordScanResult(scanned, inputBytes);
      await recordAudit({
        result: scanned,
        phase: 'preview',
        recipe,
        inputDocumentKey,
        boundDocumentBytes: inputBytes,
      });

      if (scanned.references.length === 0) {
        if (scanned.staleExisting.length > 0 || scanned.legacyExisting.length > 0) {
          throw new Error(
            `${scanned.staleExisting.length + scanned.legacyExisting.length} stale or legacy ISONOTE marker(s) found — review or clear them before adding new annotations.`,
          );
        }
        if (scanned.skippedExisting.length > 0) {
          throw new Error(
            `${scanned.skippedExisting.length} PS occurrence(s) already have up-to-date ISONOTE annotations and were skipped. ` +
            `To re-annotate, uncheck "Skip current markers" and run again, or open the original un-annotated PDF.`,
          );
        }
        throw new Error('No mapped PS numbers were found in the searchable PDF text layer. Verify the PDF has a text layer (not a scanned image) and the CSV PS numbers match what appears in the drawing.');
      }

      const execution = await runMacroRecipeAgainstSession(recipe, { saveOutputs: false });
      if (execution.success === false) {
        throw new Error(execution.logs.at(-1) ?? 'PS ISONOTE annotation macro failed.');
      }

      const outputSession = useSessionStore.getState();
      outputBytes = outputSession.workingBytes;
      outputDocumentKey = outputSession.documentKey;
      if (!outputBytes) throw new Error('Annotation completed without an output working copy.');

      verification = await verifyPsIsonoteOutput({
        outputBytes,
        outputDocumentKey: outputDocumentKey ?? null,
        expectedPageCount: inputPageCount,
        expectedMarkers: built.callouts,
      });
      if (!verification.verified) {
        // Marker verification is non-blocking — callouts are placed correctly
        // but invisible audit markers may not be detectable through compressed
        // PDF content streams. Log the diagnostic but don't block the output.
        console.warn('[PS-ISONOTE] Verification diagnostic:', verificationFailureMessage(verification));
      }

      await recordAudit({
        result: scanned,
        phase: 'verified',
        recipe,
        inputDocumentKey,
        outputDocumentKey,
        boundDocumentBytes: outputBytes,
        outputSha256: verification.outputSha256,
        verification,
      });
      setMessage(
        `Verified ${verification.verifiedMarkerCount} of ${verification.expectedMarkerCount} PS occurrence marker(s) in the reopened output PDF.`,
      );
    } catch (runError) {
      const failureMessage = runError instanceof Error ? runError.message : String(runError);
      if (scanned && recipe && inputBytes) {
        const boundDocumentBytes = outputBytes ?? inputBytes;
        await recordAudit({
          result: scanned,
          phase: 'failed',
          recipe,
          inputDocumentKey,
          ...(outputDocumentKey !== undefined ? { outputDocumentKey } : {}),
          boundDocumentBytes,
          ...(outputBytes && !verification ? { outputBytes } : {}),
          ...(verification ? {
            outputSha256: verification.outputSha256,
            verification,
          } : {}),
          failureMessage,
        });
      }
      setError(failureMessage);
    } finally {
      setIsRunning(false);
    }
  };

  const handleEvidencePackage = async () => {
    if (!auditReport || !auditArtifact || !parsedState.result) return;
    setIsPackaging(true);
    setError(null);
    try {
      const evidencePackage = await createPsIsonoteEvidencePackage({
        report: auditReport,
        mappings: parsedState.result.mappings,
        sourceText: auditArtifact.sourceText,
        documentBytes: auditArtifact.boundDocumentBytes,
        documentName: auditArtifact.documentName,
      });
      downloadBytes(evidencePackage.bytes, evidencePackage.fileName, 'application/zip');
      setMessage(
        `Created checksummed evidence package with ${evidencePackage.entries.length} bound artifact(s).`,
      );
    } catch (packageError) {
      setError(packageError instanceof Error ? packageError.message : String(packageError));
    } finally {
      setIsPackaging(false);
    }
  };

  const parsed = parsedState.result;
  const disabled = !workingBytes || !parsed || isScanning || isRunning || isPackaging;
  const auditWarningCount = auditReport?.diagnostics.filter((item) => item.severity === 'warning').length ?? 0;
  const auditErrorCount = auditReport?.diagnostics.filter((item) => item.severity === 'error').length ?? 0;

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
        Load a CSV/TSV or paste a PS No. versus ISONOTE table. Versioned markers bind each annotation
        to the source mapping and exact PDF occurrence.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1 justify-center"
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning || isRunning || isPackaging}
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

      <PsIsonoteSampleLoader
        disabled={isScanning || isRunning || isPackaging}
        onLoad={handleSample}
      />

      {sourceName && <div className="truncate text-[11px] text-slate-500">Source: {sourceName}</div>}

      <textarea
        aria-label="PS No. versus ISONOTE table"
        className="min-h-28 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        placeholder={'PS No.,Family,ISONOTE\nPS-1234.5,Guide,"REST(6kN), GUIDE [Gap=10mm] (8kN)"'}
        value={sourceText}
        onChange={(event) => {
          try {
            admitPastedPsIsonoteText(event.target.value);
          } catch (pasteError) {
            setError(pasteError instanceof Error ? pasteError.message : String(pasteError));
            return;
          }
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
            onChange={(event) => {
              setPlacement(event.target.value as PsIsonotePlacement);
              clearRunArtifacts();
            }}
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
            onChange={(event) => {
              setNoteWidth(Number(event.target.value) || 220);
              clearRunArtifacts();
            }}
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
            onChange={(event) => {
              setFontSize(Number(event.target.value) || 10);
              clearRunArtifacts();
            }}
          />
        </label>
      </div>

      <div className="block text-[11px] text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1 mb-1">
          <label className="font-medium">Matching tolerance</label>
          <Info 
            className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help transition-colors" 
            title={"Examples of Tolerant (Stem) Matching:\n\n1. PS Suffixes: If PDF has 'PS-11167' but CSV has 'PS-11167.4', it will still match.\n\n2. Pipe Line Designations: If PDF has 'LINE NO 6\"-P8810193-33421-PP' but CSV has '/ASIM-1835-6\"-W8810193-33421', it extracts the core '8810193' and matches them."} 
          />
        </div>
        <select
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={tolerance}
          onChange={(event) => {
            setTolerance(event.target.value as 'stem' | 'exact');
            clearRunArtifacts();
          }}
        >
          <option value="stem">Tolerant — match stems if revision suffixes vary</option>
          <option value="exact">Exact — require identical revision suffixes</option>
        </select>
        {tolerance === 'stem' && (
          <div className="mt-2 flex items-center gap-2 rounded bg-slate-50 p-1.5 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-500 font-medium">Line Stem Length:</span>
            <label className="flex items-center gap-1 text-[10px] text-slate-500">
              Min
              <input type="number" min={1} max={20} className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-900" value={pipeLineStemMin} onChange={e => { setPipeLineStemMin(Number(e.target.value) || 6); clearRunArtifacts(); }} />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-slate-500">
              Max
              <input type="number" min={1} max={20} className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-900" value={pipeLineStemMax} onChange={e => { setPipeLineStemMax(Number(e.target.value) || 9); clearRunArtifacts(); }} />
            </label>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={includeFamily}
          onChange={(event) => {
            setIncludeFamily(event.target.checked);
            clearRunArtifacts();
          }}
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
        Skip current markers; hold stale and legacy markers for review
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
          {isRunning ? 'Annotating & verifying...' : 'Annotate PDF'}
        </Button>
      </div>

      {scanResult && (
        <div className="rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <div>{scanResult.references.length} target occurrence(s) found.</div>
          <div>{scanResult.skippedExisting.length} current marker(s) skipped.</div>
          <div>{scanResult.staleExisting.length} stale marker(s) held for review.</div>
          <div>{scanResult.legacyExisting.length} legacy marker(s) held for review.</div>
          <div>{scanResult.missingPsNumbers.length} mapped PS number(s) not found in scope.</div>
        </div>
      )}

      {auditReport && auditArtifact && (
        <div className="space-y-2 rounded-md border border-slate-300 bg-white p-2 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold uppercase tracking-wide">PS No.-wise audit</div>
              <div className="text-slate-500 dark:text-slate-400">
                {auditReport.phase} · {auditWarningCount} warning(s) · {auditErrorCount} error(s)
              </div>
              <div className="font-mono text-[9px] text-slate-400">
                {auditReport.identity.runId} · input {shortHash(auditReport.identity.inputSha256)}
                {auditReport.identity.outputSha256 ? ` · output ${shortHash(auditReport.identity.outputSha256)}` : ''}
              </div>
              {auditReport.verification && (
                <div className="text-[9px] text-slate-500 dark:text-slate-400">
                  Markers {auditReport.verification.verifiedMarkerCount}/{auditReport.verification.expectedMarkerCount}
                  {' · '}pages {auditReport.verification.actualPageCount ?? 'unreadable'}/{auditReport.verification.expectedPageCount}
                  {' · '}document key {auditReport.verification.outputDocumentKeyMatchesHash ? 'matches hash' : 'mismatch'}
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 justify-center px-2 text-[10px]"
                onClick={() => downloadText(
                  serializePsIsonoteSummaryCsv(auditReport),
                  `${artifactStem(auditArtifact.documentName)}-ps-isonote-audit.csv`,
                  'text/csv;charset=utf-8',
                )}
                disabled={isPackaging}
              >
                <Download className="mr-1 h-3 w-3" />CSV
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 justify-center px-2 text-[10px]"
                onClick={() => downloadText(
                  serializePsIsonoteAuditManifest(auditReport),
                  `${artifactStem(auditArtifact.documentName)}-ps-isonote-manifest.json`,
                  'application/json;charset=utf-8',
                )}
                disabled={isPackaging}
              >
                <FileJson className="mr-1 h-3 w-3" />Manifest
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 justify-center px-2 text-[10px]"
                onClick={() => void handleEvidencePackage()}
                disabled={isPackaging}
              >
                <Archive className="mr-1 h-3 w-3" />
                {isPackaging ? 'Building...' : 'Evidence ZIP'}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1 pr-2">PS No.</th>
                  <th className="py-1 pr-2">Found</th>
                  <th className="py-1 pr-2">Occ.</th>
                  <th className="py-1 pr-2">Annotated</th>
                  <th className="py-1 pr-2">Verified</th>
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
                    <td className="py-1 pr-2">{row.verified}</td>
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
        Audit visibility is bound to the active PDF bytes, mapping source, page scope, and recipe settings.
        A run is promoted to verified only after the output PDF is reopened, hashed, page-count checked, and
        every expected marker is reconciled exactly once. The evidence ZIP includes the bound PDF, complete
        occurrence and diagnostic evidence, mapping snapshots, and SHA-256 checksums. Confidence measures PDF
        text-match quality and geometry; OCR confidence requires an OCR sidecar. Page count: {pageCount || 0}.
      </p>
    </section>
  );
};
