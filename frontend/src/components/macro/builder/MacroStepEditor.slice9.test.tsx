import { describe, expect, it, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MacroRecipeBuilder } from './MacroRecipeBuilder';
import {
  CUSTOM_MACRO_RECIPE_STORAGE_KEY,
} from '../../../core/macro/recipes/recipeStorage';

function exportSource(): void {
  fireEvent.click(screen.getByText('Advanced'));
  fireEvent.click(screen.getByRole('button', { name: 'View recipe source' }));
}

describe('MacroStepEditor slice 9', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('edits rotate_pages degrees through selected step editor', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Rotate Pages' }));

    expect(screen.getByRole('region', { name: 'Macro step editor' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Degrees'), {
      target: { value: '180' },
    });

    exportSource();

    expect((screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value).toContain('"degrees": 180');
  });

  it('edits page selector mode to all', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));

    fireEvent.change(screen.getByLabelText('Selector Mode'), {
      target: { value: 'all' },
    });

    exportSource();

    expect((screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value).toContain('"mode": "all"');
  });

  it('edits range selector values', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Select Pages' }));

    fireEvent.change(screen.getByLabelText('Selector Mode'), {
      target: { value: 'range' },
    });
    fireEvent.change(screen.getByLabelText('Range From'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Range To'), {
      target: { value: '5' },
    });

    exportSource();

    const json = (screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value;
    expect(json).toContain('"mode": "range"');
    expect(json).toContain('"from": 2');
    expect(json).toContain('"to": 5');
  });

  it('edits insert position before page', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Insert Blank Page' }));

    fireEvent.change(screen.getByLabelText('Insert Position Mode'), {
      target: { value: 'before' },
    });
    fireEvent.change(screen.getByLabelText('Insert Position Page'), {
      target: { value: '3' },
    });

    exportSource();

    const json = (screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value;
    expect(json).toContain('"mode": "before"');
    expect(json).toContain('"page": 3');
  });

  it('edits text and validates invalid font size', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Draw Text' }));

    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'APPROVED' },
    });
    fireEvent.change(screen.getByLabelText('Font Size'), {
      target: { value: '0' },
    });

    expect(screen.getAllByText(/fontSize/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Save Workflow' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Font Size'), {
      target: { value: '14' },
    });

    expect(screen.getByText('Recipe is valid.')).toBeInTheDocument();
  });

  it('edits string-list donor files', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Merge Files' }));

    fireEvent.change(screen.getByLabelText('Donor File IDs'), {
      target: { value: 'donorA\ndonorB' },
    });

    exportSource();

    const json = (screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value;
    expect(json).toContain('"donorA"');
    expect(json).toContain('"donorB"');
  });

  it('edits JSON tableData and saves valid recipe', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Place Table' }));

    fireEvent.change(screen.getByLabelText('Table Data'), {
      target: {
        value: JSON.stringify({
          columns: [{ id: 'c1', label: 'Item' }],
          rows: [
            {
              id: 'r1',
              cells: [{ id: 'r1c1', text: 'Pump' }],
            },
          ],
          style: {
            borderColor: '#111827',
            headerBg: '#f1f5f9',
            fontSize: 10,
          },
        }),
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Workflow' }));

    expect(localStorage.getItem(CUSTOM_MACRO_RECIPE_STORAGE_KEY)).toContain('place_table');
  });

  it('surfaces invalid JSON without corrupting current recipe', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Place Table' }));

    fireEvent.change(screen.getByLabelText('Table Data'), {
      target: { value: '{bad' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid JSON/);

    exportSource();

    expect((screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value).toContain('"op": "place_table"');
  });

  it('edits conditional condition', () => {
    render(<MacroRecipeBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));

    fireEvent.change(screen.getByLabelText('Condition Type'), {
      target: { value: 'filename_contains' },
    });
    fireEvent.change(screen.getByLabelText('Condition Value'), {
      target: { value: 'IFC' },
    });

    exportSource();

    const json = (screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value;
    expect(json).toContain('"type": "filename_contains"');
    expect(json).toContain('"value": "IFC"');
  });
});