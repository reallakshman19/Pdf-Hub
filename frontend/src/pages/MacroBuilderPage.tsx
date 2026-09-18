import React from 'react';
import { Link } from 'react-router-dom';
import { MacroRecipeBuilder } from '@/components/macro/builder/MacroRecipeBuilder';
import {
  findBuiltInMacroRecipe,
  getBuiltInMacroRecipes,
} from '@/core/macro/recipes/builtInRecipes';
import {
  loadCustomMacroRecipes,
} from '@/core/macro/recipes/recipeStorage';
import type { MacroRecipe } from '@/core/macro/types';

export const MacroBuilderPage: React.FC = () => {
  const builtIns = React.useMemo(() => getBuiltInMacroRecipes(), []);
  const [customRecipes, setCustomRecipes] = React.useState<MacroRecipe[]>(() =>
    loadCustomMacroRecipes(),
  );

  const [selectedSource, setSelectedSource] = React.useState<string>('new');
  const [activeRecipe, setActiveRecipe] = React.useState<MacroRecipe | undefined>(undefined);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  function handleLoadSelected(value: string): void {
    setSelectedSource(value);
    setSaveMessage(null);

    if (value === 'new') {
      setActiveRecipe(undefined);
      return;
    }

    if (value.startsWith('builtin:')) {
      const id = value.slice('builtin:'.length);
      const item = findBuiltInMacroRecipe(id);

      setActiveRecipe(item?.recipe);
      return;
    }

    if (value.startsWith('custom:')) {
      const id = value.slice('custom:'.length);
      const found = customRecipes.find((recipe) => recipe.id === id);

      setActiveRecipe(found ? cloneRecipe(found) : undefined);
    }
  }

  function handleSave(recipe: MacroRecipe): void {
    setCustomRecipes(loadCustomMacroRecipes());
    setSaveMessage(`Saved workflow: ${recipe.name}`);
  }

  return (
    <main
      data-macro-builder-page="true"
      aria-label="Workflow builder page"
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'center',
          padding: '12px 16px',
          background: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Workflow Builder</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
            Build, test, save, and run reusable document workflows.
          </p>
        </div>

        <Link
          to="/"
          aria-label="Back to workspace"
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 8,
            padding: '8px 10px',
            background: '#ffffff',
            color: '#0f172a',
            textDecoration: 'none',
          }}
        >
          Back to Workspace
        </Link>
      </header>

      <section
        aria-label="Workflow builder source selector"
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '12px 16px',
          background: '#f1f5f9',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <label htmlFor="macro-builder-source" style={{ fontSize: 13, fontWeight: 600 }}>
          Start from
        </label>

        <select
          id="macro-builder-source"
          aria-label="Workflow builder source"
          value={selectedSource}
          onChange={(event) => handleLoadSelected(event.currentTarget.value)}
          style={{
            minWidth: 260,
            border: '1px solid #d1d5db',
            borderRadius: 8,
            padding: '8px 10px',
            background: '#ffffff',
          }}
        >
          <option value="new">New workflow</option>

          <optgroup label="Templates">
            {builtIns.map((item) => (
              <option key={item.id} value={`builtin:${item.id}`}>
                {item.name}
              </option>
            ))}
          </optgroup>

          {customRecipes.length > 0 ? (
            <optgroup label="My Workflows">
              {customRecipes.map((recipe) => (
                <option key={recipe.id} value={`custom:${recipe.id}`}>
                  {recipe.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>

        {saveMessage ? (
          <span role="status" style={{ color: '#166534', fontSize: 13 }}>
            {saveMessage}
          </span>
        ) : null}
      </section>

      <div style={{ padding: 16 }}>
        <MacroRecipeBuilder
          key={activeRecipe?.id ?? selectedSource}
          initialRecipe={activeRecipe}
          onSave={handleSave}
        />
      </div>
    </main>
  );
};

function cloneRecipe(recipe: MacroRecipe): MacroRecipe {
  return JSON.parse(JSON.stringify(recipe)) as MacroRecipe;
}