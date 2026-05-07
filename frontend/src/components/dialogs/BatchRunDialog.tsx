import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { BUILTIN_MACROS } from '@/core/macro/builtins';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (recipeId: string) => void;
}

export const BatchRunDialog: React.FC<Props> = ({ isOpen, onClose, onConfirm }) => {
  const [recipeId, setRecipeId] = useState(Object.keys(BUILTIN_MACROS)[0] || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (recipeId) {
      onConfirm(recipeId);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Batch Run Recipe">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Select Recipe</label>
          <select
            value={recipeId}
            onChange={e => setRecipeId(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          >
            {Object.values(BUILTIN_MACROS).map(recipe => (
              <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end space-x-2 mt-4">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!recipeId}>Run Batch</Button>
        </div>
      </form>
    </Modal>
  );
};
