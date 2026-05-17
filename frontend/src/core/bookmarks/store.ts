/*
 * Bookmark store for DocCraft.
 *
 * This store manages a bookmark tree and provides methods to add, update
 * and remove bookmarks.  It does not persist bookmarks; that
 * responsibility lies with higher‑level components or services.
 */

import type { BookmarkNode } from './types';

function findNodeById(nodes: BookmarkNode[], id: string): BookmarkNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findNodeById(node.children, id);
    if (child) {
      return child;
    }
  }
  return null;
}

export class BookmarkStore {
  private tree: BookmarkNode[] = [];

  /**
   * Loads a new bookmark tree.
   */
  setTree(nodes: BookmarkNode[]): void {
    this.tree = nodes.slice();
  }

  /**
   * Returns a copy of the current bookmark tree.
   */
  getTree(): BookmarkNode[] {
    // Deep copy children recursively.
    const copyNode = (node: BookmarkNode): BookmarkNode => ({
      id: node.id,
      title: node.title,
      pageNumber: node.pageNumber,
      x: node.x,
      y: node.y,
      source: node.source,
      children: node.children.map(copyNode),
    });
    return this.tree.map(copyNode);
  }

  /**
   * Adds a new bookmark as a child of the specified parent.  If parentId
   * is undefined or null, the bookmark is inserted at the root level.
   */
  addBookmark(parentId: string | null, bookmark: BookmarkNode): void {
    if (parentId) {
      const parent = findNodeById(this.tree, parentId);
      if (parent) {
        parent.children.push(bookmark);
      }
    } else {
      this.tree.push(bookmark);
    }
  }

  /**
   * Updates the title or page of an existing bookmark.
   */
  updateBookmark(id: string, patch: Partial<Pick<BookmarkNode, 'title' | 'pageNumber' | 'x' | 'y'>>): void {
    const node = findNodeById(this.tree, id);
    if (!node) return;
    if (patch.title !== undefined) {
      node.title = patch.title;
    }
    if (patch.pageNumber !== undefined) {
      node.pageNumber = patch.pageNumber;
    }
    if (patch.x !== undefined) {
      node.x = patch.x;
    }
    if (patch.y !== undefined) {
      node.y = patch.y;
    }
  }

  /**
   * Deletes a bookmark and its subtree.
   */
  deleteBookmark(id: string): void {
    const deleteRecursive = (nodes: BookmarkNode[]): boolean => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.id === id) {
          nodes.splice(i, 1);
          return true;
        }
        if (deleteRecursive(node.children)) {
          return true;
        }
      }
      return false;
    };
    deleteRecursive(this.tree);
  }
}