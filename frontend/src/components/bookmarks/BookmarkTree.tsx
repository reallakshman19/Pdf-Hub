/*
 * Recursive bookmark tree component.
 *
 * This component renders a tree of bookmarks.  It is read‑only; editing
 * is handled by external UI.  Clicking a bookmark should navigate to
 * the corresponding page; that responsibility is delegated to the
 * caller via the onSelect callback.
 */

import type { JSX } from 'react';
import type { BookmarkNode } from '../../core/bookmarks/types';

export interface BookmarkTreeProps {
  nodes: BookmarkNode[];
  onSelect?: (pageNumber: number) => void;
}

export default function BookmarkTree({ nodes, onSelect }: BookmarkTreeProps): JSX.Element {
  return (
    <ul className="doccraft-bookmark-tree">
      {nodes.map((node) => (
        <li key={node.id}>
          <span
            className="bookmark-title"
            onClick={() => {
              if (onSelect) {
                onSelect(node.pageNumber);
              }
            }}
          >
            {node.title}
          </span>
          {node.children.length > 0 && <BookmarkTree nodes={node.children} onSelect={onSelect} />}
        </li>
      ))}
    </ul>
  );
}