// @ts-nocheck
import React, { useMemo, useState } from 'react';
import type {
  MacroExecutionContext,
  MacroRecipe,
} from '@/core/macro/types';
import type {
  MacroExecutionResult,
} from '@/core/macro/executor';
import {
  executeMacroRecipe,
} from '@/core/macro/executor';
import {
  validateMacroRecipeWithSchema,
} from '@/core/macro/builder/recipeBuilderState';
import {
  getBuiltInMacroRecipes,
  getRecommendedMacroRecipes,
  type MacroRecipeCatalogCategory,
  type MacroRecipeCatalogItem,
} from '@/core/macro/recipes/builtInRecipes';
import {
  loadCustomMacroRecipes,
} from '@/core/macro/recipes/recipeStorage';

export interface MacroDropdownProps {
  executionContext?: MacroExecutionContext;
  onOpenBuilder: (recipe?: MacroRecipe) => void;
  onRunResult?: (result: MacroExecutionResult) => void;
  onError?: (message: string) => void;
}

export const MacroDropdown: React.FC<MacroDropdownProps> = ({
  executionContext,
  onOpenBuilder,
  onRunResult,
  onError,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | MacroRecipeCatalogCategory | 'custom'>('all');
  const [showRecommendedOnly, setShowRecommendedOnly] = useState(false);
  const [status, setStatus] = useState('');

  const recipes = useMemo(() => {
    const builtIns = showRecommendedOnly ? getRecommendedMacroRecipes() : getBuiltInMacroRecipes();
    const custom = loadCustomMacroRecipes().map((recipe) => ({
      id: `custom-${recipe.id}`,
      name: recipe.name,
      description: 'Custom macro recipe',
      category: 'custom' as const,
      tags: ['custom'],
      recipe,
      requiredOps: recipe.steps.map((step) => step.op),
    }));

    if (showRecommendedOnly) {
      return category === 'custom' ? custom : builtIns;
    }

    return [...builtIns, ...custom];
  }, [category, showRecommendedOnly]);

  const visible = recipes.filter((item) => {
    const q = query.trim().toLowerCase();
    const categoryOk = category === 'all' || item.category === category;

    if (!categoryOk) return false;
    if (!q) return true;

    return [
      item.name,
      item.description,
      item.category,
      ...item.tags,
      ...item.requiredOps,
    ].join(' ').toLowerCase().includes(q);
  });

  const runRecipe = async (recipe: MacroRecipe, dryRun: boolean) => {
    if (!executionContext) {
      const message = 'No macro execution context is available.';
      setStatus(message);
      onError?.(message);
      return;
    }

    const recipeToRun: MacroRecipe = {
      ...recipe,
      dryRun,
    };

    const validation = validateMacroRecipeWithSchema(recipeToRun);

    if (!validation.valid) {
      const message = `Recipe is invalid: ${validation.issues[0]?.message ?? 'unknown issue'}`;
      setStatus(message);
      onError?.(message);
      return;
    }

    setStatus(dryRun ? 'Running dry-run...' : 'Running macro...');

    const result = await executeMacroRecipe(recipeToRun, executionContext);

    setStatus(result.success ? 'Macro completed.' : 'Macro completed with errors.');
    onRunResult?.(result);
  };

  return (
    <div
      className="w-[420px] rounded border border-slate-200 bg-white p-3 text-slate-900 shadow-lg dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
      data-macro-dropdown="true"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Macro Recipes</div>
          <div className="text-xs text-slate-500">
            Run built-in/custom recipes or open the full builder.
          </div>
        </div>

        <button
          type="button"
          className="h-8 rounded bg-blue-600 px-3 text-xs text-white"
          onClick={() => onOpenBuilder()}
        >
          Builder
        </button>
      </div>

      <div className="mb-3 grid gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search macro recipes..."
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          data-macro-builder="true"
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as never)}
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="all">All categories</option>
            <option value="document-control">Document control</option>
            <option value="review">Review</option>
            <option value="stamps">Stamps</option>
            <option value="tables">Tables</option>
            <option value="page-cleanup">Page cleanup</option>
            <option value="authoring">Authoring</option>
            <option value="custom">Custom</option>
          </select>

          <label className="flex items-center gap-2 rounded border border-slate-300 px-2 text-xs dark:border-slate-700">
            <input
              type="checkbox"
              checked={showRecommendedOnly}
              onChange={(event) => setShowRecommendedOnly(event.target.checked)}
            />
            Recommended built-ins
          </label>
        </div>
      </div>

      <div className="max-h-[420px] space-y-2 overflow-auto">
        {visible.map((item) => (
          <MacroDropdownCard
            key={item.id}
            item={item}
            canRun={Boolean(executionContext)}
            onDryRun={() => void runRecipe(item.recipe, true)}
            onRun={() => void runRecipe(item.recipe, false)}
            onEdit={() => onOpenBuilder(cloneRecipeForEdit(item.recipe))}
          />
        ))}

        {visible.length === 0 && (
          <div className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
            No matching macro recipes.
          </div>
        )}
      </div>

      {status && <div className="mt-3 text-xs text-slate-500">{status}</div>}
    </div>
  );
};

function MacroDropdownCard(props: {
  item: MacroRecipeCatalogItem | {
    id: string;
    name: string;
    description: string;
    category: 'custom';
    tags: string[];
    recipe: MacroRecipe;
    requiredOps: string[];
  };
  canRun: boolean;
  onDryRun: () => void;
  onRun: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="rounded border border-slate-200 p-2 dark:border-slate-800">
      <div className="text-sm font-medium">{props.item.name}</div>
      <div className="mt-0.5 text-xs text-slate-500">{props.item.description}</div>

      <div className="mt-2 flex flex-wrap gap-1">
        {props.item.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="rounded bg-slate-100 px-2 py-0.5 text-[10px] dark:bg-slate-800"
          >
            {tag}
          </span>
        ))}
      </div>

      {!props.canRun && (
        <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">
          Execution context unavailable. Click will report this to the host.
        </div>
      )}

      <div className="mt-2 flex gap-1">
        <SmallButton onClick={props.onDryRun}>
          Dry Run
        </SmallButton>
        <SmallButton onClick={props.onRun}>
          Run
        </SmallButton>
        <SmallButton onClick={props.onEdit}>
          Edit
        </SmallButton>
      </div>
    </div>
  );
}

function SmallButton(props: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className="h-7 rounded bg-slate-100 px-2 text-[11px] hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function cloneRecipeForEdit(recipe: MacroRecipe): MacroRecipe {
  return {
    ...JSON.parse(JSON.stringify(recipe)),
    id: `custom-${recipe.id}-${Date.now().toString(36)}`,
    dryRun: true,
  };
}
