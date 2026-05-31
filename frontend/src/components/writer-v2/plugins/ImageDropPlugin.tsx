import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
} from 'lexical';
import { $createImageNode } from '@/core/writer-v2/lexical-nodes/ImageNode';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';

export interface ImageDropPluginProps {
  documentFingerprint: string;
  onAssetsImported: (assets: WriterAssetRecordV2[]) => void;
}

export const ImageDropPlugin: React.FC<ImageDropPluginProps> = ({
  documentFingerprint,
  onAssetsImported,
}) => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    const unregisterDragover = editor.registerCommand<DragEvent>(
      DRAGOVER_COMMAND,
      (event) => {
        const hasFiles = event.dataTransfer?.types.includes('Files');
        if (hasFiles) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterDrop = editor.registerCommand<DragEvent>(
      DROP_COMMAND,
      (event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        const imageFiles = Array.from(files).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (imageFiles.length === 0) return false;

        event.preventDefault();

        for (const file of imageFiles) {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const asset: WriterAssetRecordV2 = {
              id: 'asset_' + Math.random().toString(36).substring(2, 11),
              documentFingerprint,
              kind: 'image',
              mimeType: file.type,
              dataUrl,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            onAssetsImported([asset]);

            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                const imageNode = $createImageNode(dataUrl, file.name);
                selection.insertNodes([imageNode]);
              }
            });
          };
          reader.readAsDataURL(file);
        }

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      unregisterDragover();
      unregisterDrop();
    };
  }, [documentFingerprint, editor, onAssetsImported]);

  return null;
};
