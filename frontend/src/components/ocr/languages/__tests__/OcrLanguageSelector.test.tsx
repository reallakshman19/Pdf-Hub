import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { OcrLanguageSelector } from '../OcrLanguageSelector';

describe('OcrLanguageSelector', () => {
  it('renders primary language selector and triggers onChange when changed', async () => {
    const handleChange = vi.fn();
    await act(async () => {
      render(
        <OcrLanguageSelector
          languageHints={['eng']}
          onChange={handleChange}
        />
      );
    });

    const select = screen.getByTestId('ocr-primary-language-select') as HTMLSelectElement;
    expect(select.value).toBe('eng');

    await act(async () => {
      fireEvent.change(select, { target: { value: 'deu' } });
    });
    expect(handleChange).toHaveBeenCalledWith(['deu']);
  });

  it('allows toggling secondary languages', async () => {
    const handleChange = vi.fn();
    await act(async () => {
      render(
        <OcrLanguageSelector
          languageHints={['eng']}
          onChange={handleChange}
        />
      );
    });

    const deuChip = screen.getByTestId('ocr-lang-chip-deu');
    expect(deuChip).toHaveAttribute('data-selected', 'false');

    await act(async () => {
      fireEvent.click(deuChip);
    });
    expect(handleChange).toHaveBeenCalledWith(['eng', 'deu']);
  });

  it('unselects secondary language when clicked again', async () => {
    const handleChange = vi.fn();
    await act(async () => {
      render(
        <OcrLanguageSelector
          languageHints={['eng', 'fra']}
          onChange={handleChange}
        />
      );
    });

    const fraChip = screen.getByTestId('ocr-lang-chip-fra');
    expect(fraChip).toHaveAttribute('data-selected', 'true');

    await act(async () => {
      fireEvent.click(fraChip);
    });
    expect(handleChange).toHaveBeenCalledWith(['eng']);
  });
});
