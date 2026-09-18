import { describe, expect, it, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MacroRecipeBuilder } from './MacroRecipeBuilder';

function exportSource(): void {
  fireEvent.click(screen.getByText('Advanced'));
  fireEvent.click(screen.getByRole('button', { name: 'View recipe source' }));
}

describe('MacroNestedBranchEditor slice 10', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows branch editor when selected step is conditional', () => {
    render(<MacroRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));
    expect(screen.getByText('Conditional Branches')).toBeInTheDocument();
  });

  it('adds nested step to then branch and exports it', () => {
    render(<MacroRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));

    const selects = screen.getAllByRole('combobox');
    const thenSelect = selects.find(s => s.getAttribute('aria-label')?.includes('Then Branch Step'));
    if (thenSelect) fireEvent.change(thenSelect, { target: { value: 'draw_text_on_pages' } });

    exportSource();
    const json = (screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value;
    expect(json).toContain('"then"');
    expect(json).toContain('"op": "draw_text_on_pages"');
  });

  it('adds nested step to else branch and exports it', () => {
    render(<MacroRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));

    const selects = screen.getAllByRole('combobox');
    const elseSelect = selects.find(s => s.getAttribute('aria-label')?.includes('Else Branch Step'));
    if (elseSelect) fireEvent.change(elseSelect, { target: { value: 'select_pages' } });

    exportSource();
    const json = (screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value;
    expect(json).toContain('"else"');
    expect(json).toContain('"op": "select_pages"');
  });

  it('selects and edits nested then branch step', () => {
    render(<MacroRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));

    const selects = screen.getAllByRole('combobox');
    const thenSelect = selects.find(s => s.getAttribute('aria-label')?.includes('Then Branch Step'));
    if (thenSelect) fireEvent.change(thenSelect, { target: { value: 'draw_text_on_pages' } });

    const buttons = screen.getAllByRole('button');
    const stepBtn = buttons.find(b => b.textContent?.includes('1. Draw Text'));
    if (stepBtn) fireEvent.click(stepBtn);

    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'NESTED APPROVED' } });
    exportSource();
    expect((screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value).toContain('"text": "NESTED APPROVED"');
  });

  it('duplicates nested branch step', () => {
    render(<MacroRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));

    const selects = screen.getAllByRole('combobox');
    const elseSelect = selects.find(s => s.getAttribute('aria-label')?.includes('Else Branch Step'));
    if (elseSelect) fireEvent.change(elseSelect, { target: { value: 'select_pages' } });

    const buttons = screen.getAllByRole('button');
    const copyBtn = buttons.find(b => b.textContent === 'Copy' && b.compareDocumentPosition(elseSelect!) !== 0);
    if (copyBtn) fireEvent.click(copyBtn);

    const stepBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('Select Pages'));
    expect(stepBtns.length).toBeGreaterThan(1);
  });

  it('removes nested branch step', () => {
    render(<MacroRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));

    const selects = screen.getAllByRole('combobox');
    const elseSelect = selects.find(s => s.getAttribute('aria-label')?.includes('Else Branch Step'));
    if (elseSelect) fireEvent.change(elseSelect, { target: { value: 'select_pages' } });

    const buttons = screen.getAllByRole('button');
    const removeBtn = buttons.find(b => b.textContent === 'Remove' && b.compareDocumentPosition(elseSelect!) !== 0);
    if (removeBtn) fireEvent.click(removeBtn);

    const stepBtns = screen.queryAllByRole('button').filter(b => b.textContent?.includes('1. Select Pages'));
    expect(stepBtns.length).toBe(0);
  });

  it('moves nested branch steps up and down', () => {
    render(<MacroRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));

    const selects = screen.getAllByRole('combobox');
    const elseSelect = selects.find(s => s.getAttribute('aria-label')?.includes('Else Branch Step'));
    if (elseSelect) {
        fireEvent.change(elseSelect, { target: { value: 'select_pages' } });
        fireEvent.change(elseSelect, { target: { value: 'rotate_pages' } });
    }

    const buttons = screen.getAllByRole('button');
    const upBtns = buttons.filter(b => b.textContent === '↑');
    if (upBtns.length > 1) fireEvent.click(upBtns[1]);

    exportSource();
    const json = (screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value;
    expect(json.indexOf('rotate_pages')).toBeLessThan(json.indexOf('select_pages'));
  });

  it('can create nested conditional inside a branch and add its own branch child', () => {
    render(<MacroRecipeBuilder />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Conditional' }));

    const selects = screen.getAllByRole('combobox');
    const thenSelect = selects.find(s => s.getAttribute('aria-label')?.includes('Then Branch Step'));
    if (thenSelect) fireEvent.change(thenSelect, { target: { value: 'conditional' } });

    const buttons = screen.getAllByRole('button');
    const stepBtn = buttons.find(b => b.textContent?.includes('1. Conditional'));
    if (stepBtn) fireEvent.click(stepBtn);

    const innerSelects = screen.getAllByRole('combobox');
    const innerElseSelect = innerSelects.find(s => s.getAttribute('aria-label')?.includes('Else Branch Step') && s !== thenSelect);
    if (innerElseSelect) fireEvent.change(innerElseSelect, { target: { value: 'select_pages' } });

    exportSource();
    const json = (screen.getByLabelText('Macro JSON') as HTMLTextAreaElement).value;
    expect(json).toContain('"op": "conditional"');
    expect(json).toContain('"else"');
    expect(json).toContain('"op": "select_pages"');
  });
});
