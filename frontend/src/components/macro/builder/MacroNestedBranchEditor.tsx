import React from 'react';
import type { MacroStep } from '../../../core/macro/types';
import {
  getMacroStepSchemaAtPath,
  type MacroStepPath,
} from '../../../core/macro/builder/recipeBuilderState';
import type { MacroRecipe } from '../../../core/macro/types';
import type { MacroOpCategory, MacroOpSchema } from '../../../core/macro/schema/opSchema';
import { getMacroOpPresentation } from '../../../core/macro/schema/presentation';
import { getChildParentPath } from './macroPathUtils';

export interface MacroNestedBranchEditorProps {
  recipe: MacroRecipe;
  conditionalPath: MacroStepPath;
  conditionalStep: Extract<MacroStep, { op: 'conditional' }>;
  groupedSchemas: Record<MacroOpCategory, MacroOpSchema[]>;
  selectedPath: MacroStepPath | null;
  onAddNestedStep: (
    conditionalPath: MacroStepPath,
    branch: 'then' | 'else',
    op: MacroStep['op'],
  ) => void;
  onSelect: (path: MacroStepPath) => void;
  onDuplicate: (path: MacroStepPath) => void;
  onRemove: (path: MacroStepPath) => void;
  onMoveUp: (path: MacroStepPath) => void;
  onMoveDown: (path: MacroStepPath) => void;
}

export function MacroNestedBranchEditor({
  recipe,
  conditionalPath,
  conditionalStep,
  groupedSchemas,
  selectedPath,
  onAddNestedStep,
  onSelect,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: MacroNestedBranchEditorProps): React.ReactElement {
  return (
    <section
      aria-label="Conditional branch editor"
      style={{
        border: '1px solid var(--writer-accent-border, #93c5fd)',
        background: 'var(--writer-accent-bg, #eff6ff)',
        color: 'var(--writer-text, #0f172a)',
        borderRadius: 8,
        padding: 10,
        marginTop: 12,
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Conditional Branches</h3>

      <BranchPanel
        title="Then"
        branch="then"
        recipe={recipe}
        conditionalPath={conditionalPath}
        steps={conditionalStep.then}
        groupedSchemas={groupedSchemas}
        selectedPath={selectedPath}
        onAddNestedStep={onAddNestedStep}
        onSelect={onSelect}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />

      <BranchPanel
        title="Else"
        branch="else"
        recipe={recipe}
        conditionalPath={conditionalPath}
        steps={conditionalStep.else ?? []}
        groupedSchemas={groupedSchemas}
        selectedPath={selectedPath}
        onAddNestedStep={onAddNestedStep}
        onSelect={onSelect}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    </section>
  );
}

function BranchPanel({
  title,
  branch,
  recipe,
  conditionalPath,
  steps,
  groupedSchemas,
  selectedPath,
  onAddNestedStep,
  onSelect,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  title: string;
  branch: 'then' | 'else';
  recipe: MacroRecipe;
  conditionalPath: MacroStepPath;
  steps: MacroStep[];
  groupedSchemas: Record<MacroOpCategory, MacroOpSchema[]>;
  selectedPath: MacroStepPath | null;
  onAddNestedStep: (
    conditionalPath: MacroStepPath,
    branch: 'then' | 'else',
    op: MacroStep['op'],
  ) => void;
  onSelect: (path: MacroStepPath) => void;
  onDuplicate: (path: MacroStepPath) => void;
  onRemove: (path: MacroStepPath) => void;
  onMoveUp: (path: MacroStepPath) => void;
  onMoveDown: (path: MacroStepPath) => void;
}): React.ReactElement {
  const parentPath = getChildParentPath(conditionalPath);

  return (
    <div
      aria-label={`${title} branch`}
      style={{
        border: '1px solid var(--writer-accent-border, #93c5fd)',
        borderRadius: 8,
        background: 'var(--writer-surface, #ffffff)',
        color: 'var(--writer-text, #0f172a)',
        padding: 8,
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{title}</strong>
        <select
          aria-label={`Add ${title} Branch Step`}
          defaultValue=""
          onChange={(event) => {
            const op = event.currentTarget.value as MacroStep['op'];
            if (!op) return;
            onAddNestedStep(conditionalPath, branch, op);
            event.currentTarget.value = '';
          }}
          style={{
            border: '1px solid var(--writer-border-strong, #cbd5e1)',
            background: 'var(--writer-surface-subtle, #f8fafc)',
            color: 'var(--writer-text, #0f172a)',
            borderRadius: 6,
            padding: '4px 6px',
          }}
        >
          <option value="">Add nested step...</option>
          {Object.entries(groupedSchemas).map(([category, schemas]) => (
            <optgroup key={category} label={category}>
              {schemas.map((schema) => (
                <option key={schema.op} value={schema.op}>
                  {getMacroOpPresentation(schema).label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {steps.length === 0 ? (
        <p style={{ color: 'var(--writer-text-muted, #64748b)', fontSize: 12 }}>No nested steps.</p>
      ) : (
        <ol style={{ listStyle: 'none', paddingLeft: 0, display: 'grid', gap: 6 }}>
          {steps.map((step, index) => {
            const path: MacroStepPath = {
              parentPath,
              branch,
              index,
            };
            const schema = getMacroStepSchemaAtPath(recipe, path);
            const presentation = schema ? getMacroOpPresentation(schema) : null;
            const selected = isSamePath(selectedPath, path);

            return (
              <li
                key={`${branch}-${index}-${step.op}`}
                style={{
                  border: selected
                    ? '2px solid var(--writer-accent-border, #2563eb)'
                    : '1px solid var(--writer-border, #e2e8f0)',
                  borderRadius: 6,
                  padding: 8,
                  background: selected
                    ? 'var(--writer-accent-bg, #eff6ff)'
                    : 'var(--writer-surface-subtle, #f8fafc)',
                  color: 'var(--writer-text, #0f172a)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <button
                    type="button"
                    aria-label={`Select ${title} step ${index + 1}`}
                    onClick={() => onSelect(path)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: 'inherit',
                      padding: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
                      flex: 1,
                    }}
                  >
                    <strong>
                      {index + 1}. {presentation?.label ?? 'Workflow step'}
                    </strong>
                  </button>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="macro-builder-btn" onClick={() => onMoveUp(path)} disabled={index === 0}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="macro-builder-btn"
                      onClick={() => onMoveDown(path)}
                      disabled={index === steps.length - 1}
                    >
                      ↓
                    </button>
                    <button type="button" className="macro-builder-btn" onClick={() => onDuplicate(path)}>
                      Copy
                    </button>
                    <button type="button" className="macro-builder-btn" onClick={() => onRemove(path)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function isSamePath(
  a: MacroStepPath | null,
  b: MacroStepPath,
): boolean {
  if (!a) return false;

  return (
    a.branch === b.branch &&
    a.index === b.index &&
    a.parentPath.length === b.parentPath.length &&
    a.parentPath.every((value, index) => value === b.parentPath[index])
  );
}
