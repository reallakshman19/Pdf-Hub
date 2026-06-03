import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Play,
  RotateCw,
  Save,
  Sparkles,
  Trash2,
  Wrench,
  AlertCircle,
  CheckCircle,
  Eye,
  FileCode2,
  Rows3,
  Code2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { useSessionStore } from '@/core/session/store';
import { error as logError } from '@/core/logger/service';
import { BUILTIN_MACROS } from '@/core/macro/builtins';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { validateRecipeBeforeRun, type PreflightReport } from '@/core/macro/validation/validator';
import { macroValidator } from '@/core/macro/validator';
import { usePresetsStore } from '@/core/macro/store/presets';
import { ImageIcon } from 'lucide-react';
import type {
  MacroOutputFile,
  MacroRecipe,
  MacroStep,
  PageSelector,
} from '@/core/macro/types';

import {
  GENERATION_TEMPLATES,
  getGenerationTemplateById,
} from '@/core/macro/generateDocument/generationRecipes';
import { buildGenerationRecipe } from '@/core/macro/generateDocument/buildGenerationRecipe';
import { buildGeneratedDocumentOutputName } from '@/core/macro/generateDocument/generateDocumentOutputName';
import type { GenerationField } from '@/core/macro/generateDocument/generationTypes';

function resolveFieldDefault(field: GenerationField): string {
  const raw = field.defaultValue ?? '';
  if (field.type === 'date' && /^\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}$/.test(raw.trim())) {
    return new Date().toISOString().slice(0, 10);
  }
  return raw;
}

type SelectorMode = 'selected' | 'current' | 'all' | 'range';
type BlankPlacement = 'before' | 'after';
type BlankSizeMode = 'match-current' | 'a4' | 'letter';

interface RecipeOverrides {
  selectorMode: SelectorMode;
  rangeFrom: number;
  rangeTo: number;
  rotateDegrees: 90 | 180 | 270;
  outputName: string;
  headerFooterText: string;
  headerFooterAlign: 'left' | 'center' | 'right';
  headerFooterMarginX: number;
  headerFooterMarginY: number;
  headerFooterFontSize: number;
  headerFooterColor: string;
  headerFooterOpacity: number;
  headerFooterPageToken: boolean;
  headerFooterFileToken: boolean;
  headerFooterDateToken: boolean;
  blankPlacement: BlankPlacement;
  blankSize: BlankSizeMode;
  blankCount: number;
}

interface OutputQueueItem extends MacroOutputFile {
  id: string;
}

const BUILTIN_RECIPES: MacroRecipe[] = Object.values(BUILTIN_MACROS);
const DEFAULT_EXPERT_RECIPE = BUILTIN_RECIPES[0] ?? null;

// ─── RecipeStepTable ─────────────────────────────────────────────────────────

function summarizeSelector(selector: unknown): string {
  if (!selector || typeof selector !== 'object') return '';
  const s = selector as Record<string, unknown>;
  if (s.mode === 'all') return 'all pages';
  if (s.mode === 'current') return 'current page';
  if (s.mode === 'selected') return 'selected pages';
  if (s.mode === 'odd') return 'odd pages';
  if (s.mode === 'even') return 'even pages';
  if (s.mode === 'range') return `p${String(s.from)}–${String(s.to)}`;
  if (s.mode === 'list' && Array.isArray(s.pages)) return `p${(s.pages as number[]).join(',')}`;
  return JSON.stringify(selector);
}

function summarizePosition(position: unknown): string {
  if (!position || typeof position !== 'object') return '';
  const p = position as Record<string, unknown>;
  if (p.mode === 'start') return 'at start';
  if (p.mode === 'end') return 'at end';
  if (p.mode === 'before') return `before p${String(p.page)}`;
  if (p.mode === 'after') return `after p${String(p.page)}`;
  return JSON.stringify(position);
}

function summarizeStepParams(step: Record<string, unknown>): string {
  const parts: string[] = [];
  if (step.selector) parts.push(summarizeSelector(step.selector));
  if (step.position) parts.push(summarizePosition(step.position));
  if (typeof step.degrees === 'number') parts.push(`${String(step.degrees)}°`);
  if (typeof step.text === 'string') parts.push(`"${step.text.slice(0, 30)}${step.text.length > 30 ? '…' : ''}"`);
  if (typeof step.outputName === 'string') parts.push(`→ ${step.outputName}`);
  if (typeof step.count === 'number') parts.push(`×${String(step.count)}`);
  if (typeof step.atIndex === 'number') parts.push(`at index ${String(step.atIndex)}`);
  if (typeof step.zone === 'string') parts.push(String(step.zone));
  if (typeof step.align === 'string') parts.push(String(step.align));
  if (typeof step.size === 'string') parts.push(String(step.size));
  if (typeof step.title === 'string') parts.push(`"${step.title.slice(0, 20)}"`);
  if (Array.isArray(step.blocks)) parts.push(`${String(step.blocks.length)} blocks`);
  if (Array.isArray(step.order)) parts.push(`[${(step.order as number[]).join(',')}]`);
  if (Array.isArray(step.donorFileIds)) parts.push(`${String(step.donorFileIds.length)} files`);
  if (typeof step.donorFileId === 'string') parts.push(`donor: ${step.donorFileId.slice(0, 12)}`);
  return parts.join(' · ') || '—';
}

