import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical';
import { insertTableFromData } from '@/core/writer-v2/lexical-nodes/tableHelpers';
import { parseTabularText } from '@/core/writer-v2/clipboard/parseTabularText';
import { currentRichEditorBinding } from '@/core/writer-v2/editor/richEditorImageInsertion';

export const TablePastePlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    return editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData || !currentRichEditorBinding(editor) || clipboardData.getData('text/html') || clipboardData.files.length) return false;

        const text = clipboardData.getData('text/plain') ?? '';
        const tableData = parseTabularText(text);

        if (tableData && tableData.length > 0) {
          event.preventDefault();
          insertTableFromData(editor, tableData);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
};
