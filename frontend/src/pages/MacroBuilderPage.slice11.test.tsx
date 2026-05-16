import { describe, expect, it, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MacroBuilderPage } from './MacroBuilderPage';
import {
  CUSTOM_MACRO_RECIPE_STORAGE_KEY,
} from '@/core/macro/recipes/recipeStorage';

describe('MacroBuilderPage slice 11', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders macro builder page and builder shell', () => {
    render(
      <MemoryRouter initialEntries={['/macro-builder']}>
        <Routes>
          <Route path="/macro-builder" element={<MacroBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('main', { name: 'Macro builder page' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Macro recipe builder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Macro builder source')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to workspace' })).toHaveAttribute('href', '/');
  });

  it('loads a built-in recipe into the builder', () => {
    render(
      <MemoryRouter initialEntries={['/macro-builder']}>
        <Routes>
          <Route path="/macro-builder" element={<MacroBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Macro builder source'), {
      target: {
        value: 'builtin:review-current-page',
      },
    });

    expect(screen.getByLabelText('Recipe ID')).toHaveValue('review-current-page');
    expect(screen.getByLabelText('Recipe Name')).toHaveValue('Review Stamp — Current Page');
    expect(screen.getAllByText('draw_text_on_pages')[0]).toBeInTheDocument();
  });

  it('saves a custom recipe and refreshes custom source list', () => {
    render(
      <MemoryRouter initialEntries={['/macro-builder']}>
        <Routes>
          <Route path="/macro-builder" element={<MacroBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Recipe ID'), {
      target: {
        value: 'custom-route-test',
      },
    });

    fireEvent.change(screen.getByLabelText('Recipe Name'), {
      target: {
        value: 'Custom Route Test',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Custom' }));

    expect(screen.getByRole('status')).toHaveTextContent('Saved custom macro: Custom Route Test');
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toContain('custom-route-test');

    expect(screen.getByLabelText('Macro builder source')).toHaveTextContent('Custom Route Test');
  });

  it('loads saved custom recipe from source selector', () => {
    localStorage.setItem(
      CUSTOM_MACRO_RECIPE_STORAGE_KEY,
      JSON.stringify([
        {
          updatedAt: '2026-01-01T00:00:00.000Z',
          recipe: {
            id: 'saved-custom',
            name: 'Saved Custom',
            steps: [
              {
                op: 'select_pages',
                selector: {
                  mode: 'all',
                },
              },
            ],
          },
        },
      ]),
    );

    render(
      <MemoryRouter initialEntries={['/macro-builder']}>
        <Routes>
          <Route path="/macro-builder" element={<MacroBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Macro builder source'), {
      target: {
        value: 'custom:saved-custom',
      },
    });

    expect(screen.getByLabelText('Recipe ID')).toHaveValue('saved-custom');
    expect(screen.getByLabelText('Recipe Name')).toHaveValue('Saved Custom');
    expect(screen.getAllByText('select_pages')[0]).toBeInTheDocument();
  });
});