import { describe, expect, it, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MacroRecipeBuilder } from './MacroRecipeBuilder';
import {
  CUSTOM_MACRO_RECIPE_STORAGE_KEY,
} from '../../../core/macro/recipes/recipeStorage';

function openAdvanced(): void {
  fireEvent.click(screen.getByText('Advanced'));
}

function viewRecipeSource(): void {
  openAdvanced();
  fireEvent.click(screen.getByRole('button', { name: 'View recipe source' }));
}

describe('MacroRecipeBuilder slice 8', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders builder shell with identity fields and validation', () => {
    render(<MacroRecipeBuilder />);

    expect(screen.getByRole('region', { name: 'Workflow builder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow Name')).toBeInTheDocument();
    expect((screen.getByTestId('macro-builder-advanced') as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText(/Recipe must contain at least one step/)).toBeInTheDocument();
    expect(screen.getByTestId('macro-builder-execution')).toBeInTheDocument();
  });

  it('adds a step from the palette', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Rotate Pages' }));

    expect(screen.getByText('1. Rotate Pages')).toBeInTheDocument();
    expect(screen.queryByText('rotate_pages')).toBeNull();
    expect(screen.getByText('Recipe is valid.')).toBeInTheDocument();
  });

  it('duplicates and removes a step', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(screen.getAllByText(/Select Pages/).length).toBeGreaterThan(1);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(screen.getAllByText(/Select Pages/).length).toBeGreaterThan(0);
  });

  it('moves root steps up and down', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Rotate Pages' }));

    const list = screen.getByRole('main', { name: 'Macro step list' });
    expect(within(list).getAllByText(/Select Pages|Rotate Pages/).map((node) => node.textContent)).toEqual([
      '1. Select Pages',
      '2. Rotate Pages',
    ]);

    fireEvent.click(screen.getAllByRole('button', { name: '↑' })[1]);

    expect(within(list).getAllByText(/Select Pages|Rotate Pages/).map((node) => node.textContent)).toEqual([
      '1. Rotate Pages',
      '2. Select Pages',
    ]);
  });

  it('exports recipe JSON', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.change(screen.getByLabelText('Workflow Name'), {
      target: { value: 'Export Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    openAdvanced();
    fireEvent.change(screen.getByLabelText('Workflow ID'), {
      target: { value: 'export-me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'View recipe source' }));

    expect((screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value).toContain('"id": "export-me"');
    expect((screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value).toContain('"op": "select_pages"');
  });

  it('imports valid recipe JSON', () => {
    render(<MacroRecipeBuilder />);

    const json = JSON.stringify({
      id: 'imported',
      name: 'Imported',
      steps: [
        {
          op: 'select_pages',
          selector: {
            mode: 'all',
          },
        },
      ],
    });

    openAdvanced();
    fireEvent.change(screen.getByLabelText('Macro JSON'), {
      target: { value: json },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import JSON' }));

    expect(screen.getByLabelText('Workflow ID')).toHaveValue('imported');
    expect(screen.getByLabelText('Workflow Name')).toHaveValue('Imported');
    expect(screen.getByText('1. Select Pages')).toBeInTheDocument();
  });

  it('shows validation error for invalid imported JSON', () => {
    render(<MacroRecipeBuilder />);
    openAdvanced();

    fireEvent.change(screen.getByLabelText('Macro JSON'), {
      target: { value: '{bad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import JSON' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid macro recipe JSON/);
  });

  it('saves valid recipe to custom storage and calls onSave', () => {
    const saved: unknown[] = [];

    render(
      <MacroRecipeBuilder
        onSave={(recipe) => saved.push(recipe)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Workflow' }));

    expect(saved).toHaveLength(1);
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toContain('Untitled Macro');
  });

  it('does not save invalid recipe', () => {
    render(<MacroRecipeBuilder />);

    expect(screen.getByRole('button', { name: 'Save Workflow' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Workflow' }));

    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toBeNull();
  });

  it('marks root with data-macro-builder for writer paste isolation', () => {
    render(<MacroRecipeBuilder />);

    expect(screen.getByRole('region', { name: 'Workflow builder' })).toHaveAttribute(
      'data-macro-builder',
      'true',
    );
  });
});
