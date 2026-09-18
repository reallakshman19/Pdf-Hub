import React from 'react';
import {
  AlertCircle,
  CheckCircle,
  Code2,
  Eye,
  FileCode2,
  Play,
  Rows3,
  Save,
  Square,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { error as logError } from '@/core/logger/service';
import type {
  MacroOutputFile,
  MacroRecipe,
} from '@/core/macro/types';
import { macroValidator } from '@/core/macro/validator';
import {
  DEFAULT_MACRO_RESOURCE_LIMITS,
  parseBoundedJson,
  parseMacroRecipeJson,
} from '@/core/macro/resourceBudget';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import {
  validateRecipeBeforeRun,
  type PreflightReport,
} from '@/core/macro/validation/validator';
import { analyzeMacroWorkflowRisk } from '@/core/macro/risk';
import { getMacroOpSchema } from '@/core/macro/schema/opSchema';
import { getMacroOpPresentation } from '@/core/macro/schema/presentation';
import { usePresetsStore } from '@/core/macro/store/presets';
import { useSessionStore } from '@/core/session/store';

export interface MacroExpertWorkspaceProps {
  selectedRecipe?: MacroRecipe;
  disabled?: boolean;
  onOutputsProduced?: (outputs: MacroOutputFile[]) => void;
}

export const MacroExpertWorkspace: React.FC<MacroExpertWorkspaceProps> = ({
  selectedRecipe,
  disabled = false,
  onOutputsProduced,
}) => {
  const {
    workingBytes,
    pageCount,
    selectedPages,
    currentPage,
    fileName,
  } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    pageCount: state.pageCount,
    selectedPages: state.selectedPages,
    currentPage: state.viewState.currentPage,
    fileName: state.fileName,
  })));
  const savePreset = usePresetsStore((state) => state.savePreset);

  const initialRecipe = selectedRecipe ?? null;
  const [recipeJson, setRecipeJson] = React.useState(
    initialRecipe ? JSON.stringify(initialRecipe, null, 2) : '',
  );
  const [presetName, setPresetName] = React.useState(
    initialRecipe ? `${initialRecipe.name} (Expert)` : 'Expert Preset',
  );
  const [viewMode, setViewMode] = React.useState<'table' | 'json'>('table');
  const [preflightReport, setPreflightReport] = React.useState<PreflightReport | null>(null);
  const [preflightSignature, setPreflightSignature] = React.useState<string | null>(null);
  const [lastTestedSignature, setLastTestedSignature] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [isDryRunning, setIsDryRunning] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => {
    abortRef.current?.abort('Expert workflow closed');
  }, []);

  const parsedForRisk = React.useMemo(() => {
    try {
      return parseExpertRecipe(recipeJson);
    } catch {
      return null;
    }
  }, [recipeJson]);

  const currentSignature = parsedForRisk
    ? JSON.stringify(parsedForRisk)
    : null;
  const risk = parsedForRisk
    ? analyzeMacroWorkflowRisk(parsedForRisk)
    : null;
  const assessmentCurrent =
    currentSignature !== null
    && preflightSignature === currentSignature;

  const buildValidationContext = React.useCallback(() => ({
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

  const loadSelectedRecipe = () => {
    if (!selectedRecipe) return;
    setPresetName(`${selectedRecipe.name} (Expert)`);
    setRecipeJson(JSON.stringify(selectedRecipe, null, 2));
    setPreflightReport(null);
    setPreflightSignature(null);
    setLastTestedSignature(null);
    setLogs([]);
    setRunError(null);
  };

  const runDryRun = async () => {
    setRunError(null);
    setPreflightReport(null);
    setLogs([]);
    setIsDryRunning(true);

    try {
      const parsed = parseExpertRecipe(recipeJson);
      const signature = JSON.stringify(parsed);
      const report = await validateRecipeBeforeRun(
        {
          ...parsed,
          dryRun: true,
        },
        buildValidationContext(),
      );

      setPreflightReport(report);
      setPreflightSignature(signature);
      setLogs(report.dryRunLogs);
      setLastTestedSignature(report.isValid ? signature : null);
    } catch (error) {
      setLastTestedSignature(null);
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDryRunning(false);
    }
  };

  const runExpertRecipe = async () => {
    if (!workingBytes || disabled || isDryRunning || isRunning) return;

    setRunError(null);
    setLogs([]);

    try {
      const parsed = parseExpertRecipe(recipeJson);
      const signature = JSON.stringify(parsed);
      const riskAnalysis = analyzeMacroWorkflowRisk(parsed);

      if (
        riskAnalysis.risk === 'preview-required'
        && lastTestedSignature !== signature
      ) {
        setRunError(
          'Validate + Dry Run this exact workflow before running destructive page changes.',
        );
        return;
      }

      const report = await validateRecipeBeforeRun(
        {
          ...parsed,
          dryRun: true,
        },
        buildValidationContext(),
      );
      setPreflightReport(report);
      setPreflightSignature(signature);
      setLogs(report.dryRunLogs);

      if (!report.isValid) {
        setRunError('Preflight failed. Fix workflow errors before running.');
        return;
      }

      abortRef.current?.abort('Superseded by a new expert workflow run');
      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);

      const result = await runMacroRecipeAgainstSession(
        {
          ...parsed,
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
          'Expert workflow timed out. The document was restored and late results were discarded.',
        );
        return;
      }
      if (result.status === 'failed' || result.success === false) {
        setRunError(result.logs.at(-1) ?? 'Expert workflow execution failed.');
        return;
      }

      if (result.outputFiles.length > 0) {
        onOutputsProduced?.(result.outputFiles);
      }
    } catch (error) {
      if (abortRef.current?.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setRunError(message);
      logError('macro', 'Expert workflow execution failed', {
        error: message,
      });
    } finally {
      abortRef.current = null;
      setIsRunning(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort('Cancelled by user');
  };

  const saveExpertPreset = () => {
    try {
      const parsed = parseExpertRecipe(recipeJson);
      const nextName = presetName.trim();

      savePreset({
        ...parsed,
        name: nextName.length > 0 ? nextName : parsed.name,
      });
      setRunError(null);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-3 space-y-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="macro-expert-workspace"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <FileCode2 className="h-4 w-4" />
          Expert workflow source
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSelectedRecipe}
          disabled={!selectedRecipe || isRunning}
        >
          <Code2 className="mr-1 h-3.5 w-3.5" />
          Load Selected
        </Button>
      </div>

      <p className="m-0 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
        Edit raw workflow JSON only when the visual builder cannot express the required operation.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Preset Name
        </span>
        <input
          type="text"
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
          placeholder="Expert preset name"
        />
      </label>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Workflow Source
          </span>
          <div className="flex items-center gap-0.5 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              title="Table view"
              onClick={() => setViewMode('table')}
              className={[
                'flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] transition-colors',
                viewMode === 'table'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-900',
              ].join(' ')}
            >
              <Rows3 className="h-3 w-3" />
              Table
            </button>
            <button
              type="button"
              title="JSON view"
              onClick={() => setViewMode('json')}
              className={[
                'flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] transition-colors',
                viewMode === 'json'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-900',
              ].join(' ')}
            >
              <Code2 className="h-3 w-3" />
              JSON
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <ExpertRecipeStepTable json={recipeJson} />
        ) : (
          <textarea
            aria-label="Expert workflow JSON"
            value={recipeJson}
            onChange={(event) => {
              setRecipeJson(event.target.value);
              setLastTestedSignature(null);
            }}
            className="min-h-[220px] w-full rounded-md border border-slate-200 bg-slate-50 p-2 font-mono text-xs dark:border-slate-800 dark:bg-slate-900"
            spellCheck={false}
          />
        )}
      </div>

      {risk?.risk === 'preview-required' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Preview required.</strong>{' '}
          Validate + Dry Run must succeed after the latest source edit before destructive page changes can run.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void runDryRun()}
          disabled={disabled || isDryRunning || isRunning || !workingBytes}
          data-testid="macro-expert-test-run"
        >
          {isDryRunning ? (
            <Eye className="mr-1 h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Eye className="mr-1 h-3.5 w-3.5" />
          )}
          Validate + Dry Run
        </Button>

        {isRunning ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={cancel}
            className="text-red-600"
            data-testid="macro-expert-cancel"
          >
            <Square className="mr-1 h-3.5 w-3.5" />
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void runExpertRecipe()}
            disabled={disabled || isDryRunning || !workingBytes}
            data-testid="macro-expert-run"
          >
            <Play className="mr-1 h-3.5 w-3.5" />
            Run Expert
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={saveExpertPreset}
          disabled={disabled || isRunning || isDryRunning}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          Save Preset
        </Button>
      </div>

      {preflightReport && assessmentCurrent ? (
        <div
          className={[
            'rounded p-2 text-xs',
            preflightReport.isValid
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
          ].join(' ')}
        >
          <div className="mb-1 flex items-center gap-1 font-semibold">
            {preflightReport.isValid ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {preflightReport.isValid
              ? 'Expert preflight passed'
              : 'Expert preflight failed'}
          </div>

          {preflightReport.errors.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {preflightReport.errors.map((errorLine) => (
                <li key={errorLine}>{errorLine}</li>
              ))}
            </ul>
          ) : null}

          {preflightReport.warnings.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-600 dark:text-amber-400">
              {preflightReport.warnings.map((warningLine) => (
                <li key={warningLine}>{warningLine}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {runError ? (
        <div
          className="whitespace-pre-wrap rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
          role="alert"
        >
          {runError}
        </div>
      ) : null}

      <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-slate-200 p-2 dark:border-slate-800">
        {logs.length === 0 ? (
          <div className="text-xs text-slate-500">No expert run logs yet.</div>
        ) : null}
        {logs.map((line, index) => (
          <div
            key={`expert-${index}-${line}`}
            className="text-xs text-slate-600 dark:text-slate-300"
          >
            {line}
          </div>
        ))}
      </div>
    </section>
  );
};

function parseExpertRecipe(json: string): MacroRecipe {
  const raw = json.trim();
  if (raw.length === 0) {
    throw new Error('Expert workflow JSON is empty.');
  }

  const parsed: unknown = parseMacroRecipeJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Workflow JSON must be an object.');
  }

  const candidate = parsed as {
    id?: unknown;
    name?: unknown;
    steps?: unknown;
  };

  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    throw new Error('Workflow field "id" is required.');
  }
  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
    throw new Error('Workflow field "name" is required.');
  }
  if (!Array.isArray(candidate.steps)) {
    throw new Error('Workflow field "steps" must be an array.');
  }

  const recipe = candidate as MacroRecipe;
  const validation = macroValidator.validate(recipe);
  if (!validation.valid) {
    const details = validation.errors
      .map(
        (error) =>
          `Step ${error.stepIndex + 1} (${error.op}) ${error.field}: ${error.message}`,
      )
      .join('\n');
    throw new Error(`Workflow schema validation failed.\n${details}`);
  }

  return recipe;
}

function ExpertRecipeStepTable({
  json,
}: {
  json: string;
}) {
  let steps: Array<Record<string, unknown>> = [];
  let parseError: string | null = null;

  try {
    const parsed = parseBoundedJson(json, {
      maxBytes: DEFAULT_MACRO_RESOURCE_LIMITS.maxRecipeJsonBytes,
      label: 'expert workflow preview JSON',
    }) as { steps?: unknown };

    if (Array.isArray(parsed.steps)) {
      steps = parsed.steps as Array<Record<string, unknown>>;
    } else {
      parseError = 'No steps array found.';
    }
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Invalid JSON';
  }

  if (parseError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
        {parseError}
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        No steps defined
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800">
            <th className="w-6 px-1.5 py-1 text-left font-semibold text-slate-500 dark:text-slate-400">
              #
            </th>
            <th className="px-1.5 py-1 text-left font-semibold text-slate-500 dark:text-slate-400">
              Action
            </th>
            <th className="px-1.5 py-1 text-left font-semibold text-slate-500 dark:text-slate-400">
              Parameters
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => (
            <tr
              key={index}
              className={[
                'border-t border-slate-100 dark:border-slate-800',
                index % 2 === 1
                  ? 'bg-slate-50 dark:bg-slate-900'
                  : 'bg-white dark:bg-slate-950',
              ].join(' ')}
            >
              <td className="px-1.5 py-1 font-mono text-slate-400 dark:text-slate-600">
                {index + 1}
              </td>
              <td className="whitespace-nowrap px-1.5 py-1 font-medium text-slate-700 dark:text-slate-300">
                {getExpertStepLabel(step.op)}
              </td>
              <td className="break-all px-1.5 py-1 text-slate-500 dark:text-slate-400">
                {summarizeStepParams(step)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getExpertStepLabel(value: unknown): string {
  if (typeof value !== 'string') return 'Unknown action';

  try {
    return getMacroOpPresentation(
      getMacroOpSchema(value as MacroRecipe['steps'][number]['op']),
    ).label;
  } catch {
    return 'Unknown action';
  }
}

function summarizeSelector(selector: unknown): string {
  if (!selector || typeof selector !== 'object') return '';
  const value = selector as Record<string, unknown>;
  if (value.mode === 'all') return 'all pages';
  if (value.mode === 'current') return 'current page';
  if (value.mode === 'selected') return 'selected pages';
  if (value.mode === 'odd') return 'odd pages';
  if (value.mode === 'even') return 'even pages';
  if (value.mode === 'range') return `p${String(value.from)}–${String(value.to)}`;
  if (value.mode === 'list' && Array.isArray(value.pages)) {
    return `p${(value.pages as number[]).join(',')}`;
  }
  return '';
}

function summarizePosition(position: unknown): string {
  if (!position || typeof position !== 'object') return '';
  const value = position as Record<string, unknown>;
  if (value.mode === 'start') return 'at start';
  if (value.mode === 'end') return 'at end';
  if (value.mode === 'before') return `before p${String(value.page)}`;
  if (value.mode === 'after') return `after p${String(value.page)}`;
  return '';
}

function summarizeStepParams(step: Record<string, unknown>): string {
  const parts: string[] = [];
  if (step.selector) parts.push(summarizeSelector(step.selector));
  if (step.position) parts.push(summarizePosition(step.position));
  if (typeof step.degrees === 'number') parts.push(`${String(step.degrees)}°`);
  if (typeof step.text === 'string') {
    parts.push(
      `"${step.text.slice(0, 30)}${step.text.length > 30 ? '…' : ''}"`,
    );
  }
  if (typeof step.outputName === 'string') parts.push(`→ ${step.outputName}`);
  if (typeof step.count === 'number') parts.push(`×${String(step.count)}`);
  if (typeof step.atIndex === 'number') parts.push(`at index ${String(step.atIndex)}`);
  if (typeof step.zone === 'string') parts.push(String(step.zone));
  if (typeof step.align === 'string') parts.push(String(step.align));
  if (typeof step.size === 'string') parts.push(String(step.size));
  if (typeof step.title === 'string') parts.push(`"${step.title.slice(0, 20)}"`);
  if (Array.isArray(step.blocks)) parts.push(`${String(step.blocks.length)} blocks`);
  if (Array.isArray(step.order)) parts.push(`[${(step.order as number[]).join(',')}]`);
  if (Array.isArray(step.donorFileIds)) {
    parts.push(`${String(step.donorFileIds.length)} files`);
  }
  if (typeof step.donorFileId === 'string') {
    parts.push(`donor: ${step.donorFileId.slice(0, 12)}`);
  }
  return parts.join(' · ') || '—';
}
