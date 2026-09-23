import type {
  AnnotationData,
  AnnotationStyle,
  PdfAnnotation,
} from './types';

const RICH_TEXT_PROTECTED_DATA_KEYS = [
  'text',
  'content',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontFamily',
  'textAlign',
  'textColor',
  'lineHeight',
  'autoSize',
] as const satisfies readonly (keyof AnnotationData)[];

const RICH_TEXT_PROTECTED_STYLE_KEYS = [
  'textColor',
  'fontSize',
  'fontWeight',
  'textAlign',
] as const satisfies readonly (keyof AnnotationStyle)[];

export function isNativeRichTextReadOnly(
  annotation: PdfAnnotation,
): boolean {
  const interop = annotation.data.nativeInterop;
  return Boolean(
    interop?.fidelityClass === 'NATIVE_PRESERVED_READ_ONLY'
    && interop.reason === 'RICH_TEXT'
    && interop.richText === true,
  );
}

export function hasNativeRichTextSemantics(
  annotation: PdfAnnotation,
): boolean {
  if (isNativeRichTextReadOnly(annotation)) return true;
  return Boolean(
    annotation.data.review?.replies.some(
      (reply) =>
        reply.nativeInterop?.fidelityClass === 'NATIVE_PRESERVED_READ_ONLY'
        && reply.nativeInterop.reason === 'RICH_TEXT'
        && reply.nativeInterop.richText === true,
    ),
  );
}

export function guardNativeInteropAnnotationPatch(
  annotation: PdfAnnotation,
  patch: Partial<PdfAnnotation>,
): Partial<PdfAnnotation> {
  if (!hasNativeRichTextSemantics(annotation)) return patch;

  const guarded: Partial<PdfAnnotation> = { ...patch };

  // Type conversion or manual page reassignment can detach a native /RC object
  // (including one owned by a reply) from the source dictionary needed to
  // preserve it. Page-graph remaps use applyPageRemap and bypass this user edit guard.
  if (patch.type !== undefined) {
    Reflect.deleteProperty(guarded, 'type');
  }
  if (patch.pageNumber !== undefined) {
    Reflect.deleteProperty(guarded, 'pageNumber');
  }
  if (patch.pageId !== undefined) {
    Reflect.deleteProperty(guarded, 'pageId');
  }

  if (patch.data && isNativeRichTextReadOnly(annotation)) {
    const nextData = guardRichTextDataPatch(annotation.data, patch.data);
    if (shallowObjectEquivalent(annotation.data, nextData)) {
      Reflect.deleteProperty(guarded, 'data');
    } else {
      guarded.data = nextData;
    }
  }

  return guarded;
}

export function guardNativeInteropStylePatch(
  annotation: PdfAnnotation,
  stylePatch: Partial<AnnotationStyle>,
): Partial<AnnotationStyle> {
  if (!isNativeRichTextReadOnly(annotation)) return stylePatch;

  const guarded = { ...stylePatch };
  for (const key of RICH_TEXT_PROTECTED_STYLE_KEYS) {
    Reflect.deleteProperty(guarded, key);
  }
  return guarded;
}

function guardRichTextDataPatch(
  current: AnnotationData,
  incoming: AnnotationData,
): AnnotationData {
  const guarded: AnnotationData = { ...current, ...incoming };

  for (const key of RICH_TEXT_PROTECTED_DATA_KEYS) {
    restoreOwnValue(guarded, current, key);
  }

  const incomingStyle =
    incoming.style && typeof incoming.style === 'object'
      ? incoming.style
      : undefined;
  if (incomingStyle) {
    const currentStyle =
      current.style && typeof current.style === 'object'
        ? current.style
        : undefined;
    const guardedStyle: AnnotationStyle = { ...incomingStyle };

    for (const key of RICH_TEXT_PROTECTED_STYLE_KEYS) {
      if (currentStyle) {
        restoreOwnValue(guardedStyle, currentStyle, key);
      } else {
        Reflect.deleteProperty(guardedStyle, key);
      }
    }

    guarded.style =
      currentStyle && shallowObjectEquivalent(currentStyle, guardedStyle)
        ? currentStyle
        : guardedStyle;
  }

  return guarded;
}

function restoreOwnValue(
  target: object,
  source: object,
  key: PropertyKey,
): void {
  const sourceRecord = source as Record<PropertyKey, unknown>;
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    Reflect.set(target, key, sourceRecord[key]);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

function shallowObjectEquivalent(
  left: object,
  right: object,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;

  return leftEntries.every(([key, value]) =>
    Object.prototype.hasOwnProperty.call(right, key)
    && Object.is(value, (right as Record<string, unknown>)[key]));
}
