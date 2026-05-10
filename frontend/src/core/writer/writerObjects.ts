import type { PlacedElement, WriterStyles } from './types';

export function normalizeWriterElement(
  element: Partial<PlacedElement> & Pick<PlacedElement, 'id' | 'type' | 'pageNumber'>,
): PlacedElement {
  return {
    id: element.id,
    type: element.type,
    pageNumber: element.pageNumber,
    x: finiteOr(element.x, 0),
    y: finiteOr(element.y, 0),
    width: positiveOr(element.width, 120),
    height: positiveOr(element.height, 40),
    content: element.content ?? '',
    styles: normalizeWriterStyles(element.styles ?? element.style),
    style: element.style ?? element.styles,
    contentModel: element.contentModel,
    zIndex: Number.isFinite(element.zIndex) ? Number(element.zIndex) : 0,
    locked: Boolean(element.locked),
    hidden: Boolean(element.hidden),
    name: element.name,
    sourceMeta: element.sourceMeta,
  };
}

export function normalizeWriterStyles(styles?: WriterStyles): WriterStyles {
  return {
    fontSize: finiteOptional(styles?.fontSize),
    fontFamily: styles?.fontFamily,
    color: styles?.color,
    backgroundColor: styles?.backgroundColor,
    padding: finiteOptional(styles?.padding),
    opacity: clampOptional(styles?.opacity, 0, 1),
    borderWidth: finiteOptional(styles?.borderWidth),
    borderColor: styles?.borderColor,
    lineHeight: finiteOptional(styles?.lineHeight),
    fontWeight: styles?.fontWeight,
    fontStyle: styles?.fontStyle,
    textAlign: styles?.textAlign,
  };
}

export function visibleWriterElementsForExport(
  elements: PlacedElement[],
): PlacedElement[] {
  return elements
    .filter((element) => !element.hidden)
    .map((element) => normalizeWriterElement(element))
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return (a.zIndex ?? 0) - (b.zIndex ?? 0);
    });
}

export function writerElementDisplayName(element: PlacedElement): string {
  if (element.name?.trim()) return element.name.trim();

  if (element.type === 'rich-text') return 'Text';
  if (element.type === 'image') return 'Image';
  if (element.type === 'table') return 'Table';

  return 'Writer object';
}

export function cloneWriterElement(
  element: PlacedElement,
  overrides: Partial<PlacedElement> = {},
): PlacedElement {
  return normalizeWriterElement({
    ...element,
    ...overrides,
    id: overrides.id ?? element.id,
    styles: {
      ...(element.styles ?? {}),
      ...(overrides.styles ?? {}),
    },
    style: {
      ...(element.style ?? element.styles ?? {}),
      ...(overrides.style ?? {}),
    },
  });
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function finiteOptional(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampOptional(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}