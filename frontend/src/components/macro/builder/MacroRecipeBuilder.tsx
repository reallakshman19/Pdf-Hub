import React, { useMemo, useState } from 'react';
import type { MacroRecipe, MacroStep } from '../../../core/macro/types';
import {
  addMacroStep,
  createMacroRecipeBuilderState,
  duplicateMacroStep,
  exportBuilderRecipeJson,
  importBuilderRecipeJson,
  moveMacroStep,
  removeMacroStep,
  setRecipeIdentity,
  updateMacroStep,
  type MacroRecipeBuilderState,
  type MacroStepPath,
} from '../../../core/macro/builder/recipeBuilderState';
import {
  getAllMacroOpSchemas,
  type MacroOpCategory,
  type MacroOpSchema,
} from '../../../core/macro/schema/opSchema';
import { upsertCustomMacroRecipe } from '../../../core/macro/recipes/recipeStorage';
import { MacroStepPalette } from './MacroStepPalette';
import { MacroStepList } from './MacroStepList';
import { MacroValidationPanel } from './MacroValidationPanel';
import { MacroRecipeImportExport } from './MacroRecipeImportExport';
import { MacroStepEditor } from './MacroStepEditor';
import { getChildParentPath } from './macroPathUtils';
import { MacroBuilderExecutionPanel } from './MacroBuilderExecutionPanel';

export interface MacroRecipeBuilderProps {
  initialRecipe?: MacroRecipe;
  onChange?: (recipe: MacroRecipe) => void;
  onSave?: (recipe: MacroRecipe) => void;
  onClose?: () => void;
}

