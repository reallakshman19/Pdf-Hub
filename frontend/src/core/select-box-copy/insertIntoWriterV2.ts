import { v4 as uuidv4 } from 'uuid';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { createRichTextBoxElement } from '@/core/writer-v2/writerElementFactory';
import { createPlainTextEditorStateJson } from '@/core/writer-v2/editor/writerEditorState';
import type { SelectBoxCopyResult } from './types';

export function createWriterElementFromSelectBoxCopy(input: {
  result: SelectBoxCopyResult;
  documentFingerprint: string;
  zIndex?: number;
}): WriterElementV2 {
  const { result } = input;

  if (result.table && result.table.confidence >= 0.75) {
    return createTableBoxFromSelection(input);
  }

  return createRichTextBoxElement({
    documentFingerprint: input.documentFingerprint,
    pageIndex: result.pageIndex,
    rect: result.pdfRect,
    text: result.plainText || 'Copied selection',
    zIndex: input.zIndex,
  });
}

function createTableBoxFromSelection(input: {
  result: SelectBoxCopyResult;
  documentFingerprint: string;
  zIndex?: number;
}): WriterElementV2 {
  const now = new Date().toISOString();
  const plainText = input.result.table?.tsv ?? input.result.plainText;

  return {
    id: uuidv4(),
    documentFingerprint: input.documentFingerprint,
    pageIndex: input.result.pageIndex,
    type: 'tableBox',
    rect: input.result.pdfRect,
    editorStateJson: createPlainTextEditorStateJson(plainText),
    plainText,
    tableData: input.result.table?.tableData,
    style: {
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      borderColor: '#0f766e',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
      zIndex: input.zIndex ?? 100,
    },
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };
}