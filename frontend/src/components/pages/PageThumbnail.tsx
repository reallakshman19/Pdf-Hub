/*
 * Thumbnail component for a single page in organize mode.
 *
 * This component renders a clickable page thumbnail with optional
 * selection styling.  It displays the page number and any badges via
 * PageBadges.  When clicked, it invokes the provided callback with the
 * relevant event modifiers.
 */

import type React from 'react';
import type { PageDescriptor } from '../../core/pages/types';
import PageBadges from './PageBadges';

export interface PageThumbnailProps {
  page: PageDescriptor;
  /**
   * Whether this page is currently selected.
   */
  selected: boolean;
  /**
   * Callback invoked when the thumbnail is clicked.
   *
   * @param pageId Identifier of the clicked page.
   * @param event Mouse event containing modifier keys.
   */
  onClick: (pageId: string, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}

export default function PageThumbnail({ page, selected, onClick }: PageThumbnailProps): React.JSX.Element {
  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.stopPropagation();
    onClick(page.pageId, e);
  };

  const className = [
    'doccraft-page-thumbnail',
    selected ? 'doccraft-page-thumbnail-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} onClick={handleClick}>
      <div className="doccraft-page-thumbnail-image">
        {page.thumbnailUrl ? (
          <img src={page.thumbnailUrl} alt={`Page ${page.currentIndex + 1}`} />
        ) : (
          <div className="doccraft-page-thumbnail-skeleton" />
        )}
      </div>
      <div className="doccraft-page-thumbnail-footer">
        <span className="doccraft-page-number">{page.currentIndex + 1}</span>
        <PageBadges page={page} />
      </div>
    </div>
  );
}