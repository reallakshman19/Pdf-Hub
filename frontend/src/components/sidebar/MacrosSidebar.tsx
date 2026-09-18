import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Trash2,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '@/core/session/store';
import { BUILTIN_MACROS } from '@/core/macro/builtins';
import { usePresetsStore } from '@/core/macro/store/presets';
import type { MacroRecipe } from '@/core/macro/types';
import {
  applyOverridesToRecipe,
  createDefaultOverrides,
  type RecipeOverrides,
} from '@/core/macro/presetOverrides';

import { MacroExpertWorkspace } from '@/components/macro/advanced/MacroExpertWorkspace';
import { MacroGenerateDocumentPanel } from '@/components/macro/advanced/MacroGenerateDocumentPanel';
import { MacroPresetExecutionPanel } from '@/components/macro/advanced/MacroPresetExecutionPanel';
import { MacroPresetParameters } from '@/components/macro/advanced/MacroPresetParameters';
import {
  MacroOutputQueue,
  type MacroOutputQueueItem,
} from '@/components/macro/advanced/MacroOutputQueue';

const BUILTIN_RECIPES: MacroRecipe[] = Object.values(BUILTIN_MACROS);
// ─── MacrosSidebar ───────────────────────────────────────────────────────────

export const MacrosSidebar: React.FC = () => {
  const { workingBytes, pageCount, viewState } = useSessionStore(useShallow((state) => ({
    workingBytes: state.workingBytes,
    pageCount: state.pageCount,
    viewState: state.viewState,
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

  const [overridesByRecipe, setOverridesByRecipe] = React.useState<
    Record<string, RecipeOverrides>
  >({});
  const [generationBusy, setGenerationBusy] = React.useState(false);
  const [presetRunnerBusy, setPresetRunnerBusy] = React.useState(false);
  const [expertBusy, setExpertBusy] = React.useState(false);
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
  };

  const saveCurrentPreset = (recipe: MacroRecipe) => {
    savePreset({
      ...recipe,
      name: `${selectedRecipe?.name ?? recipe.name} (Custom)`,
    });
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

  return (
    <div className="p-3 space-y-4">
      <MacroGenerateDocumentPanel
        disabled={presetRunnerBusy || expertBusy}
        onBusyChange={setGenerationBusy}
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
            disabled={generationBusy || presetRunnerBusy || expertBusy || !workingBytes}
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

      <MacroPresetParameters
        recipe={selectedRecipe}
        overrides={overrides}
        pageCount={pageCount}
        disabled={generationBusy || presetRunnerBusy || expertBusy}
        onChange={updateOverrides}
      />

      <MacroPresetExecutionPanel
        recipe={effectiveRecipe}
        disabled={generationBusy || expertBusy}
        onBusyChange={setPresetRunnerBusy}
        onSavePreset={saveCurrentPreset}
        onReset={resetPanel}
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

      <MacroOutputQueue
        outputs={outputQueue}
        onChange={setOutputQueue}
      />

      <MacroExpertWorkspace
        selectedRecipe={selectedRecipe}
        disabled={generationBusy || presetRunnerBusy}
        onBusyChange={setExpertBusy}
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
