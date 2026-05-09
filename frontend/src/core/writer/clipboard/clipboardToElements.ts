import type { PlacedElement } from '../types';
import {
  createEmptyRichTextModel,
  createWriterId,
} from '../content-model';
import {
  syncElementContentFromModel,
} from '../content-serialization';
import type {
  ClipboardElementPlacement,
  ClipboardToElementsResult,
  WriterClipboardPayload,
} from './types';

export function clipboardPayloadToElements(
  payload: WriterClipboardPayload,
  placement: ClipboardElementPlacement,
): ClipboardToElementsResult {
  const base = {
    id: createWriterId('element'),
    pageNumber: placement.pageNumber,
    x: placement.x,
    y: placement.y,
    zIndex: placement.zIndex ?? 0,
    locked: false,
    hidden: false,
  };

  const importedAt = new Date().toISOString();

  if (payload.kind === 'table' && payload.table) {
    const element: PlacedElement = syncElementContentFromModel({
      ...base,
      type: 'table',
      width: placement.width ?? placement.defaultWidth ?? 420,
      height: placement.height ?? placement.defaultHeight ?? 160,
      content: '',
      contentModel: payload.table,
      sourceMeta: {
        source: 'clipboard-table',
        mimeType: payload.mimeType,
        importedAt,
        warning: payload.warning,
      },
      style: {
        opacity: 1,
      },
    });

    return { elements: [element], warning: payload.warning };
  }

  if ((payload.kind === 'html' || payload.kind === 'plain-text') && (payload.richText || payload.plainText)) {
    const richText = payload.richText ?? createEmptyRichTextModel(payload.plainText ?? '');

    const element: PlacedElement = syncElementContentFromModel({
      ...base,
      type: 'rich-text',
      width: placement.width ?? placement.defaultWidth ?? 320,
      height: placement.height ?? placement.defaultHeight ?? 96,
      content: '',
      contentModel: richText,
      sourceMeta: {
        source: payload.kind === 'html' ? 'clipboard-html' : 'clipboard-text',
        mimeType: payload.mimeType,
        importedAt,
        warning: payload.warning,
      },
      style: {
        fontSize: 12,
        fontFamily: 'Arial',
        color: '#111827',
        backgroundColor: 'transparent',
        opacity: 1,
      },
    });

    return { elements: [element], warning: payload.warning };
  }

  if (payload.kind === 'image' && payload.image) {
    const naturalWidth = payload.image.naturalWidth || 240;
    const naturalHeight = payload.image.naturalHeight || 160;
    const targetWidth = placement.width ?? Math.min(naturalWidth, placement.defaultWidth ?? 320);
    const ratio = naturalHeight > 0 && naturalWidth > 0 ? naturalHeight / naturalWidth : 0.66;
    const targetHeight = placement.height ?? Math.max(1, Math.round(targetWidth * ratio));

    const element: PlacedElement = syncElementContentFromModel({
      ...base,
      type: 'image',
      width: targetWidth,
      height: targetHeight,
      content: '',
      contentModel: payload.image,
      sourceMeta: {
        source: 'clipboard-image',
        mimeType: payload.mimeType,
        importedAt,
        warning: payload.warning,
      },
      style: {
        opacity: payload.image.opacity ?? 1,
      },
    });

    return { elements: [element], warning: payload.warning };
  }

  return {
    elements: [],
    warning: payload.warning ?? 'Clipboard payload did not produce writer elements.',
  };
}
