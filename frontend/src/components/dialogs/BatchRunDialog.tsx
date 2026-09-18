import React, { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  getBuiltInMacroRecipes,
  isRunnerSafeBuiltInRecipe,
} from '@/core/macro/recipes/builtInRecipes';
import type { MacroRecipe } from '@/core/macro/types';

interface Props {
  isOpen: boolean;
  disabled?: boolean;
  onClose: () => void;
  onConfirm: (recipe: MacroRecipe) => void;
}

export const BatchRunDialog: React.FC<Props> = ({
  isOpen,
  disabled = false,
  onClose,
  onConfirm,
}) => {
  const recipes = useMemo(
    () =>
      getBuiltInMacroRecipes()
        .filter(isRunnerSafeBuiltInRecipe)
        .map((item) => item.recipe),
    [],
  );
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? '');

  const selectedRecipe =
    recipes.find((recipe) => recipe.id === recipeId)
    ?? recipes[0]
    ?? null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRecipe || disabled) return;
    onConfirm(selectedRecipe);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Batch Process PDFs">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Workflow
          </label>
          <select
            aria-label="Batch workflow"
            value={selectedRecipe?.id ?? ''}
            onChange={(event) => setRecipeId(event.target.value)}
            disabled={disabled || recipes.length === 0}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          The selected workflow runs independently against each PDF you choose.
          Donor-file workflows are excluded from batch processing.
        </p>

        <div className="mt-4 flex justify-end space-x-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={disabled}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={disabled || !selectedRecipe}
          >
            Choose PDFs & Run
          </Button>
        </div>
      </form>
    </Modal>
  );
};
