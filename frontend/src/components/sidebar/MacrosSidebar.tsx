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
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/core/session/store';
import { error as logError } from '@/core/logger/service';
import { BUILTIN_MACROS } from '@/core/macro/builtins';
import { runMacroRecipeAgainstSession } from '@/core/macro/sessionRunner';
import { validateRecipeBeforeRun, type PreflightReport } from '@/core/macro/validation/validator';
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
import { MacroExpertWorkspace } from '@/components/macro/advanced/MacroExpertWorkspace';
import { MacroPresetExecutionPanel } from '@/components/macro/advanced/MacroPresetExecutionPanel';
import {
  MacroOutputQueue,
  type MacroOutputQueueItem,
} from '@/components/macro/advanced/MacroOutputQueue';

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

const BUILTIN_RECIPES: MacroRecipe[] = Object.values(BUILTIN_MACROS);
// ─── MacrosSidebar ───────────────────────────────────────────────────────────

export const MacrosSidebar: React.FC = () => {
  const { workingBytes, pageCount, viewState, fileName } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    pageCount: state.pageCount,
    viewState: state.viewState,
    fileName: state.fileName,
  })));
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
  const [generationRunning, setGenerationRunning] = React.useState(false);
  const [generationLogs, setGenerationLogs] = React.useState<string[]>([]);
  const [generationError, setGenerationError] = React.useState<string | null>(null);
  const [presetRunnerBusy, setPresetRunnerBusy] = React.useState(false);
  const [outputQueue, setOutputQueue] = React.useState<MacroOutputQueueItem[]>([]);
  const overrides = React.useMemo(
    () =>
      selectedRecipe
        ? overridesByRecipe[selectedRecipe.id] ??
          createDefaultOverrides(selectedRecipe, Math.max(1, pageCount))
        : createDefaultOverrides(undefined, Math.max(1, pageCount)),
    [overridesByRecipe, pageCount, selectedRecipe],
  );

  const effectiveRecipe = React.useMemo(
    () =>
      selectedRecipe
        ? applyOverridesToRecipe(
            selectedRecipe,
            overrides,
            viewState.currentPage,
            Math.max(1, pageCount),
          )
        : undefined,
    [
      overrides,
      pageCount,
      selectedRecipe,
      viewState.currentPage,
    ],
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

  const resetPanel = () => {
    if (!selectedRecipe) {
      return;
    }
    setOverridesByRecipe((current) => ({
      ...current,
      [selectedRecipe.id]: createDefaultOverrides(selectedRecipe, Math.max(1, pageCount)),
    }));
    setOutputQueue([]);
  };

  const saveCurrentPreset = (recipe: MacroRecipe) => {
    savePreset({
      ...recipe,
      name: `${selectedRecipe?.name ?? recipe.name} (Custom)`,
    });
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
      setGenerationError('Generate Document template was not found.');
      return;
    }

    setGenerationRunning(true);
    setGenerationError(null);
    setGenerationLogs([]);

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
        setGenerationError(result.logs?.at(-1) ?? 'Generate Document failed.');
        return;
      }

      setGenerationLogs(result.logs ?? []);

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
      setGenerationError(message);
      logError('macro', 'Failed to generate document', { error: message });
    } finally {
      setGenerationRunning(false);
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
          disabled={generationRunning || presetRunnerBusy}
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
          disabled={generationRunning || presetRunnerBusy || !selectedGenerationTemplate}
          className="w-full justify-center text-xs"
        >
          Reset Fields
        </Button>

        <Button
          onClick={handleGenerate}
          disabled={generationRunning || presetRunnerBusy || !selectedGenerationTemplate}
          className="w-full justify-center bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
        >
          {generationRunning ? 'Generating...' : 'Generate PDF'}
        </Button>

        {generationError ? (
          <div
            className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
            role="alert"
          >
            {generationError}
          </div>
        ) : null}

        {generationLogs.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
              Generation details
            </summary>
            <div className="mt-2 max-h-32 space-y-1 overflow-auto rounded-md border border-slate-200 p-2 dark:border-slate-800">
              {generationLogs.map((line, index) => (
                <div
                  key={`generation-${index}-${line}`}
                  className="text-xs text-slate-600 dark:text-slate-300"
                >
                  {line}
                </div>
              ))}
            </div>
          </details>
        ) : null}
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
            disabled={generationRunning || presetRunnerBusy || !workingBytes}
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
              disabled={generationRunning || isDryRunning || !workingBytes}
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
              disabled={generationRunning || !workingBytes}
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
            {generationRunning ? (
              <Button variant="secondary" size="sm" onClick={cancelSelectedMacro} className="text-red-600">
                <Square className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={() => void runSelectedMacro()} disabled={!selectedRecipe || (preflightReport ? !preflightReport.isValid : false)}>
                <Play className="w-4 h-4 mr-1" />
                Run Macro
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={resetPanel}>
              Reset
            </Button>
          </div>
        </div>

        {generationError && (
          <div className="rounded-md border border-red-300 bg-red-50 text-red-700 px-2 py-1 text-xs">
            {generationError}
          </div>
        )}

        <div className="space-y-1 max-h-32 overflow-auto rounded-md border border-slate-200 dark:border-slate-800 p-2">
          {generationLogs.length === 0 && (
            <div className="text-xs text-slate-500">No run logs yet.</div>
          )}
          {generationLogs.map((line) => (
            <div key={`${selectedRecipe?.id}-${line}`} className="text-xs text-slate-600 dark:text-slate-300">
              {line}
            </div>
          ))}
        </div>
      </section>

      <MacroOutputQueue
        outputs={outputQueue}
        onChange={setOutputQueue}
        onError={setRunError}
      />

      <MacroExpertWorkspace
        selectedRecipe={selectedRecipe}
        disabled={generationRunning || isDryRunning}
        onOutputsProduced={(outputs) => {
          setOutputQueue((current) => [
            ...current,
            ...outputs.map((output) => ({
              id: uuidv4(),
              ...output,
            })),
          ]);
        }}
      />
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