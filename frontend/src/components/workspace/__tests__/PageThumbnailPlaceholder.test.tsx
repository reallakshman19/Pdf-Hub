import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageThumbnailPlaceholder } from '../PageThumbnailPlaceholder';
import * as thumbnailService from '@/core/renderer/thumbnailRenderService';

describe('PageThumbnailPlaceholder', () => {
  it('renders skeleton fallback with page number when no cached thumbnail exists', () => {
    vi.spyOn(thumbnailService, 'getCachedThumbnailUrl').mockReturnValue(null);

    render(
      <PageThumbnailPlaceholder
        pageNumber={42}
        documentKey="test-doc"
        width={600}
        height={800}
      />,
    );

    expect(screen.getByTestId('page-placeholder-42')).toBeInTheDocument();
    expect(screen.getByText('Page 42')).toBeInTheDocument();
  });

  it('renders thumbnail image preview when cached thumbnail is available', () => {
    vi.spyOn(thumbnailService, 'getCachedThumbnailUrl').mockReturnValue('data:image/png;base64,mockthumb');

    render(
      <PageThumbnailPlaceholder
        pageNumber={12}
        documentKey="test-doc"
        width={600}
        height={800}
      />,
    );

    const img = screen.getByRole('img', { name: /Page 12 low-resolution preview/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,mockthumb');
  });

  it('renders rapid scrolling badge when isRapidScrolling is true', () => {
    render(
      <PageThumbnailPlaceholder
        pageNumber={7}
        documentKey="test-doc"
        isRapidScrolling={true}
      />,
    );

    expect(screen.getByText('P. 7')).toBeInTheDocument();
  });
});
