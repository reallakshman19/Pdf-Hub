import React from 'react';
import type { MacroRecipe, MacroStep } from '../../../core/macro/types';
import type { ValidationResult } from '../../../core/macro/validator';
import {
  getMacroStepSchemaAtPath,
  rootStepPath,
  type MacroStepPath,
} from '../../../core/macro/builder/recipeBuilderState';

export interface MacroStepListProps {
  recipe: MacroRecipe;
  selectedPath: MacroStepPath | null;
  validation: ValidationResult;
  onSelect: (path: MacroStepPath) => void;
  onDuplicate: (path: MacroStepPath) => void;
  onRemove: (path: MacroStepPath) => void;
  onMoveUp: (path: MacroStepPath) => void;
  onMoveDown: (path: MacroStepPath) => void;
}

export function MacroStepList({
  recipe,
  selectedPath,
  validation,
  onSelect,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: MacroStepListProps): React.ReactElement {
  if (recipe.steps.length === 0) {
    return (
      <div>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Steps</h2>
        <p>No macro steps added.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Steps</h2>

      <ol style={{ paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {recipe.steps.map((step, index) => {
          const path = rootStepPath(index);
          const selected = isSamePath(selectedPath, path);
          const schema = getMacroStepSchemaAtPath(recipe, path);
          const errors = validation.errors.filter((error) =>
            error.field.startsWith(`steps.${index}`) ||
            error.stepIndex === index,
          );

          return (
            <li
              key={`${step.op}-${index}`}
              style={{
                border: selected ? '2px solid #2563eb' : '1px solid #d1d5db',
                borderRadius: 8,
                padding: 10,
                background: selected ? '#eff6ff' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onSelect(path)}
                  aria-label={`Select step ${index + 1}`}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  <strong>
                    {index + 1}. {schema?.label ?? step.op}
                  </strong>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{step.op}</div>
                  <StepSummary step={step} />
                </button>

                <div style={{ display: 'flex', gap: 4, alignItems: 'start' }}>
                  <button type="button" onClick={() => onMoveUp(path)} disabled={index === 0}>
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveDown(path)}
                    disabled={index === recipe.steps.length - 1}
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => onDuplicate(path)}>
                    Copy
                  </button>
                  <button type="button" onClick={() => onRemove(path)}>
                    Remove
                  </button>
                </div>
              </div>

              {errors.length > 0 ? (
                <ul style={{ margin: '8px 0 0', color: '#b91c1c' }}>
                  {errors.map((error) => (
                    <li key={`${error.field}-${error.message}`}>
                      {error.field}: {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {step.op === 'conditional' ? (
                <NestedConditionalSummary step={step} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepSummary({ step }: { step: MacroStep }): React.ReactElement {
  if ('selector' in step && step.selector) {
    return (
      <div style={{ fontSize: 12, color: '#374151' }}>
        selector: {step.selector.mode}
      </div>
    );
  }

  if (step.op === 'merge_files') {
    return (
      <div style={{ fontSize: 12, color: '#374151' }}>
        donors: {step.donorFileIds.join(', ')}
      </div>
    );
  }

  if (step.op === 'apply_template_vars') {
    return (
      <div style={{ fontSize: 12, color: '#374151' }}>
        vars: {Object.keys(step.vars).join(', ')}
      </div>
    );
  }

  return (
    <div style={{ fontSize: 12, color: '#374151' }}>
      configured
    </div>
  );
}

function NestedConditionalSummary({
  step,
}: {
  step: Extract<MacroStep, { op: 'conditional' }>;
}): React.ReactElement {
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
      then: {step.then.length} step(s)
      {step.else ? `, else: ${step.else.length} step(s)` : ''}
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