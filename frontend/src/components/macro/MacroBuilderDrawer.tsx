import React from 'react';
import { X } from 'lucide-react';
import { MacroRecipeBuilder } from './builder/MacroRecipeBuilder';
import { findBuiltInMacroRecipe, getBuiltInMacroRecipes } from '@/core/macro/recipes/builtInRecipes';
import { loadCustomMacroRecipes } from '@/core/macro/recipes/recipeStorage';
import type { MacroRecipe } from '@/core/macro/types';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';

function cloneRecipe(recipe: MacroRecipe): MacroRecipe {
  return JSON.parse(JSON.stringify(recipe)) as MacroRecipe;
}

export const MacroBuilderDrawer: React.FC = () => {
  const { macroBuilderOpen, setMacroBuilderOpen } = useEditorStore(useShallow((state) => ({
    macroBuilderOpen: state.macroBuilderOpen,
    setMacroBuilderOpen: state.setMacroBuilderOpen,
  })));
  const builtIns = React.useMemo(() => getBuiltInMacroRecipes(), []);
  const [customRecipes, setCustomRecipes] = React.useState<MacroRecipe[]>(() => loadCustomMacroRecipes());
  const [selectedSource, setSelectedSource] = React.useState<string>('new');
  const [activeRecipe, setActiveRecipe] = React.useState<MacroRecipe | undefined>(undefined);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  function handleLoadSelected(value: string): void {
    setSelectedSource(value);
    setSaveMessage(null);
    if (value === 'new') { setActiveRecipe(undefined); return; }
    if (value.startsWith('builtin:')) {
      const id = value.slice('builtin:'.length);
      setActiveRecipe(findBuiltInMacroRecipe(id)?.recipe);
      return;
    }
    if (value.startsWith('custom:')) {
      const id = value.slice('custom:'.length);
      const found = customRecipes.find((r) => r.id === id);
      setActiveRecipe(found ? cloneRecipe(found) : undefined);
    }
  }

  function handleSave(recipe: MacroRecipe): void {
    setCustomRecipes(loadCustomMacroRecipes());
    setSaveMessage(`Saved: ${recipe.name}`);
    setTimeout(() => setSaveMessage(null), 3000);
  }

  if (!macroBuilderOpen) return null;

  return (
    // fixed overlay covering viewport below top bars
    <div
      className="fixed inset-0 z-[200] flex items-stretch"
      style={{ paddingTop: 0 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => setMacroBuilderOpen(false)}
      />

      {/* Drawer panel — right side, full height */}
      <div
        className="relative ml-auto flex flex-col bg-white dark:bg-slate-900 shadow-2xl"
        style={{ width: 'min(92vw, 1100px)', height: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 m-0">Macro Recipe Builder</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Build, validate, import, export, and save macro recipes.</p>
          </div>
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">{saveMessage}</span>
            )}
            {/* Source selector */}
            <select
              value={selectedSource}
              onChange={(e) => handleLoadSelected(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="new">New blank recipe</option>
              <optgroup label="Built-in Recipes">
                {builtIns.map((item) => (
                  <option key={item.id} value={`builtin:${item.id}`}>{item.name}</option>
                ))}
              </optgroup>
              {customRecipes.length > 0 && (
                <optgroup label="Custom Recipes">
                  {customRecipes.map((r) => (
                    <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              onClick={() => setMacroBuilderOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-all border-none bg-transparent cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Builder content — scrollable */}
        <div className="flex-1 overflow-auto p-4">
          <MacroRecipeBuilder
            key={activeRecipe?.id ?? selectedSource}
            initialRecipe={activeRecipe}
            onSave={handleSave}
            onClose={() => setMacroBuilderOpen(false)}
          />
        </div>
      </div>
    </div>
  );
};
