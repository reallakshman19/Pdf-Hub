import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createPageGraph } from '@/core/pages/pageGraph';
import { withPageLabelRanges } from '@/core/pages/pageLabels';
import type { PageNode } from '@/core/pages/types';
import { PageLabelsDialog } from './PageLabelsDialog';

function page(pageId: string, index: number): PageNode {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: index + 1,
    currentIndex: index,
    width: 595,
    height: 842,
    rotation: 0,
  };
}

function graph() {
  return createPageGraph([
    page('p1', 0),
    page('p2', 1),
    page('p3', 2),
    page('p4', 3),
  ]);
}

describe('PageLabelsDialog', () => {
  it('defaults to first selected page and applies a previewed restart', async () => {
    const onApply = vi.fn().mockResolvedValue(true);
    render(
      <PageLabelsDialog
        isOpen
        pageGraph={graph()}
        currentPageId="p3"
        selectedPageIds={['p2']}
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    expect(screen.getByText(/Page labels change the PDF navigator label only/i)).toBeTruthy();
    expect(screen.getByText(/Physical page 2/i)).toBeTruthy();

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1]!, { target: { value: 'roman-lower' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply restart' }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { startPageId: 'p1', style: 'decimal', startNumber: 1 },
        { startPageId: 'p2', style: 'roman-lower', startNumber: 1 },
      ]);
    });
  });

  it('can target the current page instead of the selection', async () => {
    const onApply = vi.fn().mockResolvedValue(true);
    render(
      <PageLabelsDialog
        isOpen
        pageGraph={graph()}
        currentPageId="p3"
        selectedPageIds={['p2']}
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0]!, { target: { value: 'current' } });

    expect(await screen.findByText(/Physical page 3/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply restart' }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { startPageId: 'p1', style: 'decimal', startNumber: 1 },
        { startPageId: 'p3', style: 'decimal', startNumber: 1 },
      ]);
    });
  });

  it('clears existing logical labels through an empty canonical range list', async () => {
    const onApply = vi.fn().mockResolvedValue(true);
    const configured = withPageLabelRanges(graph(), [
      { startPageId: 'p1', prefix: 'Cover' },
      { startPageId: 'p2', style: 'roman-lower' },
      { startPageId: 'p3', style: 'decimal' },
    ]);

    render(
      <PageLabelsDialog
        isOpen
        pageGraph={configured}
        currentPageId="p3"
        selectedPageIds={[]}
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear labels' }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([]);
    });
  });

  it('warns when imported resolved labels do not have a canonical editable range model', () => {
    const imported = createPageGraph([
      page('p1', 0),
      { ...page('p2', 1), logicalLabel: 'i' },
      { ...page('p3', 2), logicalLabel: '1' },
      page('p4', 3),
    ]);

    render(
      <PageLabelsDialog
        isOpen
        pageGraph={imported}
        currentPageId="p2"
        selectedPageIds={[]}
        onClose={vi.fn()}
        onApply={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(
      screen.getByText(/original compact range definitions are not editable/i),
    ).toBeTruthy();
  });
});
