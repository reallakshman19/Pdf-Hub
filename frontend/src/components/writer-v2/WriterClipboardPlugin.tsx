import React from 'react';
import { $createParagraphNode, $createTextNode, $insertNodes, COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { importClipboardDataForWriter } from '@/core/writer-v2/clipboard/importClipboardData';
import { $createImageNode } from '@/core/writer-v2/lexical-nodes/ImageNode';
import { currentRichEditorBinding, richEditorAggregateBytes } from '@/core/writer-v2/editor/richEditorImageInsertion';
import { useSessionStore } from '@/core/session/store';
import { parseTabularText } from '@/core/writer-v2/clipboard/parseTabularText';
import { insertTableFromData } from '@/core/writer-v2/lexical-nodes/tableHelpers';

export interface WriterClipboardPluginProps {
  documentFingerprint: string;
  onAssetsImported: (assets: WriterAssetRecordV2[]) => void;
}
export const WriterClipboardPlugin: React.FC<WriterClipboardPluginProps> = () => {
  const [editor] = useLexicalComposerContext();
  React.useEffect(() => editor.registerCommand<ClipboardEvent>(PASTE_COMMAND, event => {
    const data = event.clipboardData;
    if (!data) return false;
    event.preventDefault();
    const binding = currentRichEditorBinding(editor);
    if (!binding) return true;
    if (!binding.beginImport()) { useSessionStore.getState().failSaveOperation('Another Writer import is already running.'); return true; }
    void importClipboardDataForWriter(data, binding.owner.target.documentFingerprint, richEditorAggregateBytes(binding))
      .then(payload => {
        if (currentRichEditorBinding(editor) !== binding) return;
        const table = !payload.sanitizedHtml.trim() && !payload.assets.length ? parseTabularText(payload.plainText) : null;
        if (table) {
          if (currentRichEditorBinding(editor) === binding) insertTableFromData(editor, table);
          return;
        }
        const doc = new DOMParser().parseFromString(payload.sanitizedHtml, 'text/html');
        const htmlImages = Array.from(doc.body.querySelectorAll('img'));
        // HTML-only images have not been admitted by the byte-signature boundary.
        if (htmlImages.length && !payload.assets.length) throw new Error('Paste image files rather than unverified HTML image URLs.');
        htmlImages.forEach(img => img.remove());
        editor.update(() => {
          if (currentRichEditorBinding(editor) !== binding) return;
          const nodes = $generateNodesFromDOM(editor, doc);
          if (nodes.length) $insertNodes(nodes);
          else if (payload.plainText) $insertNodes([$createParagraphNode().append($createTextNode(payload.plainText))]);
          if (payload.assets.length) {
            $insertNodes(payload.assets.map(asset => $createImageNode(asset.dataUrl, 'Pasted image')));
            binding.stage(payload.assets);
          }
        }, { discrete: true });
      }).catch(error => {
        if (currentRichEditorBinding(editor) === binding) useSessionStore.getState().failSaveOperation(error instanceof Error ? error.message : String(error));
      }).finally(() => binding.endImport());
    return true;
  }, COMMAND_PRIORITY_HIGH), [editor]);
  return null;
};
