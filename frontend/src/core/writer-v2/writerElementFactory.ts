import { v4 as uuidv4 } from 'uuid';
import type { PdfPoint, PdfRect, WriterElementV2 } from './types';
import { createPlainTextEditorStateJson } from './editor/writerEditorState';

export interface WriterFactoryInput {
  documentFingerprint: string;
  pageIndex: number;
  rect: PdfRect;
  text?: string;
  editorStateJson?: string;
  zIndex?: number;
}

export interface CalloutFactoryInput extends WriterFactoryInput {
  anchorPoint?: PdfPoint;
}

export interface ImageBoxFactoryInput extends WriterFactoryInput {
  imageAssetId: string;
  assetIds?: string[];
  imageWidth?: number;
  imageHeight?: number;
}

export function createRichTextBoxElement(input: WriterFactoryInput): WriterElementV2 {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    documentFingerprint: input.documentFingerprint,
    pageIndex: input.pageIndex,
    type: 'richTextBox',
    rect: input.rect,
    editorStateJson: input.editorStateJson ?? createPlainTextEditorStateJson(input.text ?? ''),
    plainText: input.text ?? '',
    style: {
      backgroundColor: 'rgba(255, 255, 255, 0.88)',
      borderColor: '#2563eb',
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

export function createTextCalloutElement(input: CalloutFactoryInput): WriterElementV2 {
  const base = createRichTextBoxElement(input);

  return {
    ...base,
    type: 'textCallout',
    callout: {
      anchorPoint: input.anchorPoint,
      leaderStyle: 'arrow',
      leaderColor: '#475569',
      leaderWidth: 1.5,
    },
    style: {
      ...base.style,
      borderColor: '#475569',
    },
  };
}

export function createReviewLabelElement(input: WriterFactoryInput): WriterElementV2 {
  const base = createRichTextBoxElement(input);

  return {
    ...base,
    type: 'reviewLabel',
    style: {
      ...base.style,
      backgroundColor: '#fef3c7',
      borderColor: '#d97706',
      borderWidth: 1,
    },
  };
}

export function createTextStampElement(input: WriterFactoryInput): WriterElementV2 {
  const base = createRichTextBoxElement(input);

  return {
    ...base,
    type: 'textStamp',
    style: {
      ...base.style,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 0,
      fontSize: 22,
      textColor: '#b91c1c',
      opacity: 0.75,
    },
  };
}

export function createRichNoteElement(input: WriterFactoryInput): WriterElementV2 {
  const base = createRichTextBoxElement(input);

  return {
    ...base,
    type: 'richNote',
    style: {
      ...base.style,
      backgroundColor: '#fefce8',
      borderColor: '#ca8a04',
      borderWidth: 1,
      padding: 10,
    },
  };
}

export function createTableBoxElement(input: WriterFactoryInput): WriterElementV2 {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    documentFingerprint: input.documentFingerprint,
    pageIndex: input.pageIndex,
    type: 'tableBox',
    rect: input.rect,
    plainText: input.text ?? 'Table',
    tableData: createDefaultTableData(),
    style: {
      backgroundColor: '#ffffff',
      borderColor: '#94a3b8',
      borderWidth: 1,
      padding: 0,
      opacity: 1,
      zIndex: input.zIndex ?? 100,
      fontSize: 11,
      fontFamily: 'Helvetica',
      textColor: '#111827',
    },
    createdAt: now,
    updatedAt: now,
    locked: false,
    hidden: false,
  };
}

export function createImageBoxElement(input: ImageBoxFactoryInput): WriterElementV2 {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    documentFingerprint: input.documentFingerprint,
    pageIndex: input.pageIndex,
    type: 'imageBox',
    rect: input.rect,
    plainText: input.text ?? 'Image',
    imageAssetId: input.imageAssetId,
    assetIds: input.assetIds ?? [input.imageAssetId],
    style: {
      backgroundColor: 'transparent',
      borderColor: '#94a3b8',
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

function createDefaultTableData(): NonNullable<WriterElementV2['tableData']> {
  return {
    columns: [
      { id: uuidv4(), label: 'Column 1', width: 1 },
      { id: uuidv4(), label: 'Column 2', width: 1 },
      { id: uuidv4(), label: 'Column 3', width: 1 },
    ],
    rows: [
      {
        id: uuidv4(),
        cells: [
          { id: uuidv4(), text: 'A1' },
          { id: uuidv4(), text: 'B1' },
          { id: uuidv4(), text: 'C1' },
        ],
      },
      {
        id: uuidv4(),
        cells: [
          { id: uuidv4(), text: 'A2' },
          { id: uuidv4(), text: 'B2' },
          { id: uuidv4(), text: 'C2' },
        ],
      },
    ],
  };
}
