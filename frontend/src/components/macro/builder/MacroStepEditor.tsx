import React from 'react';
import type { MacroRecipe, MacroStep } from '../../../core/macro/types';
import type { ValidationResult } from '../../../core/macro/validator';
import type { MacroOpCategory, MacroOpSchema } from '../../../core/macro/schema/opSchema';
import { getMacroOpPresentation } from '../../../core/macro/schema/presentation';
import {
  getMacroStepAtPath,
  getMacroStepSchemaAtPath,
  getValidationErrorsForPath,
  type MacroStepPath,
} from '../../../core/macro/builder/recipeBuilderState';
import { MacroFieldEditor } from './MacroFieldEditor';
import { MacroNestedBranchEditor } from './MacroNestedBranchEditor';

export interface MacroStepEditorProps {
  recipe: MacroRecipe;
  selectedPath: MacroStepPath | null;
  validation: ValidationResult;
  groupedSchemas: Record<MacroOpCategory, MacroOpSchema[]>;
  onPatchStep: (path: MacroStepPath, patch: Partial<MacroStep>) => void;
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

export function MacroStepEditor({
  recipe,
  selectedPath,
  validation,
  groupedSchemas,
  onPatchStep,
  onAddNestedStep,
  onSelect,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: MacroStepEditorProps): React.ReactElement {
  if (!selectedPath) {
    return (
      <section aria-label="Macro step editor">
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Step Editor</h2>
        <p>Select or add a step to edit fields.</p>
      </section>
    );
  }

  const step = getMacroStepAtPath(recipe, selectedPath);
  const schema = getMacroStepSchemaAtPath(recipe, selectedPath);

  if (!step || !schema) {
    return (
      <section aria-label="Macro step editor">
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Step Editor</h2>
        <p role="alert" style={{ color: 'var(--writer-danger-text, #dc2626)' }}>
          Selected step was not found.
        </p>
      </section>
    );
  }

  const errors = getValidationErrorsForPath(
    {
      recipe,
      selectedPath,
      validation,
      dirty: false,
      lastError: null,
    },
    selectedPath,
  );

  const editableFields = schema.fields.filter((field) => field.kind !== 'macro-steps');
  const presentation = getMacroOpPresentation(schema);

  return (
    <section aria-label="Macro step editor">
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Step Editor</h2>

      <div
        style={{
          border: '1px solid var(--writer-border-strong, #cbd5e1)',
          borderRadius: 8,
          padding: 10,
          marginBottom: 12,
          background: 'var(--writer-surface-subtle, #f8fafc)',
          color: 'var(--writer-text, #0f172a)',
        }}
      >
        <strong>{presentation.label}</strong>
        <p style={{ fontSize: 12, color: 'var(--writer-text-secondary, #334155)' }}>{presentation.description}</p>
      </div>

      {editableFields.map((field) => (
        <MacroFieldEditor
          key={field.name}
          field={field}
          value={(step as unknown as Record<string, unknown>)[field.name]}
          onChange={(value) =>
            onPatchStep(selectedPath, {
              [field.name]: value,
            } as Partial<MacroStep>)
          }
        />
      ))}

      {step.op === 'conditional' ? (
        <MacroNestedBranchEditor
          recipe={recipe}
          conditionalPath={selectedPath}
          conditionalStep={step}
          groupedSchemas={groupedSchemas}
          selectedPath={selectedPath}
          onAddNestedStep={onAddNestedStep}
          onSelect={onSelect}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      ) : null}

      {errors.length > 0 ? (
        <div
          role="alert"
          style={{
            border: '1px solid var(--writer-danger-border, #fca5a5)',
            background: 'var(--writer-danger-bg, #fff1f2)',
            color: 'var(--writer-danger-text, #dc2626)',
            borderRadius: 8,
            padding: 8,
            marginTop: 10,
          }}
        >
          <strong>Step validation</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {errors.map((error) => (
              <li key={`${error.field}-${error.message}`}>
                {error.field}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
