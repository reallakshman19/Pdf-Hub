/*
 * Thumbnail panel component.
 *
 * This sidebar panel displays page thumbnails and handles selection logic.
 * It accepts a list of PageDescriptors and delegates thumbnail clicks to
 * the caller.  Drag‑and‑drop and advanced operations will be added in a
 * later phase; currently it renders a simple vertical list.
 */

import type React from 'react';
import type { PageDescriptor, PageSelectionState } from '../../core/pages/types';
import PageThumbnail from '../pages/PageThumbnail';

export interface ThumbnailPanelProps {
  pages: PageDescriptor[];
  selection: PageSelectionState;
  onThumbnailClick: (
    pageId: string,
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => void;
}

export default function ThumbnailPanel({
  pages,
  selection,
  onThumbnailClick,
}: ThumbnailPanelProps): React.JSX.Element {
  return (
    <div className="doccraft-thumbnail-panel">
      {pages.map((page) => (
        <PageThumbnail
          key={page.pageId}
          page={page}
          selected={selection.selectedPageIds.includes(page.pageId)}
          onClick={onThumbnailClick}
        />
      ))}
    </div>
  );
}