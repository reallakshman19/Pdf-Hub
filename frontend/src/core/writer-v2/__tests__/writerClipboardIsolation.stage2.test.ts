import { beforeEach, describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import { useWriterV2Store } from '../writerV2Store';
import {
  clearWriterElementClipboard,
  copySelectedWriterElementsToClipboard,
  hasWriterClipboardElements,
  pasteWriterClipboardElements,
} from '../writerClipboardActions';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';

const now = '2026-11-18T00:00:00.000Z';

function element(id: string, documentFingerprint: string, type: WriterElementV2['type'] = 'richTextBox'): WriterElementV2 {
  return {
    id,
    documentFingerprint,
    pageIndex: 0,
    type,
    rect: { x: 20, y: 100, width: 120, height: 80 },
    plainText: 'WP03 owner isolation',
    style: { zIndex: 1, opacity: 1 },
    locked: false,
    hidden: false,
    createdAt: now,
    updatedAt: now,
  };
}

function imageAsset(documentFingerprint: string): WriterAssetRecordV2 {
  return {
    id: 'alt-wp03-asset',
    documentFingerprint,
    kind: 'image',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XmkAAAAASUVORK5CYII=',
    createdAt: now,
    updatedAt: now,
  };
}

function select(id: string) {
  useWriterV2Store.getState().dispatchWriterCommand({
    type: 'SET_ACTIVE_WRITER_ELEMENT',
    id,
  });
}

describe('ALT-WP03 Writer clipboard document/asset isolation', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
    clearWriterElementClipboard();
  });

  it('keeps same-document clipboard copy/paste working with fresh IDs and an offset', async () => {
    const writer = useWriterV2Store.getState();
    writer.createBlankWriterDocument({ documentFingerprint: 'alt-doc-A' });
    writer.dispatchWriterCommand({ type: 'ADD_WRITER_ELEMENT', element: element('a-box', 'alt-doc-A') });
    select('a-box');
    expect(copySelectedWriterElementsToClipboard().changed).toBe(true);

    const paste = await pasteWriterClipboardElements();
    expect(paste.changed).toBe(true);
    const items = useWriterV2Store.getState().elements;
    expect(items).toHaveLength(2);
    expect(items[1].id).not.toBe(items[0].id);
    expect(items[1].documentFingerprint).toBe('alt-doc-A');
    expect(items[1].rect.x).toBe(items[0].rect.x + 16);
    expect(items[1].rect.y).toBe(items[0].rect.y - 16);
  });

  it('rejects cross-document text paste without changing destination and retains the clipboard', async () => {
    const writer = useWriterV2Store.getState();
    writer.createBlankWriterDocument({ documentFingerprint: 'alt-doc-A' });
    writer.dispatchWriterCommand({ type: 'ADD_WRITER_ELEMENT', element: element('a-box', 'alt-doc-A') });
    select('a-box');
    expect(copySelectedWriterElementsToClipboard().changed).toBe(true);

    writer.createBlankWriterDocument({ documentFingerprint: 'alt-doc-B' });
    const rejected = await pasteWriterClipboardElements();
    expect(rejected.changed).toBe(false);
    expect(rejected.message).toMatch(/different document|document identity/i);
    expect(useWriterV2Store.getState().elements).toEqual([]);
    expect(useWriterV2Store.getState().currentDocumentFingerprint).toBe('alt-doc-B');
    expect(hasWriterClipboardElements()).toBe(true);
  });

  it('rejects cross-document image paste without adopting foreign asset IDs', async () => {
    const writer = useWriterV2Store.getState();
    writer.createBlankWriterDocument({ documentFingerprint: 'alt-doc-A' });
    writer.addWriterAssets([imageAsset('alt-doc-A')]);
    writer.dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: {
        ...element('a-image', 'alt-doc-A', 'imageBox'),
        imageAssetId: 'alt-wp03-asset',
        assetIds: ['alt-wp03-asset'],
      },
    });
    select('a-image');
    expect(copySelectedWriterElementsToClipboard().changed).toBe(true);

    writer.createBlankWriterDocument({ documentFingerprint: 'alt-doc-B' });
    const rejected = await pasteWriterClipboardElements();
    expect(rejected.changed).toBe(false);
    expect(rejected.message).toMatch(/different document|document identity/i);
    expect(useWriterV2Store.getState().elements).toHaveLength(0);
    expect(useWriterV2Store.getState().assetRecords).toHaveLength(0);
  });

  it('preserves owned image assets on same-document paste', async () => {
    const writer = useWriterV2Store.getState();
    writer.createBlankWriterDocument({ documentFingerprint: 'alt-doc-A' });
    writer.addWriterAssets([imageAsset('alt-doc-A')]);
    writer.dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: {
        ...element('a-image', 'alt-doc-A', 'imageBox'),
        imageAssetId: 'alt-wp03-asset',
        assetIds: ['alt-wp03-asset'],
      },
    });
    select('a-image');
    expect(copySelectedWriterElementsToClipboard().changed).toBe(true);
    expect((await pasteWriterClipboardElements()).changed).toBe(true);
    const state = useWriterV2Store.getState();
    expect(state.elements).toHaveLength(2);
    expect(state.elements[1].imageAssetId).toBe('alt-wp03-asset');
    expect(state.assetRecords).toHaveLength(1);
    expect(state.assetRecords[0].documentFingerprint).toBe('alt-doc-A');
  });

  it('fails closed when copied image assets go missing before a paste', async () => {
    const writer = useWriterV2Store.getState();
    writer.createBlankWriterDocument({ documentFingerprint: 'alt-doc-A' });
    writer.addWriterAssets([imageAsset('alt-doc-A')]);
    writer.dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: { ...element('a-image', 'alt-doc-A', 'imageBox'), imageAssetId: 'alt-wp03-asset' },
    });
    select('a-image');
    expect(copySelectedWriterElementsToClipboard().changed).toBe(true);
    writer.removeWriterAsset('alt-wp03-asset');
    const rejected = await pasteWriterClipboardElements();
    expect(rejected.changed).toBe(false);
    expect(rejected.message).toMatch(/asset/i);
    expect(useWriterV2Store.getState().elements).toHaveLength(1);
  });

  it('rejects an inconsistent selection carrying a foreign element fingerprint', () => {
    const writer = useWriterV2Store.getState();
    writer.createBlankWriterDocument({ documentFingerprint: 'alt-doc-A' });
    writer.dispatchWriterCommand({
      type: 'ADD_WRITER_ELEMENT',
      element: element('foreign-box', 'alt-doc-B'),
    });
    select('foreign-box');
    const result = copySelectedWriterElementsToClipboard();
    expect(result.changed).toBe(false);
    expect(result.message).toMatch(/document identity|active document/i);
    expect(hasWriterClipboardElements()).toBe(false);
  });
});
