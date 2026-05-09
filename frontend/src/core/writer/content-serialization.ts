// @ts-nocheck
import type {
  PlacedElement,
  WriterContentModel,
  WriterImageModel,
  WriterRichTextModel,
  WriterTableModel,
} from './types';
import {
  createEmptyRichTextModel,
  normalizeWriterContentModel,
} from './content-model';

export function writerContentModelToLegacyContent(model: WriterContentModel): string {
  if (model.kind === 'rich-text') return richTextToPlainText(model);
  if (model.kind === 'table') return tableModelToLegacyJson(model);
  if (model.kind === 'image') return model.src;
  return '';
}

export function syncElementContentFromModel(element: PlacedElement): PlacedElement {
  if (!element.contentModel) return element;

  return {
    ...element,
    contentModel: normalizeWriterContentModel(element.contentModel),
    content: writerContentModelToLegacyContent(element.contentModel),
  };
}

export function tryParseLegacyContentModel(content: string): WriterContentModel | null {
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as unknown;

    if (
      parsed &&
      typeof parsed === 'object' &&
      'kind' in parsed &&
      'version' in parsed
    ) {
      return normalizeWriterContentModel(parsed as WriterContentModel);
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { rows?: unknown }).rows) &&
      Array.isArray((parsed as { columns?: unknown }).columns)
    ) {
      return normalizeWriterContentModel({
        kind: 'table',
        ...(parsed as WriterTableModel),
      });
    }
  } catch {
    return null;
  }

  return null;
}

export function legacyContentToRichTextModel(content: string): WriterRichTextModel {
  return createEmptyRichTextModel(String(content ?? ''));
}

export function richTextToPlainText(model: WriterRichTextModel): string {
  return model.blocks
    .map((block) => block.runs.map((run) => run.text).join(''))
    .join('\n');
}

export function tableModelToLegacyJson(model: WriterTableModel): string {
  return JSON.stringify({
    columns: model.columns,
    rows: model.rows,
    style: model.style,
  });
}

export function imageModelToLegacyContent(model: WriterImageModel): string {
  return model.src;
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}
