import { v4 as uuidv4 } from 'uuid';
import type { PdfPoint, PdfRect, WriterElementV2 } from './types';
import { createPlainTextEditorStateJson } from './editor/writerEditorState';

export interface WriterFactoryInput {
  documentFingerprint: string;
  pageIndex: number;
  rect: PdfRect;
  text?: string;
  zIndex?: number;
}

export interface CalloutFactoryInput extends WriterFactoryInput {
  anchorPoint?: PdfPoint;
}

export function createRichTextBoxElement(input: WriterFactoryInput): WriterElementV2 {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    documentFingerprint: input.documentFingerprint,
    pageIndex: input.pageIndex,
    type: 'richTextBox',
    rect: input.rect,
    editorStateJson: createPlainTextEditorStateJson(input.text ?? ''),
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