export function MacroRecipeBuilder({
  initialRecipe,
  onChange,
  onSave,
  onClose,
}: MacroRecipeBuilderProps): React.ReactElement {
  const [state, setState] = useState<MacroRecipeBuilderState>(() =>
    createMacroRecipeBuilderState(initialRecipe),
  );

  const [exportText, setExportText] = useState('');
  const groupedSchemas = useGroupedSchemas();

  function commit(next: MacroRecipeBuilderState): void {
    setState(next);
    onChange?.(next.recipe);
  }

  function handleIdentityChange(patch: {
    id?: string;
    name?: string;
    dryRun?: boolean;
  }): void {
    commit(setRecipeIdentity(state, patch));
  }

  function handleAddStep(op: MacroStep['op']): void {
    commit(addMacroStep(state, op));
  }

  function handleAddNestedStep(
    conditionalPath: MacroStepPath,
    branch: 'then' | 'else',
    op: MacroStep['op'],
  ): void {
    commit(addMacroStep(state, op, {
      target: {
        parentPath: getChildParentPath(conditionalPath),
        branch,
      },
    }));
  }

  function handleSelect(path: MacroStepPath): void {
    setState({
      ...state,
      selectedPath: path,
    });
  }

  function handleDuplicate(path: MacroStepPath): void {
    commit(duplicateMacroStep(state, path));
  }

  function handleRemove(path: MacroStepPath): void {
    commit(removeMacroStep(state, path));
  }

  function handleMoveUp(path: MacroStepPath): void {
    if (path.index <= 0) return;

    commit(moveMacroStep(state, path, {
      ...path,
      index: path.index - 1,
    }));
  }

  function handleMoveDown(path: MacroStepPath): void {
    const listLength = getStepListLengthForPath(state.recipe.steps, path);

    if (path.index >= listLength - 1) return;

    commit(moveMacroStep(state, path, {
      ...path,
      index: path.index + 1,
    }));
  }

  function handlePatchStep(path: MacroStepPath, patch: Partial<MacroStep>): void {
    commit(updateMacroStep(state, path, patch));
  }

  function handleExport(): void {
    setExportText(exportBuilderRecipeJson(state));
  }

  function handleImport(jsonText: string): void {
    const imported = importBuilderRecipeJson(jsonText);

    setExportText(jsonText);
    commit(imported);
  }

  function handleSave(): void {
    if (!state.validation.valid) return;

    upsertCustomMacroRecipe(state.recipe);
    onSave?.(state.recipe);
  }

  return (
    <section
      data-macro-builder="true"
      className="macro-recipe-builder"
      aria-label="Macro recipe builder"
      style={{
        display: 'grid',
        gridTemplateColumns: '280px minmax(320px, 1fr) 380px',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <aside
        aria-label="Macro operation palette"
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 12,
          background: '#ffffff',
          color: '#111827',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Workflow Builder</h2>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, color: '#4b5563' }}>Workflow Name</span>
          <input
            aria-label="Workflow Name"
            value={state.recipe.name}
            onChange={(event) => handleIdentityChange({ name: event.currentTarget.value })}
            style={inputStyle}
          />
        </label>

        <MacroStepPalette
          groupedSchemas={groupedSchemas}
          onAddStep={handleAddStep}
        />
      </aside>

      <main
        aria-label="Macro step list"
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 12,
          background: '#ffffff',
          color: '#111827',
        }}
      >
        <MacroStepList
          recipe={state.recipe}
          selectedPath={state.selectedPath}
          validation={state.validation}
          onSelect={handleSelect}
          onDuplicate={handleDuplicate}
          onRemove={handleRemove}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />
      </main>

      <aside
        aria-label="Macro recipe actions"
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 12,
          background: '#ffffff',
          color: '#111827',
        }}
      >
        <MacroStepEditor
          recipe={state.recipe}
          selectedPath={state.selectedPath}
          validation={state.validation}
          groupedSchemas={groupedSchemas}
          onPatchStep={handlePatchStep}
          onAddNestedStep={handleAddNestedStep}
          onSelect={handleSelect}
          onDuplicate={handleDuplicate}
          onRemove={handleRemove}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
        />

        <hr style={{ margin: '12px 0', border: 0, borderTop: '1px solid #e5e7eb' }} />

        <MacroValidationPanel validation={state.validation} />

        <MacroBuilderExecutionPanel
          recipe={state.recipe}
          validationValid={state.validation.valid}
        />

        <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleSave} disabled={!state.validation.valid}>
            Save Workflow
          </button>
          {onClose ? (
            <button type="button" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        <details
          style={{
            marginTop: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 8,
          }}
          data-testid="macro-builder-advanced"
        >
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Advanced
          </summary>

          <div style={{ marginTop: 10 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ display: 'block', fontSize: 12, color: '#4b5563' }}>Workflow ID</span>
              <input
                aria-label="Workflow ID"
                value={state.recipe.id}
                onChange={(event) => handleIdentityChange({ id: event.currentTarget.value })}
                style={inputStyle}
              />
            </label>

            <button type="button" onClick={handleExport}>
              View recipe source
            </button>

            <div style={{ marginTop: 8 }}>
              <MacroRecipeImportExport
                exportText={exportText}
                onExportTextChange={setExportText}
                onImport={handleImport}
              />
            </div>
          </div>
        </details>

        {state.lastError ? (
          <p role="alert" style={{ color: '#b91c1c' }}>
            {state.lastError}
          </p>
        ) : null}
      </aside>
    </section>
  );
}

function useGroupedSchemas(): Record<MacroOpCategory, MacroOpSchema[]> {
  return useMemo(() => {
    const grouped: Record<MacroOpCategory, MacroOpSchema[]> = {
      page: [],
      document: [],
      content: [],
      logic: [],
    };

    for (const schema of getAllMacroOpSchemas()) {
      grouped[schema.category].push(schema);
    }

    return grouped;
  }, []);
}

function getStepListLengthForPath(
  rootSteps: MacroStep[],
  path: MacroStepPath,
): number {
  if (path.branch === 'root') {
    return rootSteps.length;
  }

  const parent = resolveStepByParentPath(rootSteps, path.parentPath);

  if (!parent || parent.op !== 'conditional') {
    return 0;
  }

  return path.branch === 'then'
    ? parent.then.length
    : parent.else?.length ?? 0;
}

function resolveStepByParentPath(
  rootSteps: MacroStep[],
  parentPath: Array<number | 'then' | 'else'>,
): MacroStep | null {
  if (parentPath.length === 0) return null;

  let list = rootSteps;
  let current: MacroStep | null = null;

  for (const token of parentPath) {
    if (typeof token === 'number') {
      current = list[token] ?? null;
      continue;
    }

    if (!current || current.op !== 'conditional') {
      return null;
    }

    list = token === 'then'
      ? current.then
      : current.else ?? [];
  }

  return current;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '6px 8px',
};