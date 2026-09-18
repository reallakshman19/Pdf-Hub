import React from 'react';
import {
  AlertCircle,
  CheckCircle,
  Eye,
  Play,
  Save,
  Square,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { error as logError } from '@/core/logger/service';
import { analyzeMacroWorkflowRisk } from '@/core/macro/risk';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import type { MacroOutputFile, MacroRecipe } from '@/core/macro/types';
import {
  validateRecipeBeforeRun,
  type PreflightReport,
} from '@/core/macro/validation/validator';
import { useSessionStore } from '@/core/session/store';

export interface MacroPresetExecutionPanelProps {
  recipe?: MacroRecipe;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSavePreset?: (recipe: MacroRecipe) => void;
  onOutputsProduced?: (outputs: MacroOutputFile[]) => void;
}

export const MacroPresetExecutionPanel: React.FC<MacroPresetExecutionPanelProps> = ({
  recipe,
  disabled = false,
  onBusyChange,
  onSavePreset,
  onOutputsProduced,
}) => {
  const {
    workingBytes,
    fileName,
    pageCount,
    selectedPages,
    currentPage,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    fileName: state.fileName,
    pageCount: state.pageCount,
    selectedPages: state.selectedPages,
    currentPage: state.viewState.currentPage,
  })));

  const recipeSignature = React.useMemo(
    () => recipe ? JSON.stringify(recipe) : null,
    [recipe],
  );
  const risk = React.useMemo(
    () => recipe ? analyzeMacroWorkflowRisk(recipe) : null,
    [recipe],
  );

  const [preflight, setPreflight] = React.useState<PreflightReport | null>(null);
  const [preflightSignature, setPreflightSignature] = React.useState<string | null>(null);
  const [lastTestedSignature, setLastTestedSignature] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [isDryRunning, setIsDryRunning] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const busy = isDryRunning || isRunning;
  const hasDocument = Boolean(workingBytes && fileName);
  const assessmentCurrent =
    recipeSignature !== null
    && preflightSignature === recipeSignature;
  const previewSatisfied =
    risk?.risk !== 'preview-required'
    || (
      recipeSignature !== null
      && lastTestedSignature === recipeSignature
    );

  React.useEffect(() => {
    onBusyChange?.(busy);
    return () => {
      if (busy) onBusyChange?.(false);
    };
  }, [busy, onBusyChange]);

  React.useEffect(() => () => {
    abortRef.current?.abort('Preset execution panel unmounted');
  }, []);

  React.useEffect(() => {
    setPreflight(null);
    setPreflightSignature(null);
    setLastTestedSignature(null);
    setLogs([]);
    setRunError(null);
  }, [recipeSignature]);

  const validationContext = React.useCallback(() => ({
    pageCount: Math.max(1, pageCount),
    selectedPages,
    currentPage,
    fileName: fileName ?? 'document.pdf',
    donorFiles: {},
    now: new Date(),
  }), [
    currentPage,
    fileName,
    pageCount,
    selectedPages,
  ]);

  const testRun = async () => {
    if (!recipe || !hasDocument || disabled || busy) return;

    setIsDryRunning(true);
    setRunError(null);
    setLogs([]);
    setIsRunning(true);

    try {
      const signature = JSON.stringify(recipe);
      const report = await validateRecipeBeforeRun(
        {
          ...recipe,
          dryRun: true,
        },
        validationContext(),
      );

      setPreflight(report);
      setPreflightSignature(signature);
      setLastTestedSignature(report.isValid ? signature : null);
      setLogs(report.dryRunLogs);
    } catch (error) {
      setLastTestedSignature(null);
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDryRunning(false);
    }
  };

  const run = async () => {
    if (
      !recipe
      || !hasDocument
      || disabled
      || busy
      || !previewSatisfied
    ) return;

    setRunError(null);
    setLogs([]);

    try {
      const signature = JSON.stringify(recipe);
      const report = await validateRecipeBeforeRun(
        {
          ...recipe,
          dryRun: true,
        },
        validationContext(),
      );

      setPreflight(report);
      setPreflightSignature(signature);
      setLogs(report.dryRunLogs);

      if (!report.isValid) {
        setRunError('Preflight failed. Fix workflow errors before running.');
        return;
      }

      const controller = new AbortController();
      abortRef.current?.abort('Superseded by a new preset workflow run');
      abortRef.current = controller;

      const result = await runMacroRecipeAgainstSession(
        {
          ...recipe,
          dryRun: false,
        },
        {
          saveOutputs: false,
          abortSignal: controller.signal,
        },
      );

      setLogs(result.logs);

      if (result.status === 'cancelled') return;
      if (result.status === 'timed-out') {
        setRunError(
          'Workflow timed out. The document was restored and late results were discarded.',
        );
        return;
      }
      if (result.status === 'failed' || result.success === false) {
        setRunError(result.logs.at(-1) ?? 'Workflow execution failed.');
        return;
      }

      if (result.outputFiles.length > 0) {
        onOutputsProduced?.(result.outputFiles);
      }
    } catch (error) {
      if (abortRef.current?.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
      logError('macro', 'Preset workflow execution failed', {
        recipeId: recipe?.id,
        error: message,
      });
    } finally {
      abortRef.current = null;
      setIsRunning(false);
    }
  };

  const clearRunState = () => {
    setPreflight(null);
    setPreflightSignature(null);
    setLastTestedSignature(null);
    setLogs([]);
    setRunError(null);
  };

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-3 space-y-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="macro-preset-execution"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Test and run
      </div>

      {risk?.risk === 'preview-required' ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          data-testid="macro-preset-preview-required"
        >
          <strong>Preview required.</strong>{' '}
          Test Run must succeed after the latest parameter change before destructive page changes can run.
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1 text-xs"
          onClick={() => void testRun()}
          disabled={!recipe || !hasDocument || disabled || busy}
          data-testid="macro-preset-test-run"
        >
          <Eye className={['mr-1 h-3.5 w-3.5', isDryRunning ? 'animate-pulse' : ''].join(' ')} />
          {isDryRunning ? 'Testing…' : 'Test Run'}
        </Button>

        <Button
          variant="secondary"
          className="flex-1 text-xs"
          onClick={() => recipe && onSavePreset?.(recipe)}
          disabled={!recipe || !hasDocument || disabled || busy}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          Save Preset
        </Button>
      </div>

      {preflight && assessmentCurrent ? (
        <div
          className={[
            'rounded p-2 text-xs',
            preflight.isValid
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
          ].join(' ')}
        >
          <div className="mb-1 flex items-center gap-1 font-semibold">
            {preflight.isValid ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {preflight.isValid ? 'Test Run passed' : 'Test Run failed'}
          </div>

          {preflight.errors.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {preflight.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          {preflight.warnings.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-600 dark:text-amber-400">
              {preflight.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        {isRunning ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => abortRef.current?.abort('Cancelled by user')}
            className="text-red-600"
          >
            <Square className="mr-1 h-4 w-4" />
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void run()}
            disabled={
              !recipe
              || !hasDocument
              || disabled
              || busy
              || !previewSatisfied
            }
            data-testid="macro-preset-run"
          >
            <Play className="mr-1 h-4 w-4" />
            Run
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={clearRunState}
          disabled={busy}
        >
          Clear Run State
        </Button>
      </div>

      {runError ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
          role="alert"
        >
          {runError}
        </div>
      ) : null}

      <div className="max-h-32 space-y-1 overflow-auto rounded-md border border-slate-200 p-2 dark:border-slate-800">
        {logs.length === 0 ? (
          <div className="text-xs text-slate-500">No run details yet.</div>
        ) : null}
        {logs.map((line, index) => (
          <div
            key={`${recipe?.id ?? 'workflow'}-${index}-${line}`}
            className="text-xs text-slate-600 dark:text-slate-300"
          >
            {line}
          </div>
        ))}
      </div>
    </section>
  );
};
