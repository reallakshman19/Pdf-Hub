import type {
  MacroRecipe,
} from '../types';

export type MacroPanelMode =
  | 'closed'
  | 'dropdown'
  | 'builder'
  | 'run-result';

export interface MacroUiState {
  mode: MacroPanelMode;
  selectedRecipeId: string | null;
  editingRecipe: MacroRecipe | null;
  lastError: string | null;
  lastRunAt: number | null;
}

export type MacroUiAction =
  | { type: 'open_dropdown' }
  | { type: 'open_builder'; recipe?: MacroRecipe | null }
  | { type: 'open_run_result' }
  | { type: 'close' }
  | { type: 'select_recipe'; recipeId: string | null }
  | { type: 'set_editing_recipe'; recipe: MacroRecipe | null }
  | { type: 'set_error'; error: string | null }
  | { type: 'mark_run' };

export const initialMacroUiState: MacroUiState = {
  mode: 'closed',
  selectedRecipeId: null,
  editingRecipe: null,
  lastError: null,
  lastRunAt: null,
};

export function macroUiReducer(
  state: MacroUiState,
  action: MacroUiAction,
): MacroUiState {
  if (action.type === 'open_dropdown') {
    return {
      ...state,
      mode: 'dropdown',
      lastError: null,
    };
  }

  if (action.type === 'open_builder') {
    return {
      ...state,
      mode: 'builder',
      editingRecipe: action.recipe ?? state.editingRecipe,
      lastError: null,
    };
  }

  if (action.type === 'open_run_result') {
    return {
      ...state,
      mode: 'run-result',
    };
  }

  if (action.type === 'close') {
    return {
      ...state,
      mode: 'closed',
    };
  }

  if (action.type === 'select_recipe') {
    return {
      ...state,
      selectedRecipeId: action.recipeId,
    };
  }

  if (action.type === 'set_editing_recipe') {
    return {
      ...state,
      editingRecipe: action.recipe,
    };
  }

  if (action.type === 'set_error') {
    return {
      ...state,
      lastError: action.error,
    };
  }

  if (action.type === 'mark_run') {
    return {
      ...state,
      lastRunAt: Date.now(),
      lastError: null,
    };
  }

  return state;
}
