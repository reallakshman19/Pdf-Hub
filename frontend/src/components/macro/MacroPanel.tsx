// @ts-nocheck
import React, { useReducer, useState } from 'react';
import type {
  MacroExecutionContext,
  MacroRecipe,
} from '@/core/macro/types';
import type {
  MacroExecutionResult,
} from '@/core/macro/executor';
import {
  initialMacroUiState,
  macroUiReducer,
} from '@/core/macro/integration/macroUiStore';
import { MacroDropdown } from './MacroDropdown';
import { MacroRecipeBuilder } from './builder/MacroRecipeBuilder';
import { MacroRunResultPanel } from './builder/MacroRunResultPanel';

export interface MacroPanelProps {
  executionContext?: MacroExecutionContext;
  onRunResult?: (result: MacroExecutionResult) => void;
  onCommitBytes?: (bytes: Uint8Array, result: MacroExecutionResult) => void;
  onClose?: () => void;
}

export const MacroPanel: React.FC<MacroPanelProps> = ({
  executionContext,
  onRunResult,
  onCommitBytes,
  onClose,
}) => {
  const [state, dispatch] = useReducer(macroUiReducer, initialMacroUiState);
  const [lastResult, setLastResult] = useState<MacroExecutionResult | null>(null);

  const handleRunResult = (result: MacroExecutionResult) => {
    setLastResult(result);
    dispatch({ type: 'mark_run' });
    dispatch({ type: 'open_run_result' });

    const isDryRun = isMacroDryRunResult(result);

    if (result.success && !isDryRun) {
      onCommitBytes?.(result.finalBytes, result);
    }

    onRunResult?.(result);
  };

  const openBuilder = (recipe?: MacroRecipe) => {
    dispatch({
      type: 'open_builder',
      recipe: recipe ?? null,
    });
  };

  return (
    <div
      className="rounded border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
      data-macro-panel="true"
    >
      <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-800">
        <div>
          <div className="text-sm font-semibold">Macro Tools</div>
          <div className="text-xs text-slate-500">
            Dropdown, builder, dry-run, execution result and certification-ready flow.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="h-8 rounded bg-slate-100 px-3 text-xs hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            onClick={() => dispatch({ type: 'open_dropdown' })}
          >
            Dropdown
          </button>
          <button
            type="button"
            className="h-8 rounded bg-blue-600 px-3 text-xs text-white"
            onClick={() => openBuilder()}
          >
            Builder
          </button>
          {onClose && (
            <button
              type="button"
              className="h-8 rounded bg-slate-100 px-3 text-xs hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="p-3">
        {state.mode === 'closed' && (
          <div className="rounded border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
            Open the macro dropdown or builder to start.
          </div>
        )}

        {state.mode === 'dropdown' && (
          <MacroDropdown
            executionContext={executionContext}
            onOpenBuilder={openBuilder}
            onRunResult={handleRunResult}
            onError={(message) => dispatch({ type: 'set_error', error: message })}
          />
        )}

        {state.mode === 'builder' && (
          <MacroRecipeBuilder
            initialRecipe={state.editingRecipe ?? undefined}
            executionContext={executionContext}
            onRunResult={handleRunResult}
            onRecipeChange={(recipe) => dispatch({ type: 'set_editing_recipe', recipe })}
            onClose={() => dispatch({ type: 'open_dropdown' })}
          />
        )}

        {state.mode === 'run-result' && (
          <div className="max-w-xl">
            <MacroRunResultPanel result={lastResult} />
          </div>
        )}

        {state.lastError && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {state.lastError}
          </div>
        )}
      </div>
    </div>
  );
};

function isMacroDryRunResult(result: MacroExecutionResult): boolean {
  return Boolean(
    result &&
      typeof result === 'object' &&
      'dryRunDiff' in result
  );
}
