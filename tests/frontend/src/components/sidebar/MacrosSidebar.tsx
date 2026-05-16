import React from 'react';
import {
  Play,
  RotateCw,
  Save,
  Sparkles,
  Trash2,
  Wrench,
  AlertCircle,
  CheckCircle,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import { useSessionStore } from '@/core/session/store';
import { error as logError } from '@/core/logger/service';
import { BUILTIN_MACROS } from '@/core/macro/builtins';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { GENERATION_MACROS } from '@/core/macro/generationBuiltins';
import { validateRecipeBeforeRun, type PreflightReport } from '@/core/macro/validation/validator';
import { usePresetsStore } from '@/core/macro/store/presets';
import { ImageIcon } from 'lucide-react';
import type {
  MacroOutputFile,
  MacroRecipe,
  MacroStep,
  PageSelector,
} from '@/core/macro/types';

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
const GENERATION_RECIPES: MacroRecipe[] = Object.values(GENERATION_MACROS);

const PLACEHOLDER_STEPS: Array<MacroStep['op']> = [
  'select_pages',
  'rotate_pages',
  'header_footer_text',
  'extract_pages',
];

export const MacrosSidebar: React.FC = () => {
  const { workingBytes, pageCount, viewState, fileName, selectedPages, replaceWorkingCopy } = useSessionStore();
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
  const [generationTitle, setGenerationTitle] = React.useState<string>('Untitled Report');
  const [selectedGenerationId, setSelectedGenerationId] = React.useState<string>('professional_report_full');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [overridesByRecipe, setOverridesByRecipe] = React.useState<
    Record<string, RecipeOverrides>
  >({});
  const [isRunning, setIsRunning]               = React.useState(false);
  const [macroLogs, setMacroLogs]               = React.useState<string[]>([]);
  const [execProgress, setExecProgress]         = React.useState<import('@/core/macro/executor').ExecutionProgress | null>(null);
  const [stepResults, setStepResults]           = React.useState<import('@/core/macro/registry').StepResult[]>([]);
  const [validationErrors, setValidationErrors] = React.useState<import('@/core/macro/validator').ValidationError[]>([]);

  // ── Backward-compatibility aliases ────────────────────────────────────────
  const setRunLogs = setMacroLogs;

  // To satisfy the unused variable linter for now (UI will use these later)
  void macroLogs;
  void execProgress;
  void stepResults;
  void validationErrors;

  const setRunError = (msg: string | null) => {
    if (msg) setMacroLogs(prev => [...prev, `[error] ${msg}`]);
  };
  const [outputQueue, setOutputQueue] = React.useState<OutputQueueItem[]>([]);
  const [preflightReport, setPreflightReport] = React.useState<PreflightReport | null>(null);
  const [isDryRunning, setIsDryRunning] = React.useState(false);
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

  const runSelectedMacro = React.useCallback(async () => {
  if (!selectedRecipe || !workingBytes) return;

  setIsRunning(true);
  setMacroLogs([]);
  setStepResults([]);
  setValidationErrors([]);
  setExecProgress(null);

  try {
    const appliedRecipe = applyOverridesToRecipe(
      selectedRecipe,
      overridesByRecipe[selectedRecipe.id] || createDefaultOverrides(selectedRecipe, pageCount),
      viewState.currentPage,
      pageCount,
    );

    const ctx: import('@/core/macro/types').MacroExecutionContext = {
      workingBytes,
      pageCount,
      selectedPages,
      fileName: fileName ?? 'document.pdf',
      fileId:   '',
      options:  { abortOnError: true },
    };

    const { executeMacroRecipe } = await import('@/core/macro/executor');
    const result = await executeMacroRecipe(
      appliedRecipe,
      ctx,
      (progress) => setExecProgress(progress),
    );

    setStepResults(result.stepResults);
    setMacroLogs(result.logs);

    if (!result.success && result.validationErrors?.length) {
      setValidationErrors(result.validationErrors);
      return;
    }

    if (result.success) {
      replaceWorkingCopy(result.finalBytes, result.stepResults
        .flatMap((r) => r.sideEffects)
        .filter((e) => e.type === 'page_count_changed')
        .at(-1)?.newCount
        ?? pageCount);

      for (const file of result.outputFiles) {
        triggerDownload(file.bytes, file.name);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setMacroLogs(prev => [...prev, `[fatal] ${message}`]);
  } finally {
    setIsRunning(false);
    setExecProgress(null);
  }
}, [selectedRecipe, workingBytes, pageCount, selectedPages, fileName, replaceWorkingCopy, overridesByRecipe, viewState.currentPage]);

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
    const generationRecipe = GENERATION_RECIPES.find((r) => r.id === selectedGenerationId);
    if (!generationRecipe) return;

    // Apply generation parameters if needed
    const finalRecipe = JSON.parse(JSON.stringify(generationRecipe)) as MacroRecipe;
    finalRecipe.steps.forEach((step) => {
      if (step.op === 'add_image_header_page') {
        step.title = generationTitle || 'Untitled Report';
        if (brandImageDataUrl) step.imageSrc = brandImageDataUrl;
      }
    });

    setIsRunning(true);
    try {
      await runMacroRecipeAgainstSession(finalRecipe, {
        saveOutputs: false,
      });
    } catch (err) {
      logError('macro', 'Failed to generate document', { error: String(err) });
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

        <select
          className="block w-full text-xs rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
          value={selectedGenerationId}
          onChange={(e) => setSelectedGenerationId(e.target.value)}
          disabled={isRunning}
        >
          {GENERATION_RECIPES.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.name}
            </option>
          ))}
        </select>

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
                  Click to pick header image
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

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Title
          </span>
          <input
            type="text"
            className="w-full text-xs rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
            value={generationTitle}
            onChange={(e) => setGenerationTitle(e.target.value)}
          />
        </label>

        <Button
          onClick={handleGenerate}
          disabled={isRunning || (selectedGenerationId === 'branded_cover_page' && !brandImageDataUrl)}
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


        <div className="space-y-1 max-h-32 overflow-auto rounded-md border border-slate-200 dark:border-slate-800 p-2">
          {macroLogs.length === 0 && (
            <div className="text-xs text-slate-500">No run logs yet.</div>
          )}
          {macroLogs.map((line: string) => (
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

      <section className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Wrench className="w-4 h-4" />
          Custom Recipe Builder (Coming Soon)
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Custom step-by-step builder ships in next phase; use Built-ins now.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled>
            New Recipe
          </Button>
          <Button variant="ghost" size="sm" disabled>
            Add Step
          </Button>
          <Button variant="ghost" size="sm" disabled>
            Remove Step
          </Button>
          <Button variant="secondary" size="sm" disabled>
            Run Custom
          </Button>
        </div>

        <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-500">
              <tr>
                <th className="text-left px-2 py-1.5">Step</th>
                <th className="text-left px-2 py-1.5">Operation</th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_STEPS.map((operation, index) => (
                <tr key={operation} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-2 py-1.5">{index + 1}</td>
                  <td className="px-2 py-1.5 font-mono">{operation}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
