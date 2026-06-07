import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { WriterElementV2, WriterTableData } from '../types';
import {
  clearWriterElementClipboard,
  copySelectedWriterElementsToClipboard,
  hasWriterClipboardElements,
  pasteWriterClipboardElements,
} from '../writerClipboardActions';
import { useWriterV2Store } from '../writerV2Store';

describe('writerClipboardActions', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    clearWriterElementClipboard();
  });

  it('reports empty clipboard on paste before copy', () => {
    const result = pasteWriterClipboardElements();

    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/clipboard is empty/i);
    expect(hasWriterClipboardElements()).toBe(false);
  });

  it('copies and pastes selected rich text element with offset and new id', () => {
    hydrateSelection([
      makeElement('box-1', 'richTextBox'),
    ], ['box-1']);

    const copy = copySelectedWriterElementsToClipboard();
    const paste = pasteWriterClipboardElements();
    const state = useWriterV2Store.getState();
    const original = state.elements[0];
    const clone = state.elements[1];

    expect(copy.changed).toBe(true);
    expect(paste.changed).toBe(true);
    expect(hasWriterClipboardElements()).toBe(true);
    expect(state.elements).toHaveLength(2);
    expect(clone.id).not.toBe(original.id);
    expect(clone.type).toBe('richTextBox');
    expect(clone.rect.x).toBe(original.rect.x + 16);
    expect(clone.rect.y).toBe(original.rect.y - 16);
    expect(clone.locked).toBe(false);
    expect(clone.hidden).toBe(false);
    expect(state.selectedIds).toEqual([clone.id]);
  });

  it('preserves tableData and image asset references when pasting', () => {
    hydrateSelection([
      {
        ...makeElement('table-1', 'tableBox'),
        tableData: makeTableData(),
      },
      {
        ...makeElement('image-1', 'imageBox'),
        imageAssetId: 'asset-1',
        assetIds: ['asset-1'],
      },
    ], ['table-1', 'image-1']);

    copySelectedWriterElementsToClipboard();
    pasteWriterClipboardElements();

    const clones = useWriterV2Store.getState().elements.slice(2);
    const tableClone = clones.find((element) => element.type === 'tableBox');
    const imageClone = clones.find((element) => element.type === 'imageBox');

    expect(clones).toHaveLength(2);
    expect(tableClone?.tableData?.columns[0].label).toBe('Item');
    expect(tableClone?.tableData?.rows[0].cells[0].text).toBe('Bolt');
    expect(tableClone?.tableData).not.toBe(useWriterV2Store.getState().elements[0].tableData);
    expect(imageClone?.imageAssetId).toBe('asset-1');
    expect(imageClone?.assetIds).toEqual(['asset-1']);
  });

  it('copies the latest pasted elements so repeated paste cascades', () => {
    hydrateSelection([
      makeElement('box-1', 'richTextBox'),
    ], ['box-1']);

    copySelectedWriterElementsToClipboard();
    pasteWriterClipboardElements();
    pasteWriterClipboardElements();

    const state = useWriterV2Store.getState();

    expect(state.elements).toHaveLength(3);
    expect(state.elements[1].rect.x).toBe(26);
    expect(state.elements[2].rect.x).toBe(42);
    expect(state.elements[2].rect.y).toBe(Math.max(0, state.elements[1].rect.y - 16));
  });
});

function hydrateSelection(elements: WriterElementV2[], selectedIds: string[]): void {
  useWriterV2Store.getState().hydrateWriterSession({
    documentFingerprint: 'clipboard-doc',
    elements,
  });
  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SET_ACTIVE_WRITER_ELEMENT',
    id: selectedIds.at(-1) ?? null,
  });
  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SET_WRITER_SELECTION',
    ids: selectedIds,
  });
}

function makeElement(
  id: string,
  type: WriterElementV2['type'],
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'clipboard-doc',
    pageIndex: 0,
    type,
    rect: {
      x: 10,
      y: 50,
      width: 100,
      height: 40,
    },
    plainText: id,
    style: {
      zIndex: Number(id.replace(/\D+/g, '')) || 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
      fontSize: 12,
      fontFamily: 'Aptos',
      textColor: '#111827',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

function makeTableData(): WriterTableData {
  return {
    columns: [
      { id: 'item', label: 'Item', width: 120 },
      { id: 'qty', label: 'Qty', width: 60 },
    ],
    rows: [
      {
        id: 'row-1',
        cells: [
          { id: 'cell-1', text: 'Bolt' },
          { id: 'cell-2', text: '10' },
        ],
      },
    ],
    hasHeaderRow: true,
  };
}
