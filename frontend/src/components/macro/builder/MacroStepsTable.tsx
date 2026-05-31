import React from 'react';
import type { MacroRecipe, MacroStep } from '../../../core/macro/types';
import type { ValidationResult } from '../../../core/macro/validator';
import { getMacroStepSchemaAtPath, rootStepPath, type MacroStepPath } from '../../../core/macro/builder/recipeBuilderState';

interface MacroStepsTableProps {
  recipe: MacroRecipe;
  selectedPath: MacroStepPath | null;
  validation: ValidationResult;
  onSelect: (path: MacroStepPath) => void;
  onRemove: (path: MacroStepPath) => void;
  onMoveUp: (path: MacroStepPath) => void;
  onMoveDown: (path: MacroStepPath) => void;
}

function summarizeStep(step: MacroStep): string {
  if ('selector' in step && step.selector) {
    const s = step.selector;
    if (s.mode === 'range') return `pages ${s.from}–${s.to}`;
    if (s.mode === 'list') return `pages ${s.pages.join(', ')}`;
    return s.mode;
  }
  if (step.op === 'rotate_pages') return `${step.degrees}°`;
  if (step.op === 'merge_files') return `${step.donorFileIds.length} donor(s)`;
  if (step.op === 'draw_text_on_pages') return `"${step.text}" at ${step.x},${step.y}`;
  if (step.op === 'header_footer_text') return `${step.zone} · ${step.align} · "${step.text}"`;
  if (step.op === 'insert_blank_page') {
    const pos = step.position;
    const posStr = pos.mode === 'before' || pos.mode === 'after' ? `${pos.mode} page ${pos.page}` : pos.mode;
    return `${posStr} · ${typeof step.size === 'string' ? step.size : 'custom'}`;
  }
  if (step.op === 'replace_page') return `page ${step.targetPage} ← donor p${step.donorPage}`;
  if (step.op === 'reorder_pages') return `[${step.order.join(', ')}]`;
  if (step.op === 'conditional') return `then: ${step.then.length} step(s)${step.else ? `, else: ${step.else.length}` : ''}`;
  if (step.op === 'apply_template_vars') return Object.keys(step.vars).join(', ');
  return '—';
}

export function MacroStepsTable({
  recipe,
  selectedPath,
  validation,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
}: MacroStepsTableProps): React.ReactElement {
  if (recipe.steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-slate-400 dark:text-slate-500">
        No steps yet — add operations from the palette.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
            <th className="py-2 px-2 font-semibold text-slate-500 dark:text-slate-400 w-8">#</th>
            <th className="py-2 px-2 font-semibold text-slate-500 dark:text-slate-400">Operation</th>
            <th className="py-2 px-2 font-semibold text-slate-500 dark:text-slate-400">Parameters</th>
            <th className="py-2 px-2 font-semibold text-slate-500 dark:text-slate-400 w-20">Status</th>
            <th className="py-2 px-2 w-24" />
          </tr>
        </thead>
        <tbody>
          {recipe.steps.map((step, index) => {
            const path = rootStepPath(index);
            const schema = getMacroStepSchemaAtPath(recipe, path);
            const errors = validation.errors.filter(
              (e) => e.field.startsWith(`steps.${index}`) || e.stepIndex === index,
            );
            const isSelected = selectedPath?.branch === 'root' && selectedPath.index === index;
            const isFirst = index === 0;
            const isLast = index === recipe.steps.length - 1;

            return (
              <tr
                key={`${step.op}-${index}`}
                onClick={() => onSelect(path)}
                className={[
                  'border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                ].join(' ')}
              >
                <td className="py-2 px-2 text-slate-400 dark:text-slate-500 font-mono">{index + 1}</td>
                <td className="py-2 px-2">
                  <div className="font-medium text-slate-800 dark:text-slate-200">{schema?.label ?? step.op}</div>
                  <div className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">{step.op}</div>
                </td>
                <td className="py-2 px-2 text-slate-600 dark:text-slate-300 font-mono">{summarizeStep(step)}</td>
                <td className="py-2 px-2">
                  {errors.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      Error
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      OK
                    </span>
                  )}
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onMoveUp(path)}
                      disabled={isFirst}
                      className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-[10px] border-none bg-transparent cursor-pointer"
                      title="Move up"
                    >↑</button>
                    <button
                      type="button"
                      onClick={() => onMoveDown(path)}
                      disabled={isLast}
                      className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-[10px] border-none bg-transparent cursor-pointer"
                      title="Move down"
                    >↓</button>
                    <button
                      type="button"
                      onClick={() => onRemove(path)}
                      className="w-5 h-5 flex items-center justify-center rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-[10px] border-none bg-transparent cursor-pointer"
                      title="Remove step"
                    >✕</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
