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
import {
  admitWriterImageFile,
  encodeWriterImageDataUrl,
} from '@/core/admission/image/writerImageAdmission';

function createDroppedAssetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

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
          void admitWriterImageFile(file).then(
            (admitted) => {
              const dataUrl = encodeWriterImageDataUrl(admitted);
              const asset: WriterAssetRecordV2 = {
                id: createDroppedAssetId(),
                documentFingerprint,
                kind: 'image',
                mimeType: admitted.mimeType,
                dataUrl,
                width: admitted.width,
                height: admitted.height,
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
            },
            () => {
              // Not a real, admissible image (bad signature, unsupported
              // format, over a size/dimension bound) -- drop it silently,
              // other dropped files are unaffected.
            },
          );
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
