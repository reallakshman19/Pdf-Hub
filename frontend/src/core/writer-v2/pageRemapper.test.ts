import { describe, expect, it } from 'vitest';

import type { WriterElementV2 } from './types';
import {
  remapWriterAfterDelete,
  remapWriterAfterDuplicate,
  remapWriterAfterInsert,
  remapWriterAfterReorder,
  remapWriterAfterRotate,
} from './pageRemapper';

function element(
  id: string,
  pageIndex: number,
  rect = { x: 10, y: 20, width: 30, height: 40 },
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex,
    type: 'richTextBox',
    rect,
    editorStateJson: '{"root":{"children":[]}}',
    plainText: id,
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

describe('Writer V2 page remapper', () => {
  it('remaps page indexes after reorder', () => {
    const next = remapWriterAfterReorder(
      [element('a', 0), element('b', 1), element('c', 2)],
      [2, 0, 1],
    );

    expect(next.map((item) => [item.id, item.pageIndex])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 0],
    ]);
  });

  it('drops elements on deleted pages and shifts later pages', () => {
    const next = remapWriterAfterDelete(
      [element('a', 0), element('b', 1), element('c', 3)],
      [1, 2],
    );

    expect(next.map((item) => [item.id, item.pageIndex])).toEqual([
      ['a', 0],
      ['c', 1],
    ]);
  });

  it('shifts elements at and after an insertion point', () => {
    const next = remapWriterAfterInsert(
      [element('a', 0), element('b', 1), element('c', 3)],
      1,
      2,
    );

    expect(next.map((item) => [item.id, item.pageIndex])).toEqual([
      ['a', 0],
      ['b', 3],
      ['c', 5],
    ]);
  });

  it('duplicates elements with new ids on duplicated pages', () => {
    const ids = ['copy-a', 'copy-b'];
    const next = remapWriterAfterDuplicate(
      [element('a', 0), element('b', 2)],
      [0, 2],
      {
        createId: () => ids.shift() ?? 'fallback',
        now: '2026-09-18T00:00:00.000Z',
      },
    );

    expect(next.map((item) => [item.id, item.pageIndex])).toEqual([
      ['a', 0],
      ['b', 3],
      ['copy-a', 1],
      ['copy-b', 4],
    ]);
    expect(next.find((item) => item.id === 'copy-a')?.updatedAt).toBe(
      '2026-09-18T00:00:00.000Z',
    );
  });

  it('rotates overlay rectangles with their page', () => {
    const next = remapWriterAfterRotate(
      [element('a', 0, { x: 10, y: 20, width: 30, height: 40 })],
      [{ pageIndex: 0, angle: 90, width: 100, height: 200 }],
    );

    expect(next[0]?.rect).toEqual({
      x: 140,
      y: 10,
      width: 40,
      height: 30,
    });
  });
});
