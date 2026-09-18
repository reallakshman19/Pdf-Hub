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

    expect(screen.getByRole('main', { name: 'Workflow builder page' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Workflow builder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow builder source')).toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText('Workflow builder source'), {
      target: {
        value: 'builtin:review-current-page',
      },
    });

    expect(screen.getByLabelText('Workflow Name')).toHaveValue('Review Stamp — Current Page');
    expect(screen.getByText('1. Draw Text')).toBeInTheDocument();
    expect(screen.queryByText('draw_text_on_pages')).toBeNull();

    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByLabelText('Workflow ID')).toHaveValue('review-current-page');
  });

  it('saves a custom recipe and refreshes custom source list', () => {
    render(
      <MemoryRouter initialEntries={['/macro-builder']}>
        <Routes>
          <Route path="/macro-builder" element={<MacroBuilderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Workflow Name'), {
      target: {
        value: 'Custom Route Test',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));
    fireEvent.click(screen.getByText('Advanced'));
    fireEvent.change(screen.getByLabelText('Workflow ID'), {
      target: {
        value: 'custom-route-test',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Workflow' }));

    expect(screen.getByRole('status')).toHaveTextContent('Saved workflow: Custom Route Test');
    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toContain('custom-route-test');

    expect(screen.getByLabelText('Workflow builder source')).toHaveTextContent('Custom Route Test');
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

    fireEvent.change(screen.getByLabelText('Workflow builder source'), {
      target: {
        value: 'custom:saved-custom',
      },
    });

    expect(screen.getByLabelText('Workflow Name')).toHaveValue('Saved Custom');
    expect(screen.getByText('1. Select Pages')).toBeInTheDocument();
    expect(screen.queryByText('select_pages')).toBeNull();

    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByLabelText('Workflow ID')).toHaveValue('saved-custom');
  });
});