function RecipeStepTable({ json }: { json: string }) {
  let steps: Array<Record<string, unknown>> = [];
  let parseError: string | null = null;

  try {
    const parsed = JSON.parse(json) as { steps?: unknown };
    if (Array.isArray(parsed.steps)) {
      steps = parsed.steps as Array<Record<string, unknown>>;
    } else {
      parseError = 'No steps array found';
    }
  } catch (e) {
    parseError = e instanceof Error ? e.message : 'Invalid JSON';
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
      <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 text-xs text-slate-500 text-center">
        No steps defined
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800">
            <th className="px-1.5 py-1 text-left font-semibold text-slate-500 dark:text-slate-400 w-6">#</th>
            <th className="px-1.5 py-1 text-left font-semibold text-slate-500 dark:text-slate-400">Operation</th>
            <th className="px-1.5 py-1 text-left font-semibold text-slate-500 dark:text-slate-400">Parameters</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => (
            <tr
              key={i}
              className={`border-t border-slate-100 dark:border-slate-800 ${i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-950'}`}
            >
              <td className="px-1.5 py-1 text-slate-400 dark:text-slate-600 font-mono">{i + 1}</td>
              <td className="px-1.5 py-1 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                {typeof step.op === 'string' ? step.op.replace(/_/g, ' ') : '?'}
              </td>
              <td className="px-1.5 py-1 text-slate-500 dark:text-slate-400 break-all">
                {summarizeStepParams(step)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MacrosSidebar ───────────────────────────────────────────────────────────

export const MacrosSidebar: React.FC = () => {
  const { workingBytes, pageCount, viewState, fileName } = useSessionStore();
  const { savedPresets, savePreset, deletePreset } = usePresetsStore();

  const allRecipes = React.useMemo(() => [...BUILTIN_RECIPES, ...savedPresets], [savedPresets]);

  const [selectedRecipeId, setSelectedRecipeId] = React.useState<string>(
    BUILTIN_RECIPES[0]?.id ?? '',
  );

  const selectedRecipe = React.useMemo(
    () => allRecipes.find((recipe) => recipe.id === selectedRecipeId) ?? allRecipes[0],
    [selectedRecipeId, allRecipes],
  );

  const [brandImageDataUrl, setBrandImageDataUrl] = React.useState<string>('');
  const [selectedGenerationId, setSelectedGenerationId] = React.useState<string>(
    GENERATION_TEMPLATES[0]?.id ?? '',
  );
  const [generationValues, setGenerationValues] = React.useState<Record<string, string>>(() => {
    const template = getGenerationTemplateById(GENERATION_TEMPLATES[0]?.id ?? '');
    if (!template) return {};
    return Object.fromEntries(template.fields.map((f) => [f.key, resolveFieldDefault(f)]));
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const selectedGenerationTemplate = React.useMemo(
    () => getGenerationTemplateById(selectedGenerationId),
    [selectedGenerationId],
  );

  const handleGenerationTemplateChange = (newId: string) => {
    setSelectedGenerationId(newId);
    const template = getGenerationTemplateById(newId);
    if (template) {
      setGenerationValues(Object.fromEntries(template.fields.map((f) => [f.key, resolveFieldDefault(f)])));
    } else {
      setGenerationValues({});
    }
  };

  const [overridesByRecipe, setOverridesByRecipe] = React.useState<
    Record<string, RecipeOverrides>
  >({});
  const [isRunning, setIsRunning] = React.useState(false);
  const [runLogs, setRunLogs] = React.useState<string[]>([]);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [outputQueue, setOutputQueue] = React.useState<OutputQueueItem[]>([]);
  const [preflightReport, setPreflightReport] = React.useState<PreflightReport | null>(null);
  const [isDryRunning, setIsDryRunning] = React.useState(false);
  const [expertRecipeJson, setExpertRecipeJson] = React.useState<string>(
    DEFAULT_EXPERT_RECIPE ? JSON.stringify(DEFAULT_EXPERT_RECIPE, null, 2) : '',
  );
  const [expertRecipeName, setExpertRecipeName] = React.useState<string>(
    DEFAULT_EXPERT_RECIPE ? `${DEFAULT_EXPERT_RECIPE.name} (Expert)` : 'Expert Preset',
  );
  const [expertPreflightReport, setExpertPreflightReport] = React.useState<PreflightReport | null>(null);
  const [expertLogs, setExpertLogs] = React.useState<string[]>([]);
  const [expertRunError, setExpertRunError] = React.useState<string | null>(null);
  const [isExpertDryRunning, setIsExpertDryRunning] = React.useState(false);
  const [isExpertRunning, setIsExpertRunning] = React.useState(false);
  const [recipeViewMode, setRecipeViewMode] = React.useState<'table' | 'json'>('table');
  const overrides = React.useMemo(
    () =>
      selectedRecipe
        ? overridesByRecipe[selectedRecipe.id] ??
          createDefaultOverrides(selectedRecipe, Math.max(1, pageCount))
        : createDefaultOverrides(undefined, Math.max(1, pageCount)),
    [overridesByRecipe, pageCount, selectedRecipe],
  );

  const hasRotate = selectedRecipe?.steps.some((step) => step.op === 'rotate_pages') ?? false;
  const hasExtractOrSplit =
    selectedRecipe?.steps.some((step) => step.op === 'extract_pages' || step.op === 'split_pages') ??
    false;
  const hasHeaderFooter =
    selectedRecipe?.steps.some((step) => step.op === 'header_footer_text') ?? false;
  const hasBlankInsert =
    selectedRecipe?.steps.some((step) => step.op === 'insert_blank_page') ?? false;

  const updateOverrides = (patch: Partial<RecipeOverrides>) => {
    if (!selectedRecipe) {
      return;
    }
    setOverridesByRecipe((current) => ({
      ...current,
      [selectedRecipe.id]: {
        ...overrides,
        ...patch,
      },
    }));
  };

  const handleDryRun = async () => {
    if (!selectedRecipe || !workingBytes || !fileName) return;
    setIsDryRunning(true);
    setPreflightReport(null);
    setRunLogs([]);
    setRunError(null);

    try {
      const finalRecipe = applyOverridesToRecipe(
        { ...selectedRecipe, dryRun: true },
        overrides,
        viewState.currentPage,
        Math.max(1, pageCount),
      );

      const report = await validateRecipeBeforeRun(finalRecipe, {
        pageCount: Math.max(1, pageCount),
        selectedPages: useSessionStore.getState().selectedPages,
        currentPage: viewState.currentPage,
        fileName,
        donorFiles: {}, // We would bind donors here in real life
        now: new Date(),
      });

      setPreflightReport(report);
      if (report.dryRunLogs) {
        setRunLogs(report.dryRunLogs);
      }
    } catch (err) {
      setRunError(String(err));
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleSavePreset = () => {
    if (!selectedRecipe) return;
    const finalRecipe = applyOverridesToRecipe(
      selectedRecipe,
      overrides,
      viewState.currentPage,
      Math.max(1, pageCount),
    );
    savePreset({
      ...finalRecipe,
      name: `${selectedRecipe.name} (Custom)`,
    });
  };

  const runSelectedMacro = async () => {
    if (!workingBytes || !selectedRecipe || !fileName) {
      return;
    }

    // Always validate before run
    const runtimeRecipe = applyOverridesToRecipe(
      selectedRecipe,
      overrides,
      viewState.currentPage,
      Math.max(1, pageCount),
    );

    const report = await validateRecipeBeforeRun(runtimeRecipe, {
      pageCount: Math.max(1, pageCount),
      selectedPages: useSessionStore.getState().selectedPages,
      currentPage: viewState.currentPage,
      fileName,
      donorFiles: {},
      now: new Date(),
    });

    if (!report.isValid) {
      setPreflightReport(report);
      return;
    }

    setPreflightReport(null);
    setIsRunning(true);
    setRunError(null);

    try {
      const result = await runMacroRecipeAgainstSession(runtimeRecipe, {
        saveOutputs: false,
      });

      setRunLogs(result.logs);
      if (result.outputFiles.length > 0) {
        setOutputQueue((current) => [
          ...current,
          ...result.outputFiles.map((output) => ({
            id: uuidv4(),
            ...output,
          })),
        ]);
      }
    } catch (err) {
      const message = String(err);
      setRunError(message);
      logError('macro', 'Macro execution failed in sidebar', {
        recipeId: selectedRecipe.id,
        error: message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const resetPanel = () => {
    if (!selectedRecipe) {
      return;
    }
    setOverridesByRecipe((current) => ({
      ...current,
      [selectedRecipe.id]: createDefaultOverrides(selectedRecipe, Math.max(1, pageCount)),
    }));
    setRunLogs([]);
    setRunError(null);
    setOutputQueue([]);
  };

  const saveOutput = async (id: string) => {
    const output = outputQueue.find((item) => item.id === id);
    if (!output) {
      return;
    }

    try {
      await FileAdapter.savePdfBytes(output.bytes, output.name, null);
      setOutputQueue((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      const message = String(err);
      setRunError(message);
      logError('macro', 'Failed to save macro output', {
        outputName: output.name,
        error: message,
      });
    }
  };

  const saveAllOutputs = async () => {
    for (const output of outputQueue) {
      try {
        await FileAdapter.savePdfBytes(output.bytes, output.name, null);
      } catch (err) {
        const message = String(err);
        setRunError(message);
        logError('macro', 'Failed to save all macro outputs', {
          outputName: output.name,
          error: message,
        });
        return;
      }
    }

    setOutputQueue([]);
  };

  const buildValidationContext = React.useCallback(() => ({
    pageCount: Math.max(1, pageCount),
    selectedPages: useSessionStore.getState().selectedPages,
    currentPage: viewState.currentPage,
    fileName: fileName ?? 'document.pdf',
    donorFiles: {},
    now: new Date(),
  }), [fileName, pageCount, viewState.currentPage]);

  const loadSelectedRecipeIntoExpert = () => {
    if (!selectedRecipe) {
      return;
    }
    setExpertRecipeName(`${selectedRecipe.name} (Expert)`);
    setExpertRecipeJson(JSON.stringify(selectedRecipe, null, 2));
    setExpertPreflightReport(null);
    setExpertLogs([]);
    setExpertRunError(null);
  };

  const parseExpertRecipe = (): MacroRecipe => {
    const raw = expertRecipeJson.trim();
    if (raw.length === 0) {
      throw new Error('Expert recipe JSON is empty.');
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Recipe JSON must be an object.');
    }

    const candidate = parsed as {
      id?: unknown;
      name?: unknown;
      steps?: unknown;
      dryRun?: unknown;
    };

    if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
      throw new Error('Recipe field "id" is required.');
    }
    if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
      throw new Error('Recipe field "name" is required.');
    }
    if (!Array.isArray(candidate.steps)) {
      throw new Error('Recipe field "steps" must be an array.');
    }

    const recipe = candidate as MacroRecipe;
    const validation = macroValidator.validate(recipe);
    if (!validation.valid) {
      const details = validation.errors
        .map((error) => `Step ${error.stepIndex + 1} (${error.op}) ${error.field}: ${error.message}`)
        .join('\n');
      throw new Error(`Recipe schema validation failed.\n${details}`);
    }

    return recipe;
  };

  const runExpertDryRun = async () => {
    setExpertRunError(null);
    setExpertPreflightReport(null);
    setExpertLogs([]);
    setIsExpertDryRunning(true);

    try {
      const parsed = parseExpertRecipe();
      const dryRunRecipe: MacroRecipe = {
        ...parsed,
        dryRun: true,
      };
      const report = await validateRecipeBeforeRun(dryRunRecipe, buildValidationContext());
      setExpertPreflightReport(report);
      setExpertLogs(report.dryRunLogs);
    } catch (err) {
      setExpertRunError(String(err));
    } finally {
      setIsExpertDryRunning(false);
    }
  };

  const runExpertRecipe = async () => {
    if (!workingBytes) {
      return;
    }

    setExpertRunError(null);
    setExpertPreflightReport(null);
    setExpertLogs([]);
    setIsExpertRunning(true);

    try {
      const parsed = parseExpertRecipe();
      const report = await validateRecipeBeforeRun(parsed, buildValidationContext());
      setExpertPreflightReport(report);

      if (!report.isValid) {
        setExpertRunError('Preflight failed. Fix recipe errors before running.');
        return;
      }

      const result = await runMacroRecipeAgainstSession(parsed, {
        saveOutputs: false,
      });
      setExpertLogs(result.logs);
      if (result.outputFiles.length > 0) {
        setOutputQueue((current) => [
          ...current,
          ...result.outputFiles.map((output) => ({
            id: uuidv4(),
            ...output,
          })),
        ]);
      }
    } catch (err) {
      const message = String(err);
      setExpertRunError(message);
      logError('macro', 'Expert macro execution failed', { error: message });
    } finally {
      setIsExpertRunning(false);
    }
  };

  const saveExpertPreset = () => {
    try {
      const parsed = parseExpertRecipe();
      const nextName = expertRecipeName.trim();
      savePreset({
        ...parsed,
        name: nextName.length > 0 ? nextName : parsed.name,
      });
      setExpertRunError(null);
    } catch (err) {
      setExpertRunError(String(err));
    }
  };

  const updateGenerationValue = (key: string, value: string) => {
    setGenerationValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const resetGenerationValues = React.useCallback(() => {
    if (!selectedGenerationTemplate) {
      setGenerationValues({});
      return;
    }
    setGenerationValues(
      Object.fromEntries(
        selectedGenerationTemplate.fields.map((field) => [field.key, resolveFieldDefault(field)]),
      ),
    );
  }, [selectedGenerationTemplate]);

  const renderGenerationField = (field: GenerationField) => {
    const value = generationValues[field.key] ?? resolveFieldDefault(field);

    const baseClassName =
      'w-full text-xs rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5';

    if (field.type === 'textarea') {
      return (
        <textarea
          className={`${baseClassName} min-h-[72px]`}
          value={value}
          required={field.required}
          onChange={(event) => updateGenerationValue(field.key, event.target.value)}
        />
      );
    }

    if (field.type === 'date') {
      return (
        <input
          type="date"
          className={baseClassName}
          value={value}
          required={field.required}
          onChange={(event) => updateGenerationValue(field.key, event.target.value)}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          className={baseClassName}
          value={value}
          required={field.required}
          onChange={(event) => updateGenerationValue(field.key, event.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type="text"
        className={baseClassName}
        value={value}
        required={field.required}
        onChange={(event) => updateGenerationValue(field.key, event.target.value)}
      />
    );
  };

  if (!workingBytes) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 text-sm text-slate-500 dark:text-slate-400">
          Open a PDF to run macros.
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    const generationTemplate = getGenerationTemplateById(selectedGenerationId);

    if (!generationTemplate) {
      setRunError('Generate Document template was not found.');
      return;
    }

    setIsRunning(true);
    setRunError(null);
    setRunLogs([]);

    try {
      const finalRecipe = buildGenerationRecipe({
        template: generationTemplate,
        values: generationValues,
        fileName: fileName ?? 'document.pdf',
        pageCount: Math.max(1, pageCount),
        now: new Date(),
        brandImageDataUrl: brandImageDataUrl || null,
      });

      const result = await runMacroRecipeAgainstSession(finalRecipe, {
        saveOutputs: false,
      });

      if (!result.success) {
        setRunError(result.logs?.at(-1) ?? 'Generate Document failed.');
        return;
      }

      setRunLogs(result.logs ?? []);

      const generatedOutputs: MacroOutputFile[] = result.outputFiles.length > 0
        ? result.outputFiles
        : [
            {
              name: buildGeneratedDocumentOutputName(generationTemplate),
              bytes: result.finalBytes,
            },
          ];

      setOutputQueue((current) => [
        ...current,
        ...generatedOutputs.map((output) => ({
          id: uuidv4(),
          ...output,
        })),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRunError(message);
      logError('macro', 'Failed to generate document', { error: message });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-3 space-y-4">
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Sparkles className="w-4 h-4" />
          Generate Document
        </div>

        <label className="sr-only" htmlFor="generate-document-template">
          Generate Document Template
        </label>
        <select
          id="generate-document-template"
          aria-label="Generate Document Template"
          className="block w-full text-xs rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
          value={selectedGenerationId}
          onChange={(e) => handleGenerationTemplateChange(e.target.value)}
          disabled={isRunning}
        >
          {GENERATION_TEMPLATES.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>

        {selectedGenerationTemplate && (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {selectedGenerationTemplate.description}
          </p>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {GENERATION_TEMPLATES.length} templates available. Fields update when the template changes.
        </p>

        {selectedGenerationId === 'branded_cover_page' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Brand / Header Image
            </span>
            <div
              className="w-full h-24 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors relative overflow-hidden"
              onClick={() => fileInputRef.current?.click()}
            >
              {brandImageDataUrl ? (
                <img src={brandImageDataUrl} className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-slate-400 text-xs">
                  <ImageIcon className="w-6 h-6 mx-auto mb-1" />
                  No image selected — using placeholder.
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setBrandImageDataUrl(reader.result as string);
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          </label>
        )}

        {selectedGenerationTemplate?.fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            {renderGenerationField(field)}
          </label>
        ))}

        <Button
          type="button"
          variant="ghost"
          onClick={resetGenerationValues}
          disabled={isRunning || !selectedGenerationTemplate}
          className="w-full justify-center text-xs"
        >
          Reset Fields
        </Button>

        <Button
          onClick={handleGenerate}
          disabled={isRunning || !selectedGenerationTemplate}
          className="w-full justify-center bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
        >
          {isRunning ? 'Generating...' : 'Generate PDF'}
        </Button>
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Wrench className="w-4 h-4" />
          Enhance Document
        </div>

        <div className="flex gap-2 items-center">
          <select
            id="recipe-select"
            className="block w-full text-xs rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
            value={selectedRecipeId}
            onChange={(e) => setSelectedRecipeId(e.target.value)}
            disabled={isRunning || !workingBytes}
          >
            <optgroup label="Built-ins">
              {BUILTIN_RECIPES.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </optgroup>
            {savedPresets.length > 0 && (
              <optgroup label="Saved Presets">
                {savedPresets.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {selectedRecipeId.startsWith('custom_') && (
            <Button variant="ghost" size="icon" onClick={() => deletePreset(selectedRecipeId)} className="flex-shrink-0 text-red-500 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Parameters
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-500">Target pages</label>
          <select
            value={overrides.selectorMode}
            onChange={(event) =>
              updateOverrides({
                selectorMode: event.target.value as SelectorMode,
              })
            }
            className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
          >
            <option value="selected">Selected pages</option>
            <option value="current">Current page</option>
            <option value="all">All pages</option>
            <option value="range">Range</option>
          </select>
        </div>

        {overrides.selectorMode === 'range' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              From
              <input
                type="number"
                min={1}
                max={Math.max(1, pageCount)}
                value={overrides.rangeFrom}
                onChange={(event) =>
                  updateOverrides({
                    rangeFrom: Number(event.target.value),
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              To
              <input
                type="number"
                min={1}
                max={Math.max(1, pageCount)}
                value={overrides.rangeTo}
                onChange={(event) =>
                  updateOverrides({
                    rangeTo: Number(event.target.value),
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        )}

        {hasRotate && (
          <div className="space-y-2">
            <label className="text-xs text-slate-500">Rotate degrees</label>
            <select
              value={overrides.rotateDegrees}
              onChange={(event) =>
                updateOverrides({
                  rotateDegrees: Number(event.target.value) as 90 | 180 | 270,
                })
              }
              className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
            >
              <option value={90}>90</option>
              <option value={180}>180</option>
              <option value={270}>270</option>
            </select>
          </div>
        )}

        {hasExtractOrSplit && (
          <label className="text-xs text-slate-500 block">
            Output file name
            <input
              type="text"
              value={overrides.outputName}
              onChange={(event) =>
                updateOverrides({
                  outputName: event.target.value,
                })
              }
              className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
            />
          </label>
        )}

        {hasHeaderFooter && (
          <>
            <label className="text-xs text-slate-500 block">
              Header/Footer text
              <input
                type="text"
                value={overrides.headerFooterText}
                onChange={(event) =>
                  updateOverrides({
                    headerFooterText: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Align
                <select
                  value={overrides.headerFooterAlign}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterAlign: event.target.value as 'left' | 'center' | 'right',
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Font size
                <input
                  type="number"
                  min={6}
                  max={72}
                  value={overrides.headerFooterFontSize}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterFontSize: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Margin X
                <input
                  type="number"
                  min={0}
                  value={overrides.headerFooterMarginX}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterMarginX: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                Margin Y
                <input
                  type="number"
                  min={0}
                  value={overrides.headerFooterMarginY}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterMarginY: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Color
                <input
                  type="text"
                  value={overrides.headerFooterColor}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterColor: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                Opacity
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={overrides.headerFooterOpacity}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterOpacity: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={overrides.headerFooterPageToken === true}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterPageToken: event.target.checked,
                    })
                  }
                />
                Page token
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={overrides.headerFooterFileToken === true}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterFileToken: event.target.checked,
                    })
                  }
                />
                File token
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={overrides.headerFooterDateToken === true}
                  onChange={(event) =>
                    updateOverrides({
                      headerFooterDateToken: event.target.checked,
                    })
                  }
                />
                Date token
              </label>
            </div>
          </>
        )}

        {hasBlankInsert && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Position
                <select
                  value={overrides.blankPlacement}
                  onChange={(event) =>
                    updateOverrides({
                      blankPlacement: event.target.value as BlankPlacement,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                >
                  <option value="before">Before current</option>
                  <option value="after">After current</option>
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Size
                <select
                  value={overrides.blankSize}
                  onChange={(event) =>
                    updateOverrides({
                      blankSize: event.target.value as BlankSizeMode,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
                >
                  <option value="match-current">Match current</option>
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                </select>
              </label>
            </div>

            <label className="text-xs text-slate-500 block">
              Count
              <input
                type="number"
                min={1}
                max={20}
                value={overrides.blankCount}
                onChange={(event) =>
                  updateOverrides({
                    blankCount: Number(event.target.value),
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              />
            </label>
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Run
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 text-xs"
              onClick={() => void handleDryRun()}
              disabled={isRunning || isDryRunning || !workingBytes}
            >
              {isDryRunning ? (
                <RotateCw className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Eye className="w-3.5 h-3.5 mr-1" />
              )}
              Dry Run
            </Button>
            <Button
              variant="secondary"
              className="flex-1 text-xs"
              onClick={handleSavePreset}
              disabled={isRunning || !workingBytes}
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              Save Preset
            </Button>
          </div>

          {preflightReport && (
            <div className={`p-2 rounded text-xs ${preflightReport.isValid ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              <div className="flex items-center gap-1 font-semibold mb-1">
                {preflightReport.isValid ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {preflightReport.isValid ? 'Preflight Passed' : 'Preflight Failed'}
              </div>
              {preflightReport.errors.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5 mt-1">
                  {preflightReport.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
              {preflightReport.warnings.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5 mt-1 text-amber-600 dark:text-amber-400">
                  {preflightReport.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={() => void runSelectedMacro()} disabled={isRunning || !selectedRecipe || (preflightReport ? !preflightReport.isValid : false)}>
              {isRunning ? (
                <RotateCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              {isRunning ? 'Running' : 'Run Macro'}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetPanel}>
              Reset
            </Button>
          </div>
        </div>

        {runError && (
          <div className="rounded-md border border-red-300 bg-red-50 text-red-700 px-2 py-1 text-xs">
            {runError}
          </div>
        )}

        <div className="space-y-1 max-h-32 overflow-auto rounded-md border border-slate-200 dark:border-slate-800 p-2">
          {runLogs.length === 0 && (
            <div className="text-xs text-slate-500">No run logs yet.</div>
          )}
          {runLogs.map((line) => (
            <div key={`${selectedRecipe?.id}-${line}`} className="text-xs text-slate-600 dark:text-slate-300">
              {line}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Output Queue
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void saveAllOutputs()}
              disabled={outputQueue.length === 0}
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              Save All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOutputQueue([])}
              disabled={outputQueue.length === 0}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        {outputQueue.length === 0 && (
          <div className="text-xs text-slate-500">No generated output files.</div>
        )}

        <div className="space-y-2">
          {outputQueue.map((output) => (
            <div key={output.id} className="rounded-md border border-slate-200 dark:border-slate-800 p-2 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-700 dark:text-slate-200 truncate">{output.name}</div>
              <Button variant="ghost" size="sm" onClick={() => void saveOutput(output.id)}>
                <Save className="w-3.5 h-3.5 mr-1" />
                Save
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FileCode2 className="w-4 h-4" />
            Expert JSON Builder
          </div>
          <Button variant="ghost" size="sm" onClick={loadSelectedRecipeIntoExpert} disabled={!selectedRecipe}>
            <Code2 className="w-3.5 h-3.5 mr-1" />
            Load Selected
          </Button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Preset Name
          </span>
          <input
            type="text"
            value={expertRecipeName}
            onChange={(event) => setExpertRecipeName(event.target.value)}
            className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs"
            placeholder="Expert preset name"
          />
        </label>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Recipe Steps
            </span>
            <div className="flex items-center gap-0.5 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                title="Table view"
                onClick={() => setRecipeViewMode('table')}
                className={`px-1.5 py-0.5 flex items-center gap-0.5 text-[10px] transition-colors ${recipeViewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100'}`}
              >
                <Rows3 className="w-3 h-3" /> Table
              </button>
              <button
                type="button"
                title="JSON view"
                onClick={() => setRecipeViewMode('json')}
                className={`px-1.5 py-0.5 flex items-center gap-0.5 text-[10px] transition-colors ${recipeViewMode === 'json' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100'}`}
              >
                <Code2 className="w-3 h-3" /> JSON
              </button>
            </div>
          </div>

          {recipeViewMode === 'table' ? (
            <RecipeStepTable json={expertRecipeJson} />
          ) : (
            <textarea
              value={expertRecipeJson}
              onChange={(event) => setExpertRecipeJson(event.target.value)}
              className="w-full min-h-[220px] rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2 text-xs font-mono"
              spellCheck={false}
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void runExpertDryRun()}
            disabled={isExpertDryRunning || isExpertRunning || isRunning}
          >
            {isExpertDryRunning ? (
              <RotateCw className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Eye className="w-3.5 h-3.5 mr-1" />
            )}
            Validate + Dry Run
          </Button>
          <Button
            size="sm"
            onClick={() => void runExpertRecipe()}
            disabled={isExpertRunning || isExpertDryRunning || isRunning}
          >
            {isExpertRunning ? (
              <RotateCw className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1" />
            )}
            Run Expert
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={saveExpertPreset}
            disabled={isExpertRunning || isExpertDryRunning}
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            Save Preset
          </Button>
        </div>

        {expertPreflightReport && (
          <div className={`p-2 rounded text-xs ${expertPreflightReport.isValid ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
            <div className="flex items-center gap-1 font-semibold mb-1">
              {expertPreflightReport.isValid ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {expertPreflightReport.isValid ? 'Expert preflight passed' : 'Expert preflight failed'}
            </div>
            {expertPreflightReport.errors.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5 mt-1">
                {expertPreflightReport.errors.map((errorLine, index) => <li key={index}>{errorLine}</li>)}
              </ul>
            )}
            {expertPreflightReport.warnings.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5 mt-1 text-amber-600 dark:text-amber-400">
                {expertPreflightReport.warnings.map((warningLine, index) => <li key={index}>{warningLine}</li>)}
              </ul>
            )}
          </div>
        )}

        {expertRunError && (
          <div className="rounded-md border border-red-300 bg-red-50 text-red-700 px-2 py-1 text-xs whitespace-pre-wrap">
            {expertRunError}
          </div>
        )}

        <div className="space-y-1 max-h-40 overflow-auto rounded-md border border-slate-200 dark:border-slate-800 p-2">
          {expertLogs.length === 0 && (
            <div className="text-xs text-slate-500">No expert run logs yet.</div>
          )}
          {expertLogs.map((line, index) => (
            <div key={`expert-${index}-${line}`} className="text-xs text-slate-600 dark:text-slate-300">
              {line}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

function createDefaultOverrides(recipe: MacroRecipe | undefined, pageCount: number): RecipeOverrides {
  const normalizedPageCount = Math.max(1, pageCount);

  if (!recipe) {
    return {
      selectorMode: 'selected',
      rangeFrom: 1,
      rangeTo: normalizedPageCount,
      rotateDegrees: 90,
      outputName: 'macro-output.pdf',
      headerFooterText: 'Page {page} of {pages}',
      headerFooterAlign: 'center',
      headerFooterMarginX: 24,
      headerFooterMarginY: 20,
      headerFooterFontSize: 10,
      headerFooterColor: '#475569',
      headerFooterOpacity: 0.9,
      headerFooterPageToken: true,
      headerFooterFileToken: false,
      headerFooterDateToken: false,
      blankPlacement: 'after',
      blankSize: 'match-current',
      blankCount: 1,
    };
  }

  const selectLikeStep = recipe.steps.find((step) => hasSelector(step));
  const selector = selectLikeStep ? selectorFromStep(selectLikeStep) : { mode: 'selected' as const };

  const rotateStep = recipe.steps.find((step) => step.op === 'rotate_pages');
  const outputStep = recipe.steps.find((step) => step.op === 'extract_pages' || step.op === 'split_pages');
  const headerFooterStep = recipe.steps.find((step) => step.op === 'header_footer_text');
  const blankInsertStep = recipe.steps.find((step) => step.op === 'insert_blank_page');

  return {
    selectorMode: selector.mode === 'range' || selector.mode === 'current' || selector.mode === 'all'
      ? selector.mode
      : 'selected',
    rangeFrom: selector.mode === 'range' ? selector.from : 1,
    rangeTo: selector.mode === 'range' ? selector.to : normalizedPageCount,
    rotateDegrees: rotateStep?.op === 'rotate_pages' ? rotateStep.degrees : 90,
    outputName:
      outputStep?.op === 'extract_pages' || outputStep?.op === 'split_pages'
        ? outputStep.outputName ?? `${recipe.id}.pdf`
        : `${recipe.id}.pdf`,
    headerFooterText:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.text
        : 'Page {page} of {pages}',
    headerFooterAlign:
      headerFooterStep?.op === 'header_footer_text' ? headerFooterStep.align : 'center',
    headerFooterMarginX:
      headerFooterStep?.op === 'header_footer_text' ? headerFooterStep.marginX : 24,
    headerFooterMarginY:
      headerFooterStep?.op === 'header_footer_text' ? headerFooterStep.marginY : 20,
    headerFooterFontSize:
      headerFooterStep?.op === 'header_footer_text' ? headerFooterStep.fontSize : 10,
    headerFooterColor:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.color ?? '#475569'
        : '#475569',
    headerFooterOpacity:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.opacity ?? 0.9
        : 0.9,
    headerFooterPageToken:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.pageNumberToken ?? true
        : true,
    headerFooterFileToken:
      headerFooterStep?.op === 'header_footer_text'
        ? headerFooterStep.fileNameToken ?? false
        : false,
    headerFooterDateToken:
      headerFooterStep?.op === 'header_footer_text'
        ? (headerFooterStep.dateToken ?? false)
        : false,
    blankPlacement:
      blankInsertStep?.op === 'insert_blank_page' && blankInsertStep.position.mode === 'before'
        ? 'before'
        : 'after',
    blankSize:
      blankInsertStep?.op === 'insert_blank_page' && typeof blankInsertStep.size === 'string'
        ? blankInsertStep.size
        : 'match-current',
    blankCount:
      blankInsertStep?.op === 'insert_blank_page' ? blankInsertStep.count ?? 1 : 1,
  };
}

function applyOverridesToRecipe(
  recipe: MacroRecipe,
  overrides: RecipeOverrides,
  currentPage: number,
  pageCount: number,
): MacroRecipe {
  const selector = toPageSelector(overrides, pageCount);

  const nextSteps = recipe.steps.map((step) => {
    switch (step.op) {
      case 'select_pages':
        return { ...step, selector };

      case 'extract_pages':
        return {
          ...step,
          selector,
          outputName: cleanOutputName(overrides.outputName, step.outputName),
        };

      case 'split_pages':
        return {
          ...step,
          selector,
          outputName: cleanOutputName(overrides.outputName, step.outputName),
        };

      case 'duplicate_pages':
      case 'rotate_pages':
      case 'remove_pages':
        return {
          ...step,
          selector,
          ...(step.op === 'rotate_pages' ? { degrees: overrides.rotateDegrees } : {}),
        };

      case 'header_footer_text':
        return {
          ...step,
          selector,
          text: overrides.headerFooterText,
          align: overrides.headerFooterAlign,
          marginX: overrides.headerFooterMarginX,
          marginY: overrides.headerFooterMarginY,
          fontSize: overrides.headerFooterFontSize,
          color: overrides.headerFooterColor,
          opacity: clamp(overrides.headerFooterOpacity, 0, 1),
          pageNumberToken: overrides.headerFooterPageToken,
          fileNameToken: overrides.headerFooterFileToken,
          dateToken: overrides.headerFooterDateToken,
        };

      case 'insert_blank_page':
        return {
          ...step,
          position: {
            mode: overrides.blankPlacement,
            page: currentPage,
          },
          size: overrides.blankSize,
          count: Math.max(1, overrides.blankCount),
        };

      default:
        return step;
    }
  });

  return {
    ...recipe,
    steps: nextSteps,
  };
}

function cleanOutputName(candidate: string, fallback: string | undefined): string | undefined {
  const normalized = candidate.trim();
  if (normalized.length > 0) {
    return normalized;
  }
  return fallback;
}

function hasSelector(step: MacroStep): boolean {
  return (
    step.op === 'select_pages' ||
    step.op === 'extract_pages' ||
    step.op === 'split_pages' ||
    step.op === 'duplicate_pages' ||
    step.op === 'rotate_pages' ||
    step.op === 'remove_pages' ||
    step.op === 'header_footer_text'
  );
}

function selectorFromStep(step: MacroStep): PageSelector {
  switch (step.op) {
    case 'select_pages':
    case 'extract_pages':
    case 'split_pages':
    case 'duplicate_pages':
    case 'rotate_pages':
    case 'remove_pages':
    case 'header_footer_text':
      return step.selector;
    default:
      return { mode: 'selected' };
  }
}

function toPageSelector(overrides: RecipeOverrides, pageCount: number): PageSelector {
  if (overrides.selectorMode === 'all') {
    return { mode: 'all' };
  }
  if (overrides.selectorMode === 'current') {
    return { mode: 'current' };
  }
  if (overrides.selectorMode === 'range') {
    const from = clamp(overrides.rangeFrom, 1, Math.max(1, pageCount));
    const to = clamp(overrides.rangeTo, 1, Math.max(1, pageCount));
    return { mode: 'range', from, to };
  }
  return { mode: 'selected' };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}