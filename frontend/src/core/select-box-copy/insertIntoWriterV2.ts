import { v4 as uuidv4 } from 'uuid';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { createRichTextBoxElement } from '@/core/writer-v2/writerElementFactory';
import { createPlainTextEditorStateJson } from '@/core/writer-v2/editor/writerEditorState';
import { resolveRecommendedMode, type SelectBoxInsertMode } from './selectBoxCopyMode';
import type { SelectBoxCopyResult } from './types';

export function createWriterElementFromSelectBoxCopy(input: {
  result: SelectBoxCopyResult;
  documentFingerprint: string;
  zIndex?: number;
  mode?: SelectBoxInsertMode;
  imageAssetId?: string;
}): WriterElementV2 {
  const { result } = input;
  const requested = input.mode ?? 'auto';
  const mode = requested === 'auto' ? resolveRecommendedMode(result) : requested;
  if (mode !== 'image' && result.partialTextItems) throw new Error('Selection cuts native text runs. Expand selection or use image mode.');
  if (mode === 'text' && !result.plainText.trim()) throw new Error('No native text to insert. Use image mode.');
  if (mode === 'table' && !result.table) throw new Error('No table detected in this selection.');

  if (mode === 'image') {
    if (!input.imageAssetId) {
      throw new Error('Cannot insert Select Box Copy image without imageAssetId.');
    }

    return createImageBoxFromSelection({
      result,
      documentFingerprint: input.documentFingerprint,
      zIndex: input.zIndex,
      imageAssetId: input.imageAssetId,
    });
  }

  if (
    mode === 'table' && result.table
  ) {
    return createTableBoxFromSelection(input);
  }

  return createRichTextBoxElement({
    documentFingerprint: input.documentFingerprint,
    pageIndex: result.pageIndex,
    rect: result.pdfRect,
    text: result.plainText,
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

function createImageBoxFromSelection(input: {
  result: SelectBoxCopyResult;
  documentFingerprint: string;
  zIndex?: number;
  imageAssetId: string;
}): WriterElementV2 {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    documentFingerprint: input.documentFingerprint,
    pageIndex: input.result.pageIndex,
    type: 'imageBox',
    rect: input.result.pdfRect,
    imageAssetId: input.imageAssetId,
    assetIds: [input.imageAssetId],
    editorStateJson: createPlainTextEditorStateJson('[Copied image selection]'),
    plainText: '[Copied image selection]',
    style: {
      backgroundColor: 'rgba(255, 255, 255, 0.0)',
      borderColor: '#0f766e',
      borderWidth: 1,
      padding: 0,
      opacity: 1,
      zIndex: input.zIndex ?? 100,
    },
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };
}