/*
 * Bookmarks panel component.
 *
 * Displays a hierarchical list of bookmarks and provides basic actions
 * such as adding, editing and deleting bookmarks.  The actual UI for
 * editing titles or rearranging nodes is simplified; in a more
 * complete implementation this would include drag‑and‑drop reordering
 * and inline editing.
 */

import React, { useState } from 'react';
import { BookmarkStore } from '../../core/bookmarks/store';
import BookmarkTree from '../bookmarks/BookmarkTree';
import TocGeneratorPanel from '../bookmarks/TocGeneratorPanel';

export interface BookmarksPanelProps {
  bookmarkStore: BookmarkStore;
}

export default function BookmarksPanel({ bookmarkStore }: BookmarksPanelProps): JSX.Element {
  const [showToc, setShowToc] = useState(false);

  const tree = bookmarkStore.getTree();

  return (
    <div className="doccraft-bookmarks-panel">
      <h2>Bookmarks</h2>
      <button onClick={() => setShowToc(!showToc)}>Generate TOC</button>
      {showToc && <TocGeneratorPanel bookmarkStore={bookmarkStore} onClose={() => setShowToc(false)} />}
      <BookmarkTree nodes={tree} />
    </div>
  );
}