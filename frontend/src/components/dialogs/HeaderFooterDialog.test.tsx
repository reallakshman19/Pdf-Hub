import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createPageGraph } from '@/core/pages/pageGraph';
import { withPageLabelRanges } from '@/core/pages/pageLabels';
import type { PageNode } from '@/core/pages/types';
import { HeaderFooterDialog } from './HeaderFooterDialog';

function page(pageId: string, index: number): PageNode {
  return {
    pageId,
    documentKey: 'doc',
    originalPageNumber: index + 1,
    currentIndex: index,
    width: index === 3 ? 842 : 595,
    height: index === 3 ? 595 : 842,
    rotation: index === 3 ? 90 : 0,
  };
}

function graph() {
  return withPageLabelRanges(
    createPageGraph([
      page('cover', 0),
      page('front-1', 1),
      page('body-1', 2),
      page('body-2', 3),
    ]),
    [
      { startPageId: 'cover', prefix: 'Cover' },
      { startPageId: 'front-1', style: 'roman-lower' },
      { startPageId: 'body-1', style: 'decimal' },
    ],
  );
}

describe('HeaderFooterDialog', () => {
  it('shows a resolved representative preview and keeps printed content separate from PageLabels', () => {
    render(
      <HeaderFooterDialog
        isOpen
        pageGraph={graph()}
        currentPageId="body-1"
        selectedPageIds={[]}
        fileName="report.pdf"
        onClose={vi.fn()}
        onApply={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(
      screen.getByText(/Logical PDF PageLabels remain unchanged/i),
    ).toBeTruthy();
    expect(
      screen.getByTestId('header-footer-page-preview'),
    ).toBeTruthy();
    expect(
      screen.getByDisplayValue('Page {{physicalPage}} of {{pageCount}}'),
    ).toBeTruthy();
  });

  it('compiles current PageLabel-section targeting before applying', async () => {
    const onApply = vi.fn().mockResolvedValue(true);
    render(
      <HeaderFooterDialog
        isOpen
        pageGraph={graph()}
        currentPageId="body-2"
        selectedPageIds={[]}
        fileName="report.pdf"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Apply to' }),
      { target: { value: 'current-page-label-section' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply header & footer' }),
    );

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    const template = onApply.mock.calls[0]?.[0];
    expect(template.rules[0].selector.include).toEqual({
      mode: 'pageLabelRange',
      startPageId: 'body-1',
    });
  });

  it('compiles selected pages to stable PageIds in physical order', async () => {
    const onApply = vi.fn().mockResolvedValue(true);
    render(
      <HeaderFooterDialog
        isOpen
        pageGraph={graph()}
        currentPageId="body-1"
        selectedPageIds={['body-2', 'front-1']}
        fileName="report.pdf"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Apply to' }),
      { target: { value: 'selected' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply header & footer' }),
    );

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    const template = onApply.mock.calls[0]?.[0];
    expect(template.rules[0].selector.include).toEqual({
      mode: 'pageIds',
      pageIds: ['front-1', 'body-2'],
    });
  });

  it('inserts canonical tokens into the active six-zone slot', () => {
    render(
      <HeaderFooterDialog
        isOpen
        pageGraph={graph()}
        currentPageId="body-1"
        selectedPageIds={[]}
        fileName="report.pdf"
        onClose={vi.fn()}
        onApply={vi.fn().mockResolvedValue(true)}
      />,
    );

    const headerLeft = screen.getByRole('textbox', {
      name: 'Header left',
    });
    fireEvent.focus(headerLeft);
    fireEvent.click(
      screen.getByRole('button', { name: 'Logical label' }),
    );

    expect(headerLeft).toHaveValue('{{pageLabel}}');
  });

  it('fails closed and disables apply when all six slots are empty', async () => {
    render(
      <HeaderFooterDialog
        isOpen
        pageGraph={graph()}
        currentPageId="body-1"
        selectedPageIds={[]}
        fileName="report.pdf"
        onClose={vi.fn()}
        onApply={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Footer right' }),
      { target: { value: '' } },
    );

    await waitFor(() => {
      expect(
        screen.getByRole('alert').textContent,
      ).toMatch(/at least one header or footer slot/i);
    });

    expect(
      screen.getByRole('button', { name: 'Apply header & footer' }),
    ).toBeDisabled();
  });
});
