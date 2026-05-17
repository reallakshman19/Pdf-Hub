/*
 * TOC generator panel component.
 *
 * Provides a simple UI for generating a table of contents from user
 * input.  For now, it accepts a list of headings and inserts them as
 * top‑level bookmarks.  In future iterations this may parse headings
 * from the document itself.
 */

import React, { useState } from 'react';
import { BookmarkStore } from '../../core/bookmarks/store';
import { generateToc } from '../../core/bookmarks/tocGenerator';

export interface TocGeneratorPanelProps {
  bookmarkStore: BookmarkStore;
  onClose: () => void;
}

export default function TocGeneratorPanel({ bookmarkStore, onClose }: TocGeneratorPanelProps): JSX.Element {
  const [text, setText] = useState('');

  const handleGenerate = () => {
    const headings = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const toc = generateToc(headings, 1);
    // Append generated TOC to root of bookmark tree
    toc.forEach((bk) => bookmarkStore.addBookmark(null, bk));
    setText('');
    onClose();
  };

  return (
    <div className="doccraft-toc-generator-panel">
      <h3>Generate Table of Contents</h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter headings, one per line"
        rows={6}
        cols={30}
      />
      <div className="actions">
        <button onClick={handleGenerate}>Insert TOC</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}