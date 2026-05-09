import type {
  PlacedElement,
  WriterElementInput,
  WriterImageModel,
  WriterRichTextModel,
  WriterTableModel,
} from '../types';

export type ClipboardPayloadKind =
  | 'plain-text'
  | 'html'
  | 'table'
  | 'image'
  | 'empty'
  | 'unsupported';

export interface WriterClipboardPayload {
  kind: ClipboardPayloadKind;
  plainText?: string;
  html?: string;
  table?: WriterTableModel;
  richText?: WriterRichTextModel;
  image?: WriterImageModel;
  mimeType?: string;
  warning?: string;
}

export interface ClipboardElementPlacement extends WriterElementInput {
  defaultWidth?: number;
  defaultHeight?: number;
}

export interface ClipboardToElementsResult {
  elements: PlacedElement[];
  warning?: string;
}
