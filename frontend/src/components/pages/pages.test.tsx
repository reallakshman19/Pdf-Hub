import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PageBadges from './PageBadges';
import PageDropIndicator from './PageDropIndicator';
import PageOperationPreview from './PageOperationPreview';
import PageThumbnail from './PageThumbnail';
import type { PageDescriptor } from '@/core/pages/types';

function makePage(overrides: Partial<PageDescriptor> = {}): PageDescriptor {
  return {
    pageId: 'page-1',
    documentKey: 'doc-1',
    originalPageNumber: 1,
    currentIndex: 0,
    width: 612,
    height: 792,
    rotation: 0,
    annotationCount: 0,
    ...overrides,
  };
}

describe('components/pages', () => {
  it('renders optional rotation, OCR status, and annotation count badges', () => {
    const { container, rerender } = render(<PageBadges page={makePage()} />);
    expect(container.textContent).toBe('');

    rerender(
      <PageBadges
        page={makePage({
          rotation: 90,
          ocrStatus: 'complete',
          annotationCount: 4,
        })}
      />,
    );
    expect(screen.getByText('90°')).toBeTruthy();
    expect(screen.getByText('complete')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('renders PageDropIndicator only when visible and keeps PageOperationPreview null', () => {
    const { container, rerender } = render(<PageDropIndicator visible={false} />);
    expect(container.firstChild).toBeNull();

    rerender(<PageDropIndicator visible={true} />);
    expect(container.querySelector('.doccraft-page-drop-indicator')).toBeTruthy();

    const preview = render(<PageOperationPreview />);
    expect(preview.container.firstChild).toBeNull();
  });

  it('renders PageThumbnail with skeleton or image and forwards click events', () => {
    const onClick = vi.fn();
    const { container, rerender } = render(
      <PageThumbnail page={makePage()} selected={false} onClick={onClick} />,
    );
    expect(container.querySelector('.doccraft-page-thumbnail-skeleton')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    fireEvent.click(container.querySelector('.doccraft-page-thumbnail')!);
    expect(onClick).toHaveBeenCalledWith('page-1', expect.any(Object));

    rerender(
      <PageThumbnail
        page={makePage({ thumbnailUrl: 'data:image/png;base64,AAA', currentIndex: 2 })}
        selected={true}
        onClick={onClick}
      />,
    );
    expect(container.querySelector('.doccraft-page-thumbnail-selected')).toBeTruthy();
    expect(screen.getByAltText('Page 3')).toBeTruthy();
  });
});
