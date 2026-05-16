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

describe('MacroRecipeBuilder slice 8', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders builder shell with identity fields and validation', () => {
    render(<MacroRecipeBuilder />);

    expect(screen.getByRole('region', { name: 'Macro recipe builder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Recipe ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Recipe Name')).toBeInTheDocument();
    expect(screen.getByText(/Recipe must contain at least one step/)).toBeInTheDocument();
  });

  it('adds a step from the palette', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Rotate Pages' }));

    expect(screen.getByText('1. Rotate Pages')).toBeInTheDocument();
    expect(screen.getAllByText('rotate_pages')[0]).toBeInTheDocument();
    expect(screen.getByText('Recipe is valid.')).toBeInTheDocument();
  });

  it('duplicates and removes a step', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(screen.getAllByText('select_pages').length).toBeGreaterThan(1);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(screen.getAllByText('select_pages').length).toBeGreaterThan(0);
  });

  it('moves root steps up and down', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Rotate Pages' }));

    const list = screen.getByRole('main', { name: 'Macro step list' });
    expect(within(list).getAllByText(/select_pages|rotate_pages/).map((node) => node.textContent)).toEqual([
      'select_pages',
      'rotate_pages',
    ]);

    fireEvent.click(screen.getAllByRole('button', { name: '↑' })[1]);

    expect(within(list).getAllByText(/select_pages|rotate_pages/).map((node) => node.textContent)).toEqual([
      'rotate_pages',
      'select_pages',
    ]);
  });

  it('exports recipe JSON', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.change(screen.getByLabelText('Recipe ID'), {
      target: { value: 'export-me' },
    });
    fireEvent.change(screen.getByLabelText('Recipe Name'), {
      target: { value: 'Export Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

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

    fireEvent.change(screen.getByLabelText('Macro JSON'), {
      target: { value: json },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import JSON' }));

    expect(screen.getByLabelText('Recipe ID')).toHaveValue('imported');
    expect(screen.getByLabelText('Recipe Name')).toHaveValue('Imported');
    expect(screen.getByText('1. Select Pages')).toBeInTheDocument();
  });

  it('shows validation error for invalid imported JSON', () => {
    render(<MacroRecipeBuilder />);

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
    fireEvent.click(screen.getByRole('button', { name: 'Save Custom' }));

    expect(saved).toHaveLength(1);
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toContain('Untitled Macro');
  });

  it('does not save invalid recipe', () => {
    render(<MacroRecipeBuilder />);

    expect(screen.getByRole('button', { name: 'Save Custom' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Custom' }));

    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toBeNull();
  });

  it('marks root with data-macro-builder for writer paste isolation', () => {
    render(<MacroRecipeBuilder />);

    expect(screen.getByRole('region', { name: 'Macro recipe builder' })).toHaveAttribute(
      'data-macro-builder',
      'true',
    );
  });
});
