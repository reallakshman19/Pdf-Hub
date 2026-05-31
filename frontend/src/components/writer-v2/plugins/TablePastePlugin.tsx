import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical';
import { insertTableFromData } from '@/core/writer-v2/lexical-nodes/tableHelpers';

function parseTabularData(text: string): string[][] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const tsvLines = trimmed.split(/\r?\n/).map((line) => line.split('\t'));
  const tsvCols = tsvLines[0].length;
  if (tsvCols > 1 && tsvLines.every((line) => line.length === tsvCols)) {
    return tsvLines;
  }

  const csvLines = trimmed.split(/\r?\n/).map((line) => line.split(','));
  const csvCols = csvLines[0].length;
  if (csvCols > 1 && csvLines.every((line) => line.length === csvCols)) {
    return csvLines;
  }

  return null;
}

export const TablePastePlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    return editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const text = clipboardData.getData('text/plain') ?? '';
        const tableData = parseTabularData(text);

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
