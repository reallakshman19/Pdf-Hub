import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import type { MacroRecipe } from '@/core/macro/types';
import { createDefaultOverrides } from '@/core/macro/presetOverrides';
import { MacroPresetParameters } from './MacroPresetParameters';

const rotateRecipe: MacroRecipe = {
  id: 'rotate',
  name: 'Rotate',
  steps: [
    {
      op: 'rotate_pages',
      selector: { mode: 'selected' },
      degrees: 90,
    },
  ],
};

const headerFooterRecipe: MacroRecipe = {
  id: 'footer',
  name: 'Footer',
  steps: [
    {
      op: 'header_footer_text',
      selector: { mode: 'all' },
      zone: 'footer',
      text: 'Page {page}',
      align: 'center',
      marginX: 24,
      marginY: 20,
      fontSize: 10,
    },
  ],
};

describe('MacroPresetParameters', () => {
  it('renders operation-relevant controls without exposing unrelated ones', () => {
    render(
      <MacroPresetParameters
        recipe={rotateRecipe}
        overrides={createDefaultOverrides(rotateRecipe, 6)}
        pageCount={6}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Target pages')).toBeInTheDocument();
    expect(screen.getByLabelText('Rotate degrees')).toBeInTheDocument();
    expect(screen.queryByLabelText('Header/Footer text')).toBeNull();
    expect(screen.queryByLabelText('Blank page count')).toBeNull();
  });

  it('emits selector and operation parameter patches', () => {
    const onChange = vi.fn();

    render(
      <MacroPresetParameters
        recipe={rotateRecipe}
        overrides={createDefaultOverrides(rotateRecipe, 6)}
        pageCount={6}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Target pages'), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByLabelText('Rotate degrees'), {
      target: { value: '180' },
    });

    expect(onChange).toHaveBeenCalledWith({
      selectorMode: 'all',
    });
    expect(onChange).toHaveBeenCalledWith({
      rotateDegrees: 180,
    });
  });

  it('shows range controls only when range mode is active', () => {
    const overrides = {
      ...createDefaultOverrides(rotateRecipe, 9),
      selectorMode: 'range' as const,
      rangeFrom: 2,
      rangeTo: 7,
    };

    render(
      <MacroPresetParameters
        recipe={rotateRecipe}
        overrides={overrides}
        pageCount={9}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Range From')).toHaveValue(2);
    expect(screen.getByLabelText('Range To')).toHaveValue(7);
  });

  it('renders header/footer controls and token toggles for matching recipes', () => {
    render(
      <MacroPresetParameters
        recipe={headerFooterRecipe}
        overrides={createDefaultOverrides(headerFooterRecipe, 4)}
        pageCount={4}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Header/Footer text')).toBeInTheDocument();
    expect(screen.getByLabelText('Header/Footer align')).toBeInTheDocument();
    expect(screen.getByLabelText('Page token')).toBeChecked();
    expect(screen.getByLabelText('File token')).not.toBeChecked();
  });

  it('delegates parameter reset from the parameter surface', () => {
    const onReset = vi.fn();

    render(
      <MacroPresetParameters
        recipe={rotateRecipe}
        overrides={createDefaultOverrides(rotateRecipe, 6)}
        pageCount={6}
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Parameters' }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('disables the whole parameter form while another workflow is active', () => {
    render(
      <MacroPresetParameters
        recipe={rotateRecipe}
        overrides={createDefaultOverrides(rotateRecipe, 6)}
        pageCount={6}
        disabled
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Target pages')).toBeDisabled();
    expect(screen.getByLabelText('Rotate degrees')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset Parameters' })).toBeDisabled();
  });
});
