import React from 'react';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
} from 'lexical';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { importClipboardDataForWriter } from '@/core/writer-v2/clipboard/importClipboardData';

export interface WriterClipboardPluginProps {
  documentFingerprint: string;
  onAssetsImported: (assets: WriterAssetRecordV2[]) => void;
}

export const WriterClipboardPlugin: React.FC<WriterClipboardPluginProps> = ({
  documentFingerprint,
  onAssetsImported,
}) => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    return editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const clipboardData = event.clipboardData;

        if (!clipboardData) {
          return false;
        }

        event.preventDefault();

        void importClipboardDataForWriter(clipboardData, documentFingerprint)
          .then((payload) => {
            if (payload.assets.length > 0) {
              onAssetsImported(payload.assets);
            }

            editor.update(() => {
              if (payload.sanitizedHtml.trim()) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(payload.sanitizedHtml, 'text/html');
                const nodes = $generateNodesFromDOM(editor, doc);

                if (nodes.length > 0) {
                  $insertNodes(nodes);
                  return;
                }
              }

              if (payload.plainText.trim()) {
                const paragraph = $createParagraphNode();
                paragraph.append($createTextNode(payload.plainText));
                $insertNodes([paragraph]);
                return;
              }

              if (payload.assets.length > 0) {
                const root = $getRoot();

                for (const asset of payload.assets) {
                  const paragraph = $createParagraphNode();
                  paragraph.append($createTextNode(`[Image: ${asset.id}]`));
                  root.append(paragraph);
                }
              }
            });
          });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [documentFingerprint, editor, onAssetsImported]);

  return null;
};
