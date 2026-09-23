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

export function guardNativeInteropAnnotationPatch(
  annotation: PdfAnnotation,
  patch: Partial<PdfAnnotation>,
): Partial<PdfAnnotation> {
  if (!isNativeRichTextReadOnly(annotation)) return patch;

  const guarded: Partial<PdfAnnotation> = { ...patch };

  if (patch.type !== undefined && patch.type !== annotation.type) {
    delete guarded.type;
  }

  if (patch.data) {
    guarded.data = guardRichTextDataPatch(annotation.data, patch.data);
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
    delete guarded[key];
  }
  return guarded;
}

function guardRichTextDataPatch(
  current: AnnotationData,
  incoming: AnnotationData,
): AnnotationData {
  const guarded: AnnotationData = { ...incoming };

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
        delete guardedStyle[key];
      }
    }

    guarded.style = guardedStyle;
  }

  return guarded;
}

function restoreOwnValue<
  TObject extends object,
  TKey extends keyof TObject,
>(
  target: TObject,
  source: TObject,
  key: TKey,
): void {
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    target[key] = source[key];
  } else {
    delete target[key];
  }
}
