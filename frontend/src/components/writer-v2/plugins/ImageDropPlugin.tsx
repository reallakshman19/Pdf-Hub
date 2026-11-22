import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, DRAGOVER_COMMAND, DROP_COMMAND } from 'lexical';
import type { WriterAssetRecordV2 } from '@/core/writer-v2/persistence/indexedDbWriterStore';
import { currentRichEditorBinding, insertRichEditorImageFiles } from '@/core/writer-v2/editor/richEditorImageInsertion';
import { useSessionStore } from '@/core/session/store';

export interface ImageDropPluginProps {
  documentFingerprint: string;
  onAssetsImported: (assets: WriterAssetRecordV2[]) => void;
}
export const ImageDropPlugin: React.FC<ImageDropPluginProps> = () => {
  const [editor] = useLexicalComposerContext();
  React.useEffect(() => {
    const unregisterDragover = editor.registerCommand<DragEvent>(DRAGOVER_COMMAND, event => {
      if (!event.dataTransfer?.types.includes('Files')) return false;
      event.preventDefault();
      return true;
    }, COMMAND_PRIORITY_HIGH);
    const unregisterDrop = editor.registerCommand<DragEvent>(DROP_COMMAND, event => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith('image/'));
      if (!files.length) return false;
      event.preventDefault();
      const binding = currentRichEditorBinding(editor);
      if (!binding) return true;
      void insertRichEditorImageFiles(editor, files).catch(error => {
        if (currentRichEditorBinding(editor) === binding) useSessionStore.getState().failSaveOperation(error instanceof Error ? error.message : String(error));
      });
      return true;
    }, COMMAND_PRIORITY_HIGH);
    return () => { unregisterDragover(); unregisterDrop(); };
  }, [editor]);
  return null;
};
