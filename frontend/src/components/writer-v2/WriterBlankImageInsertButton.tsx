import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useEditorStore } from '@/core/editor/store';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { insertBlankWriterImage } from '@/core/writer-v2/writerImageBoxActions';
import { captureDocumentMutationOwner, isDocumentMutationOwnerCurrent } from '@/core/session/mutationOwner';

export interface WriterBlankImageInsertButtonProps {
  disabled?: boolean;
}

export const WriterBlankImageInsertButton: React.FC<WriterBlankImageInsertButtonProps> = ({
  disabled = false,
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobile();
  const setActiveWriterTool = useWriterV2Store((state) => state.setActiveWriterTool);
  const setActiveMode = useEditorStore((state) => state.setActiveMode);
  const beginExportOperation = useSessionStore((state) => state.beginExportOperation);
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);

  const insertImage = async (file: File) => {
    const owner = captureDocumentMutationOwner();
    const initialWriter = useWriterV2Store.getState();
    const current = () => isDocumentMutationOwnerCurrent(owner)
      && useWriterV2Store.getState().currentDocumentFingerprint === initialWriter.currentDocumentFingerprint
      && useWriterV2Store.getState().documentMeta === initialWriter.documentMeta;
    try {
      beginExportOperation('Inserting image into blank Writer document...');
      const result = await insertBlankWriterImage(file);
      if (!current()) return;
      if (!result.changed) {
        failSaveOperation(result.message);
        return;
      }
      setActiveMode('write');
      setActiveWriterTool('select');
      completeSaveOperation(result.message);
    } catch (error) {
      if (current()) failSaveOperation(error instanceof Error ? error.message : String(error));
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
