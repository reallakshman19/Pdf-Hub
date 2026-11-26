import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import { MacroRecipeBuilder } from './builder/MacroRecipeBuilder';
import { findBuiltInMacroRecipe, getBuiltInMacroRecipes } from '@/core/macro/recipes/builtInRecipes';
import {
  loadCustomMacroRecipes,
  subscribeCustomMacroRecipeChanges,
} from '@/core/macro/recipes/recipeStorage';
import type { MacroRecipe } from '@/core/macro/types';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';

function cloneRecipe(recipe: MacroRecipe): MacroRecipe {
  return JSON.parse(JSON.stringify(recipe)) as MacroRecipe;
}

export const MacroBuilderDrawer: React.FC = () => {
  const {
    macroBuilderOpen,
    macroBuilderSource,
    setMacroBuilderOpen,
    setMacroBuilderSource,
  } = useEditorStore(useShallow((state) => ({
    macroBuilderOpen: state.macroBuilderOpen,
    macroBuilderSource: state.macroBuilderSource,
    setMacroBuilderOpen: state.setMacroBuilderOpen,
    setMacroBuilderSource: state.setMacroBuilderSource,
  })));
  const builtIns = React.useMemo(() => getBuiltInMacroRecipes(), []);
  const [customRecipes, setCustomRecipes] = React.useState<MacroRecipe[]>(() => loadCustomMacroRecipes());
  const [selectedSource, setSelectedSource] = React.useState<string>(macroBuilderSource ?? 'new');
  const [activeRecipe, setActiveRecipe] = React.useState<MacroRecipe | undefined>(undefined);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  const loadSelected = React.useCallback((value: string): void => {
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
  }, [customRecipes]);

  React.useEffect(
    () => subscribeCustomMacroRecipeChanges(setCustomRecipes),
    [],
  );

  const [prevDrawerSync, setPrevDrawerSync] = React.useState<{ open: boolean; source: string | null }>({
    open: macroBuilderOpen,
    source: macroBuilderSource,
  });
  if (
    macroBuilderOpen &&
    (!prevDrawerSync.open || macroBuilderSource !== prevDrawerSync.source)
  ) {
    setPrevDrawerSync({ open: macroBuilderOpen, source: macroBuilderSource });
    const nextValue = macroBuilderSource ?? 'new';
    setSelectedSource(nextValue);
    setSaveMessage(null);
    if (nextValue === 'new') {
      setActiveRecipe(undefined);
    } else if (nextValue.startsWith('builtin:')) {
      setActiveRecipe(findBuiltInMacroRecipe(nextValue.slice('builtin:'.length))?.recipe);
    } else if (nextValue.startsWith('custom:')) {
      const found = customRecipes.find((r) => r.id === nextValue.slice('custom:'.length));
      setActiveRecipe(found ? cloneRecipe(found) : undefined);
    }
  } else if (!macroBuilderOpen && prevDrawerSync.open) {
    setPrevDrawerSync({ open: false, source: macroBuilderSource });
  }

  function handleLoadSelected(value: string): void {
    setMacroBuilderSource(value);
    loadSelected(value);
  }

  const closeBuilder = React.useCallback((): void => {
    setMacroBuilderOpen(false);
    setMacroBuilderSource(null);
  }, [setMacroBuilderOpen, setMacroBuilderSource]);

  const saveTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (!macroBuilderOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeBuilder();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [macroBuilderOpen, closeBuilder]);

  function handleSave(recipe: MacroRecipe): void {
    setCustomRecipes(loadCustomMacroRecipes());
    setSaveMessage(`Saved: ${recipe.name}`);
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      setSaveMessage(null);
      saveTimerRef.current = null;
    }, 3000);
  }

  if (!macroBuilderOpen) return null;

  return (
    // fixed overlay covering viewport below top bars
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workflow Builder"
      className="fixed inset-0 z-[200] flex items-stretch"
      style={{ paddingTop: 0 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => closeBuilder()}
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
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 m-0">Workflow Builder</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Build, test, save, and run reusable document workflows.</p>
          </div>
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">{saveMessage}</span>
            )}
            {/* Source selector */}
            <select
              aria-label="Workflow source selector"
              value={selectedSource}
              onChange={(e) => handleLoadSelected(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="new">New workflow</option>
              <optgroup label="Templates">
                {builtIns.map((item) => (
                  <option key={item.id} value={`builtin:${item.id}`}>{item.name}</option>
                ))}
              </optgroup>
              {customRecipes.length > 0 && (
                <optgroup label="My Workflows">
                  {customRecipes.map((r) => (
                    <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <a
              href="#/macro-builder"
              onClick={() => closeBuilder()}
              aria-label="Open Workflow Builder full page"
              title="Open full-page Workflow Builder"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 no-underline transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Full Page</span>
            </a>
            <button
              type="button"
              aria-label="Close Workflow Builder"
              onClick={() => closeBuilder()}
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
            onClose={closeBuilder}
          />
        </div>
      </div>
    </div>
  );
};
