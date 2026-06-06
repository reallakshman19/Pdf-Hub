import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { createImageBoxElement } from '@/core/writer-v2/writerElementFactory';
import { createWriterImageAssetFromFile } from '@/core/writer-v2/writerImageAsset';

export interface WriterBlankImageInsertButtonProps {
  disabled?: boolean;
}

export const WriterBlankImageInsertButton: React.FC<WriterBlankImageInsertButtonProps> = ({
  disabled = false,
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobile();
  const documentMeta = useWriterV2Store((state) => state.documentMeta);
  const addWriterAssets = useWriterV2Store((state) => state.addWriterAssets);
  const dispatchWriterCommand = useWriterV2Store((state) => state.dispatchWriterCommand);
  const setActiveWriterTool = useWriterV2Store((state) => state.setActiveWriterTool);
  const setActiveMode = useEditorStore((state) => state.setActiveMode);
  const beginExportOperation = useSessionStore((state) => state.beginExportOperation);
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);

  const insertImage = async (file: File) => {
    if (!documentMeta || documentMeta.mode !== 'blankDocument') {
      failSaveOperation('Open or create a blank Writer document before inserting images.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      failSaveOperation('Only image files can be inserted into a blank Writer document.');
      return;
    }

    try {
      beginExportOperation('Inserting image into blank Writer document...');

      const now = new Date().toISOString();
      const asset = await createWriterImageAssetFromFile(
        file,
        documentMeta.documentFingerprint,
        now,
      );
      const currentState = useWriterV2Store.getState();
      const maxZIndex = currentState.elements.reduce(
        (max, element) => Math.max(max, element.style.zIndex),
        0,
      );
      const usableWidth = documentMeta.pageSetup.width
        - documentMeta.pageSetup.marginLeft
        - documentMeta.pageSetup.marginRight;
      const usableHeight = documentMeta.pageSetup.height
        - documentMeta.pageSetup.marginTop
        - documentMeta.pageSetup.marginBottom;
      const width = Math.max(72, Math.min(320, usableWidth));
      const height = Math.max(72, Math.min(220, usableHeight));
      const element = createImageBoxElement({
        documentFingerprint: documentMeta.documentFingerprint,
        pageIndex: 0,
        imageAssetId: asset.id,
        assetIds: [asset.id],
        rect: {
          x: documentMeta.pageSetup.marginLeft,
          y: documentMeta.pageSetup.height - documentMeta.pageSetup.marginTop - height,
          width,
          height,
        },
        text: file.name || 'Image',
        zIndex: maxZIndex + 1,
      });

      addWriterAssets([asset]);
      dispatchWriterCommand({
        type: 'ADD_WRITER_ELEMENT',
        element,
      });
      setActiveMode('write');
      setActiveWriterTool('select');
      completeSaveOperation('Image inserted into blank Writer document.');
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    } finally {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <Tooltip content={disabled ? 'Open or create a blank Writer document to insert images' : 'Insert an image into the blank document'}>
        <Button
          variant="ghost"
          size={isMobile ? 'icon' : 'sm'}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          title={disabled ? 'Open or create a blank Writer document to insert images' : 'Insert an image into the blank document'}
          aria-label="Image"
          className={isMobile ? 'h-8 w-8 min-w-[32px] md:h-8 md:w-8' : undefined}
        >
          {isMobile ? (
            <ImageIcon className="w-[18px] h-[18px]" />
          ) : (
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" />
              Image
            </span>
          )}
        </Button>
      </Tooltip>

      <input
        ref={inputRef}
        aria-label="Insert image into blank Writer document"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          if (file) {
            void insertImage(file);
          }
        }}
      />
    </>
  );
};
