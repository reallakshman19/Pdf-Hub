import React from 'react';
import type { MacroRecipe, MacroStep } from '../../../core/macro/types';
import type { ValidationResult } from '../../../core/macro/validator';
import type { MacroOpCategory, MacroOpSchema } from '../../../core/macro/schema/opSchema';
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
        <p role="alert" style={{ color: '#b91c1c' }}>
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

  return (
    <section aria-label="Macro step editor">
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Step Editor</h2>

      <div
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 8,
          padding: 10,
          marginBottom: 12,
          background: '#ffffff',
        }}
      >
        <strong>{schema.label}</strong>
        <div
          aria-label="Selected step operation"
          style={{ fontSize: 12, color: '#6b7280' }}
        >
          Operation: {step.op}
        </div>
        <p style={{ fontSize: 12, color: '#374151' }}>{schema.description}</p>
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
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
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