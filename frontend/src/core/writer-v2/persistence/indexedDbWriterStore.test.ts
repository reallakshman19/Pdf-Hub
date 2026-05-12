import { describe, expect, it } from 'vitest';
import type { WriterElementV2 } from '../types';
import {
  createMemoryWriterPersistence,
  createWriterDocumentRecord,
} from './indexedDbWriterStore';

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    },
    editorStateJson: '{"root":{"children":[]}}',
    plainText: 'Example',
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

describe('writer-v2 persistence adapter contract', () => {
  it('saves and reloads writer documents', async () => {
    const adapter = createMemoryWriterPersistence();

    await adapter.saveDocument(
      createWriterDocumentRecord('doc-1', [element('writer-1')], '2026-01-02T00:00:00.000Z'),
    );

    const loaded = await adapter.loadDocument('doc-1');

    expect(loaded?.documentFingerprint).toBe('doc-1');
    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.elements).toHaveLength(1);
    expect(loaded?.elements[0].id).toBe('writer-1');
  });

  it('clones saved elements so callers cannot mutate stored records by reference', async () => {
    const adapter = createMemoryWriterPersistence();
    const source = element('writer-1');

    await adapter.saveDocument(createWriterDocumentRecord('doc-1', [source]));

    source.rect.x = 9999;

    const loaded = await adapter.loadDocument('doc-1');

    expect(loaded?.elements[0].rect.x).toBe(10);
  });

  it('deletes writer documents', async () => {
    const adapter = createMemoryWriterPersistence();

    await adapter.saveDocument(createWriterDocumentRecord('doc-1', [element('writer-1')]));
    await adapter.deleteDocument('doc-1');

    await expect(adapter.loadDocument('doc-1')).resolves.toBeNull();
  });

  it('saves, lists, loads, and deletes image assets', async () => {
    const adapter = createMemoryWriterPersistence();

    await adapter.saveAsset({
      id: 'asset-1',
      documentFingerprint: 'doc-1',
      kind: 'image',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AA==',
      width: 20,
      height: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await adapter.saveAsset({
      id: 'asset-2',
      documentFingerprint: 'doc-2',
      kind: 'image',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,BB==',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(await adapter.loadAsset('asset-1')).toMatchObject({
      id: 'asset-1',
      documentFingerprint: 'doc-1',
    });

    expect((await adapter.listAssets('doc-1')).map((asset) => asset.id)).toEqual([
      'asset-1',
    ]);

    await adapter.deleteAsset('asset-1');

    await expect(adapter.loadAsset('asset-1')).resolves.toBeNull();
  });
});
