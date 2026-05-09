import type { PlacedElement } from './types';
import {
  createEmptyRichTextModel,
  normalizeWriterElement,
} from './content-model';
import {
  syncElementContentFromModel,
  tryParseLegacyContentModel,
} from './content-serialization';

export function migratePlacedElementToContentModel(element: PlacedElement): PlacedElement {
  if (element.contentModel) {
    return syncElementContentFromModel(normalizeWriterElement(element));
  }

  const parsed = tryParseLegacyContentModel(element.content);

  if (parsed) {
    return syncElementContentFromModel(
      normalizeWriterElement({
        ...element,
        contentModel: parsed,
        sourceMeta: element.sourceMeta ?? {
          source: 'legacy',
          importedAt: new Date().toISOString(),
        },
      }),
    );
  }

  if (element.type === 'rich-text' || element.type === 'text') {
    return syncElementContentFromModel(
      normalizeWriterElement({
        ...element,
        type: 'rich-text',
        contentModel: createEmptyRichTextModel(element.content ?? ''),
        sourceMeta: element.sourceMeta ?? {
          source: 'legacy',
          importedAt: new Date().toISOString(),
        },
      }),
    );
  }

  return normalizeWriterElement(element);
}

export function migratePlacedElementsToContentModel(elements: PlacedElement[]): PlacedElement[] {
  return elements.map(migratePlacedElementToContentModel);
}

export function ensureWriterElementCompatibility(element: PlacedElement): PlacedElement {
  return migratePlacedElementToContentModel(element);
}
