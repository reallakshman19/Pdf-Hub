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

const NATIVE_AP_VISUAL_KEYS = [
  'text', 'content', 'fontSize', 'fontWeight', 'fontStyle', 'fontFamily',
  'textAlign', 'textColor', 'lineHeight', 'backgroundColor', 'borderColor',
  'borderWidth', 'borderStyle', 'borderRadius', 'opacity', 'style',
  'anchor', 'knee', 'leaderStyle', 'arrowHead', 'points', 'paths',
  'lineStartCap', 'lineEndCap', 'rotation', 'nativeMarkupTurn',
  'nativeBoxShapeTurn', 'textMarkupQuads',
] as const satisfies readonly (keyof AnnotationData)[];

/**
 * A source /AP is a read-only snapshot. Once the user changes the visible
 * semantics, use the live editor preview rather than displaying stale artwork.
 * Moving or scaling a simple rectangle can retain its original artwork; moving
 * a callout changes the relationship between its body and anchored leader.
 */
export function markNativeAppearanceDirty(
  original: PdfAnnotation,
  next: PdfAnnotation,
): PdfAnnotation {
  if (!original.data.nativeAppearanceImported || original.data.nativeAppearanceDirty) return next;
  const visualDataChanged = NATIVE_AP_VISUAL_KEYS.some((key) => {
    const before = original.data[key];
    const after = next.data[key];
    return before !== after && JSON.stringify(before) !== JSON.stringify(after);
  });
  const calloutBodyMoved = original.type === 'callout' && (
    original.rect.x !== next.rect.x
    || original.rect.y !== next.rect.y
    || original.rect.width !== next.rect.width
    || original.rect.height !== next.rect.height
  );
  if (!visualDataChanged && !calloutBodyMoved && original.type === next.type) return next;
  return {
    ...next,
    data: { ...next.data, nativeAppearanceDirty: true },
  };
}

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

export function isImportedStampArtworkReadOnly(annotation: PdfAnnotation): boolean {
  return annotation.type === 'stamp' && (annotation.data.nativeStampAppearanceKind === 'imported'
    || (Boolean(annotation.data.hasCustomAppearance) && annotation.data.nativeStampAppearanceKind !== 'generated'));
}

export function isImportedBoxArtworkReadOnly(annotation: PdfAnnotation): boolean {
  return (annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse' || annotation.type === 'shape-cloud')
    && Boolean(annotation.data.nativeBoxShapeImported && annotation.data.nativeBoxShapeHasAppearance)
    && !annotation.data.nativeBoxShapeGenerated;
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
  if (patch.data?.nativeInterop?.fidelityClass === 'MUTATED_USER_EDIT') {
    return patch;
  }
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

  if (patch.data) {
    const rootGuarded = isNativeRichTextReadOnly(annotation)
      ? guardRichTextDataPatch(annotation.data, patch.data)
      : { ...annotation.data, ...patch.data };
    const nextData = guardRichReplyDataPatch(
      annotation.data,
      rootGuarded,
    );

    if (shallowObjectEquivalent(annotation.data, nextData)) {
      Reflect.deleteProperty(guarded, 'data');
    } else {
      guarded.data = nextData;
    }
  }

  return guarded;
}

export function guardNativeInteropStylePatch<T extends Partial<AnnotationStyle>>(
  annotation: PdfAnnotation,
  stylePatch: T,
): T {
  if (!isNativeRichTextReadOnly(annotation) && !isImportedStampArtworkReadOnly(annotation) && !isImportedBoxArtworkReadOnly(annotation)) return stylePatch;

  const guarded = { ...stylePatch };
  if (isNativeRichTextReadOnly(annotation)) {
    for (const key of RICH_TEXT_PROTECTED_STYLE_KEYS) Reflect.deleteProperty(guarded, key);
  }
  if (isImportedStampArtworkReadOnly(annotation) || isImportedBoxArtworkReadOnly(annotation)) {
    for (const key of [
      'fill', 'stroke', 'strokeWidth', 'backgroundColor', 'borderColor', 'borderWidth',
      'borderStyle', 'borderRadius', 'opacity', 'textColor', 'fontSize', 'fontWeight',
      'fontStyle', 'fontFamily', 'textAlign', 'lineHeight', 'autoSize',
    ]) Reflect.deleteProperty(guarded, key);
  }
  return guarded;
}

function guardRichReplyDataPatch(
  current: AnnotationData,
  incoming: AnnotationData,
): AnnotationData {
  const currentReview = current.review;
  const incomingReview = incoming.review;
  if (!currentReview || !incomingReview) return incoming;

  const richById = new Map(
    currentReview.replies
      .filter(
        (reply) =>
          reply.nativeInterop?.fidelityClass === 'NATIVE_PRESERVED_READ_ONLY'
          && reply.nativeInterop.reason === 'RICH_TEXT'
          && reply.nativeInterop.richText === true,
      )
      .map((reply) => [reply.id, reply]),
  );
  if (richById.size === 0) return incoming;

  const seen = new Set<string>();
  const replies = incomingReview.replies.map((reply) => {
    const protectedReply = richById.get(reply.id);
    if (!protectedReply) return reply;
    seen.add(reply.id);
    return {
      ...reply,
      content: protectedReply.content,
      nativeInterop: protectedReply.nativeInterop,
    };
  });

  for (const protectedReply of richById.values()) {
    if (!seen.has(protectedReply.id)) {
      replies.push(protectedReply);
    }
  }

  const review = {
    ...incomingReview,
    replies,
  };

  return {
    ...incoming,
    review: jsonEquivalent(currentReview, review)
      ? currentReview
      : review,
  };
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

function jsonEquivalent(
  left: unknown,
  right: unknown,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
