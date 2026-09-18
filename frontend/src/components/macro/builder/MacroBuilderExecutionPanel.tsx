import React from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSessionStore } from '@/core/session/store';
import type { MacroRecipe } from '@/core/macro/types';
import {
  validateRecipeBeforeRun,
  type PreflightReport,
} from '@/core/macro/validation/validator';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { analyzeMacroWorkflowRisk } from '@/core/macro/risk';

export interface MacroBuilderExecutionPanelProps {
  recipe: MacroRecipe;
  validationValid: boolean;
}

export function MacroBuilderExecutionPanel({
  recipe,
  validationValid,
}: MacroBuilderExecutionPanelProps): React.ReactElement {
  const workingBytes = useSessionStore((state) => state.workingBytes);
  const fileName = useSessionStore((state) => state.fileName);
  const pageCount = useSessionStore((state) => state.pageCount);
  const selectedPages = useSessionStore((state) => state.selectedPages);
  const currentPage = useSessionStore((state) => state.viewState.currentPage);

  const recipeSignature = React.useMemo(() => JSON.stringify(recipe), [recipe]);
  const riskAnalysis = React.useMemo(() => analyzeMacroWorkflowRisk(recipe), [recipe]);

  const [preflight, setPreflight] = React.useState<PreflightReport | null>(null);
  const [preflightSignature, setPreflightSignature] = React.useState<string | null>(null);
  const [lastTestedRecipeSignature, setLastTestedRecipeSignature] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'testing' | 'running' | 'success' | 'error'>('idle');
  const [message, setMessage] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const controllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => {
    controllerRef.current?.abort('Workflow builder closed');
  }, []);

  const hasDocument = Boolean(workingBytes && fileName);
  const busy = status === 'testing' || status === 'running';
  const canTest = validationValid && hasDocument && !busy;
  const previewSatisfied =
    riskAnalysis.risk === 'safe'
    || lastTestedRecipeSignature === recipeSignature;
  const canRun = validationValid && hasDocument && !busy && previewSatisfied;
  const assessmentCurrent = preflightSignature === recipeSignature;

  const buildPreflight = React.useCallback(async (): Promise<PreflightReport | null> => {
    if (!fileName || !validationValid) return null;

    const report = await validateRecipeBeforeRun(
      {
        ...recipe,
        dryRun: true,
      },
      {
        pageCount: Math.max(1, pageCount),
        selectedPages,
        currentPage,
        fileName,
        donorFiles: {},
        now: new Date(),
      },
    );

    setPreflight(report);
    setPreflightSignature(recipeSignature);
    setLogs(report.dryRunLogs);
    return report;
  }, [
    currentPage,
    fileName,
    pageCount,
    recipe,
    selectedPages,
    recipeSignature,
    validationValid,
  ]);

  const handleTestRun = async () => {
    if (!canTest) return;
    setStatus('testing');
    setMessage(null);
    setPreflight(null);
    setPreflightSignature(recipeSignature);
    setLogs([]);

    try {
      const report = await buildPreflight();
      if (!report) {
        setStatus('error');
        setMessage('A valid workflow and an open PDF are required.');
        return;
      }

      if (report.isValid) {
        setLastTestedRecipeSignature(recipeSignature);
        setStatus('idle');
        setMessage(
          riskAnalysis.risk === 'preview-required'
            ? 'Test Run complete. Destructive page changes are previewed and Run is now enabled.'
            : 'Test Run complete. Review the impact summary before running.',
        );
      } else {
        setLastTestedRecipeSignature(null);
        setStatus('error');
        setMessage('Test Run found blocking issues.');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRun = async () => {
    if (riskAnalysis.risk === 'preview-required' && !previewSatisfied) {
      setStatus('error');
      setMessage('Test Run this workflow before running destructive page changes.');
      return;
    }
    if (!canRun) return;

    setStatus('testing');
    setMessage(null);
    setPreflight(null);
    setPreflightSignature(recipeSignature);
    setLogs([]);

    try {
      const report = await buildPreflight();
      if (!report?.isValid) {
        setStatus('error');
        setMessage('Fix the preflight issues before running this workflow.');
        return;
      }

      const controller = new AbortController();
      controllerRef.current?.abort('Superseded by a new workflow run');
      controllerRef.current = controller;
      setStatus('running');

      const result = await runMacroRecipeAgainstSession(
        {
          ...recipe,
          dryRun: false,
        },
        {
          saveOutputs: true,
          abortSignal: controller.signal,
        },
      );

      setLogs(result.logs);

      if (result.status === 'cancelled') {
        setStatus('idle');
        setMessage('Workflow cancelled before document commit.');
        return;
      }

      if (result.status === 'timed-out') {
        setStatus('error');
        setMessage('Workflow timed out. The document was not committed.');
        return;
      }

      if (result.status === 'failed' || result.success === false) {
        setStatus('error');
        setMessage(result.logs.at(-1) ?? 'Workflow failed.');
        return;
      }

      setStatus('success');
      setMessage(
        result.outputFiles.length > 0
          ? `Workflow complete. ${result.outputFiles.length} output file(s) produced.`
          : 'Workflow complete. The active document was updated.',
      );
    } catch (error) {
      if (controllerRef.current?.signal.aborted) {
        setStatus('idle');
        setMessage('Workflow cancelled.');
        return;
      }
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      controllerRef.current = null;
    }
  };

  const cancel = () => {
    controllerRef.current?.abort('Cancelled by user');
  };

  return (
    <section
      aria-label="Workflow execution"
      className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900"
      data-testid="macro-builder-execution"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Test and run
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Test Run previews document impact without committing changes.
          </p>
        </div>

        {status === 'success' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : status === 'error' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        ) : null}
      </div>

      {riskAnalysis.risk === 'preview-required' ? (
        <div
          className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          data-testid="macro-builder-preview-required"
        >
          <strong>Preview required.</strong>{' '}
          This workflow removes, replaces, splits, or reorders pages. Run is enabled only after a successful Test Run of the current workflow.
        </div>
      ) : null}

      {!hasDocument ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Open a PDF to test or run this workflow.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handleTestRun()}
          disabled={!canTest}
          data-testid="macro-builder-test-run"
        >
          <FlaskConical className="mr-1 h-3.5 w-3.5" />
          {status === 'testing' ? 'Testing…' : 'Test Run'}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={() => void handleRun()}
          disabled={!canRun}
          data-testid="macro-builder-run"
        >
          <Play className="mr-1 h-3.5 w-3.5" />
          {status === 'running' ? 'Running…' : 'Run'}
        </Button>

        {status === 'running' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancel}
            data-testid="macro-builder-cancel"
          >
            <Square className="mr-1 h-3.5 w-3.5" />
            Cancel
          </Button>
        ) : null}
      </div>

      {message && assessmentCurrent ? (
        <p
          className="mt-3 text-xs text-slate-700 dark:text-slate-300"
          role="status"
        >
          {message}
        </p>
      ) : null}

      {preflight && assessmentCurrent ? (
        <WorkflowPreflight report={preflight} />
      ) : null}

      {logs.length > 0 && assessmentCurrent ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
            Run details
          </summary>
          <div className="mt-2 max-h-36 overflow-auto rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-200">
            {logs.map((line, index) => (
              <div key={`${index}-${line}`}>{line}</div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function WorkflowPreflight({
  report,
}: {
  report: PreflightReport;
}) {
  const diff = report.dryRunDiff;

  return (
    <div
      className="mt-3 rounded-md border border-slate-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-950"
      data-testid="macro-builder-preflight"
    >
      <div className="font-semibold text-slate-800 dark:text-slate-100">
        Impact summary
      </div>

      {diff ? (
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
          <span>Pages</span>
          <span>{diff.initialPageCount} → {diff.finalPageCount}</span>
          <span>Document changes</span>
          <span>{diff.modifiedBytes ? 'Yes' : 'No'}</span>
          <span>Output files</span>
          <span>{diff.outputFiles.length}</span>
          <span>Warnings</span>
          <span>{report.warnings.length}</span>
        </div>
      ) : null}

      {report.errors.length > 0 ? (
        <ul className="mt-2 list-disc pl-4 text-red-700 dark:text-red-300">
          {report.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      {report.warnings.length > 0 ? (
        <ul className="mt-2 list-disc pl-4 text-amber-700 dark:text-amber-300">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
