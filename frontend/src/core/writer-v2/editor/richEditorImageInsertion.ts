import type { LexicalEditor } from 'lexical';
import { $insertNodes } from 'lexical';
import { $createImageNode } from '../lexical-nodes/ImageNode';
import { createWriterImageAssetFromFile, writerAggregateAssetBytes } from '../writerImageAsset';
import { useWriterV2Store } from '../writerV2Store';
import type { WriterAssetRecordV2 } from '../persistence/indexedDbWriterStore';
import { isRichEditorOwnerCurrent, type RichEditorOwner } from './richEditorOwnership';

export interface RichEditorBinding {
  owner: RichEditorOwner;
  isOpen(): boolean;
  assets(): readonly WriterAssetRecordV2[];
  stage(assets: WriterAssetRecordV2[]): void;
  beginImport(): boolean;
  endImport(): void;
}
const bindings = new WeakMap<LexicalEditor, RichEditorBinding>();
export function registerRichEditorBinding(editor: LexicalEditor, binding: RichEditorBinding): () => void {
  bindings.set(editor, binding);
  return () => { if (bindings.get(editor) === binding) bindings.delete(editor); };
}
export function currentRichEditorBinding(editor: LexicalEditor): RichEditorBinding | undefined {
  const binding = bindings.get(editor);
  return binding && binding.isOpen() && isRichEditorOwnerCurrent(binding.owner)
    && useWriterV2Store.getState().editingId === binding.owner.target.id ? binding : undefined;
}
export function richEditorAggregateBytes(binding: RichEditorBinding): number {
  return writerAggregateAssetBytes(useWriterV2Store.getState().assetRecords) + writerAggregateAssetBytes(binding.assets());
}
export async function insertRichEditorImageFiles(editor: LexicalEditor, files: readonly File[]): Promise<number> {
  const binding = currentRichEditorBinding(editor);
  if (!binding) throw new Error('Open a current Writer rich box before inserting images.');
  if (!binding.beginImport()) throw new Error('Another Writer image import is already running.');
  try {
    const assets: WriterAssetRecordV2[] = [];
    for (const file of files) {
      const asset = await createWriterImageAssetFromFile(file, binding.owner.target.documentFingerprint,
        new Date().toISOString(), richEditorAggregateBytes(binding) + writerAggregateAssetBytes(assets));
      if (currentRichEditorBinding(editor) !== binding) throw new Error('Writer editor changed during image admission.');
      assets.push(asset);
    }
    // Discrete update ensures the actual editor nodes and staged refs are ready before save.
    let inserted = false;
    editor.update(() => {
      if (currentRichEditorBinding(editor) !== binding) return;
      $insertNodes(assets.map((asset, i) => $createImageNode(asset.dataUrl, files[i].name)));
      binding.stage(assets);
      inserted = true;
    }, { discrete: true });
    if (!inserted) throw new Error('Writer image insertion was cancelled.');
    return assets.length;
  } finally { binding.endImport(); }
}
