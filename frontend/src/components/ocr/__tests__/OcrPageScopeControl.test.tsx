import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { OcrPageScopeControl } from '../workflow/OcrPageScopeControl';

describe('OcrPageScopeControl', () => {
  it('shows current selected and all scopes with human page counts', () => {
    render(
      <OcrPageScopeControl
        value="selected"
        currentPageIndex={2}
        selectedPageIndexes={[0, 2]}
        pageCount={6}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Page 3')).toBeTruthy();
    expect(screen.getByText('2 pages')).toBeTruthy();
    expect(screen.getByText('6 pages')).toBeTruthy();
  });

  it('shows Resume only when checkpoint pages are available', () => {
    const { rerender } = render(
      <OcrPageScopeControl
        value="resume"
        currentPageIndex={0}
        selectedPageIndexes={[]}
        resumePageIndexes={[1, 3]}
        pageCount={5}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: /resume/i })).toBeTruthy();
    expect(screen.getByText('2 checkpoint pages')).toBeTruthy();

    rerender(
      <OcrPageScopeControl
        value="all"
        currentPageIndex={0}
        selectedPageIndexes={[]}
        resumePageIndexes={[]}
        pageCount={5}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('radio', { name: /resume/i })).toBeNull();
  });

  it('disables Selected when there is no page selection', () => {
    render(
      <OcrPageScopeControl
        value="all"
        currentPageIndex={0}
        selectedPageIndexes={[]}
        pageCount={4}
        onChange={vi.fn()}
      />,
    );

    const selected = screen.getByRole('radio', { name: /selected/i }) as HTMLInputElement;
    expect(selected.disabled).toBe(true);
    expect(screen.getByText('No pages selected')).toBeTruthy();
  });

  it('emits page scope changes', () => {
    const onChange = vi.fn();

    render(
      <OcrPageScopeControl
        value="selected"
        currentPageIndex={1}
        selectedPageIndexes={[1]}
        pageCount={3}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /all/i }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
