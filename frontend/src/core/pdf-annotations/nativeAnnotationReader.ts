import type { PdfAnnotation } from '@/core/annotations/types';
import { isAnnotationType } from '@/core/annotations/annotationTypes';
import type { ReviewMetadata, ReviewReply, ReviewStatus } from '@/core/review/types';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { calloutBodyRect } from './freeTextGeometry';
import { fingerprintStampAppearance, verifyStampAppearanceFingerprint, verifyStampRotationFingerprint } from './nativeStampProvenance';
import { BOX_GENERATED_AP_ORIENTATION_KEY, verifyGeneratedBoxAppearanceFingerprint } from './nativeBoxShapeProvenance';
import { fingerprintNativeCloudRotation, supportsNativeCloudRotation } from './nativeCloudRotation';
import { fingerprintNativeMarkupRotation, readNativeMarkupPreviewOffset } from './nativeMarkupRotation';
import { verifyGeneratedMarkupAppearance } from './nativeMarkupProvenance';
import { orderNativeReviewStates } from './nativeReviewStateOrder';
import {
  createMarkupSpace, pdfPointToView,
  pdfRectToViewRect, type MarkupSpace,
} from './markupGeometry';

type PDFArray = import('pdf-lib').PDFArray;
type PDFDict = import('pdf-lib').PDFDict;
type PDFPage = import('pdf-lib').PDFPage;
type PdfLibModule = typeof import('pdf-lib');

export interface NativeAnnotationReadResult {
  annotations: PdfAnnotation[];
  importedCount: number;
  skippedCount: number;
}

interface NativeRecord {
  refKey: string | null;
  dict: PDFDict;
  index: number;
}

/**
 * Reads supported native PDF annotations into PDF Hub's application model.
 *
 * PDF Hub-authored annotations round-trip through custom PDFHub* metadata while
 * still remaining standard PDF /Annot objects for other viewers. External
 * annotations are imported best-effort from standard annotation fields.
 */
export async function readNativePdfAnnotations(
  bytes: Uint8Array,
): Promise<NativeAnnotationReadResult> {
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(bytes);

  const annotations: PdfAnnotation[] = [];
  let skippedCount = 0;

  for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
    const page = doc.getPage(pageIndex);
    const records = readPageAnnotationRecords(page, lib);
    const roots = records.filter((record) => !record.dict.get(lib.PDFName.of('IRT')));
    const related = records.filter((record) => Boolean(record.dict.get(lib.PDFName.of('IRT'))));
    const states = related.filter((record) => isReviewStateRecord(record.dict, lib));
    const replies = related.filter((record) => isReplyRecord(record.dict, lib));

    skippedCount += related.length - states.length - replies.length;

    const rootByRef = new Map<string, PdfAnnotation>();
    const rootRecordByRef = new Map<string, NativeRecord>();
    const recordByRef = new Map(
      records
        .filter((record): record is NativeRecord & { refKey: string } => Boolean(record.refKey))
        .map((record) => [record.refKey, record]),
    );

    for (const record of roots) {
      const parsed = parseRootAnnotation(
        record.dict,
        page,
        pageIndex + 1,
        record.index,
        lib,
      );

      if (!parsed) {
        skippedCount += 1;
        continue;
      }

      // Never authorize a turn from persisted sidecar data. Derive the
      // capability from the native appearance and its actual ordered quads.
      delete parsed.data.nativeMarkupRotationSourceHash;
      delete parsed.data.nativeMarkupTurn;
      delete parsed.data.nativeMarkupPreviewOffset;
      delete parsed.data.nativeMarkupGeneratedAppearance;
      delete parsed.data.nativeMarkupDraft;
      if (['highlight', 'underline', 'strikeout', 'squiggly', 'redaction'].includes(parsed.type)) {
        const hash = await fingerprintNativeMarkupRotation(doc, record.dict, lib);
        if (hash) {
          parsed.data.nativeMarkupRotationSourceHash = hash;
          parsed.data.nativeMarkupPreviewOffset = readNativeMarkupPreviewOffset(record.dict, lib);
          if (await verifyGeneratedMarkupAppearance(doc, record.dict, lib)) parsed.data.nativeMarkupGeneratedAppearance = true;
        }
      }

      if (parsed.type === 'stamp') {
        // A persisted app marker is not proof that an external editor left the
        // appearance unchanged. Legacy or unverifiable forms retain artwork.
        const hasNativeAppearance = Boolean(record.dict.get(lib.PDFName.of('AP')));
        parsed.data.hasCustomAppearance = hasNativeAppearance;
        const generated = hasNativeAppearance && parsed.data.nativeStampAppearanceKind === 'generated'
          && await verifyStampAppearanceFingerprint(doc, record.dict, lib);
        parsed.data.nativeStampAppearanceKind = generated ? 'generated' : 'imported';
        parsed.data.nativeStampRotationReadOnly = !generated && Boolean(record.dict.get(lib.PDFName.of('PDFHubBaseAP')))
          && !await verifyStampRotationFingerprint(doc, record.dict, lib);
      }

      if (parsed.type === 'shape-rect' || parsed.type === 'shape-ellipse' || parsed.type === 'shape-cloud') {
        // This is derived only from the actual source graph. A stored sidecar or
        // PDFHubData value must never authorize replacing an arbitrary AP.
        delete parsed.data.nativeBoxShapeTurn;
        delete parsed.data.nativeBoxShapeSourceHash;
        delete parsed.data.nativeBoxShapeGenerated;
        delete parsed.data.nativeBoxShapeGeneratedOrientation;
        parsed.data.nativeBoxShapeImported = true;
        parsed.data.nativeBoxShapeHasAppearance = Boolean(record.dict.get(lib.PDFName.of('AP')));
        const flags = record.dict.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
        const unsupported = parsed.type === 'shape-cloud' ? !supportsNativeCloudRotation(record.dict, lib)
          : ['RD', 'BE', 'IT', 'Measure', 'Vertices', 'InkList', 'L', 'CL', 'QuadPoints', 'Rotate', 'PDFHubBaseAP']
            .some((key) => record.dict.get(lib.PDFName.of(key))) || (Math.trunc(flags) & 16) !== 0;
        if (!unsupported) {
          const hash = parsed.type === 'shape-cloud' ? await fingerprintNativeCloudRotation(doc, record.dict, lib)
            : await fingerprintStampAppearance(doc, record.dict, lib);
          if (hash) parsed.data.nativeBoxShapeSourceHash = hash;
          if (parsed.type !== 'shape-cloud' && await verifyGeneratedBoxAppearanceFingerprint(doc, record.dict, lib)) {
            parsed.data.nativeBoxShapeGenerated = true;
            parsed.data.nativeBoxShapeGeneratedOrientation = record.dict.lookup(lib.PDFName.of(BOX_GENERATED_AP_ORIENTATION_KEY), lib.PDFNumber).asNumber();
          }
        }
      }

      if (record.refKey) parsed.data.nativeSourceRef = record.refKey;
      if (parsed.type === 'textbox' || parsed.type === 'callout') {
        parsed.data.nativeAppearancePageRotation = page.getRotation().angle;
      }

      // PDF.js can render each annotation's original /AP into an independent
      // canvas. Preserve its *full* /Rect as well as the app's logical body
      // rect: for FreeTextCallout these are different, and stretching the AP
      // into the body rect would distort its leader and artwork.
      if (record.refKey && record.dict.get(lib.PDFName.of('AP'))) {
        const match = /^(\d+)\s+(\d+)\s+R$/.exec(record.refKey);
        const sourceRect = readNumberArray(record.dict, 'Rect', lib);
        if (match && sourceRect && sourceRect.length >= 4) {
          const space = createMarkupSpace(page.getCropBox(), page.getRotation().angle);
          parsed.data.nativeAppearanceRef = `${match[1]}R${match[2] === '0' ? '' : match[2]}`;
          parsed.data.nativeAppearanceRect = pdfRectToViewRect(sourceRect, space);
          parsed.data.nativeAppearanceBodyRect = { ...parsed.rect };
          // App-generated annotation previews remain live. Imported external
          // artwork is rendered from /AP to preserve fonts, stamps and leaders.
          parsed.data.nativeAppearanceImported = !record.dict.get(lib.PDFName.of('PDFHubType'));
          parsed.data.nativeAppearancePageRotation = page.getRotation().angle;
          if (parsed.type === 'stamp') {
            parsed.data.nativeAppearanceRotation = readNumber(record.dict, 'PDFHubRotation', lib) ?? 0;
          }
        }
      }

      annotations.push(parsed);
      if (record.refKey) {
        rootByRef.set(record.refKey, parsed);
        rootRecordByRef.set(record.refKey, record);
      }
    }

    for (const record of replies) {
      const resolved = resolveRootForRelatedRecord(
        record,
        rootByRef,
        rootRecordByRef,
        recordByRef,
        lib,
        isReplyRecord,
      );

      if (!resolved) {
        skippedCount += 1;
        continue;
      }

      const { parent, parentRecord } = resolved;
      promoteStandardTextRootToComment(parent, parentRecord.dict, lib);

      const immediateParentKey = pdfObjectKey(
        record.dict.get(lib.PDFName.of('IRT')),
        lib,
      );
      const immediateParentRecord = immediateParentKey
        ? recordByRef.get(immediateParentKey)
        : undefined;
      const parentReplyId =
        immediateParentKey
        && !rootByRef.has(immediateParentKey)
        && immediateParentRecord
        && isReplyRecord(immediateParentRecord.dict, lib)
          ? replyLogicalId(
              immediateParentRecord.dict,
              parent.id,
              immediateParentRecord.index,
              lib,
            )
          : undefined;

      const reply = parseReply(
        record.dict,
        parent.id,
        record.index,
        lib,
        parentReplyId,
      );
      if (!reply) {
        skippedCount += 1;
        continue;
      }

      const review = ensureReviewMetadata(parent, lib, undefined);
      parent.data = {
        ...parent.data,
        review: {
          ...review,
          replies: [...review.replies, reply],
          updatedAt: Math.max(review.updatedAt, reply.createdAt),
        },
      };
      parent.updatedAt = Math.max(parent.updatedAt, reply.createdAt);
    }

    const orderedStates = orderNativeReviewStates(states, (record) => ({
      key: record.refKey,
      parent: pdfObjectKey(record.dict.get(lib.PDFName.of('IRT')), lib),
      author: readText(record.dict, 'T', lib),
      time: reviewStateTimestamp(record.dict, lib),
      index: record.index,
    }));

    for (const record of orderedStates) {
      const resolved = resolveRootForRelatedRecord(
        record,
        rootByRef,
        rootRecordByRef,
        recordByRef,
        lib,
        isReviewStateRecord,
      );

      if (!resolved) {
        skippedCount += 1;
        continue;
      }

      const { parent, parentRecord } = resolved;
      promoteStandardTextRootToComment(parent, parentRecord.dict, lib);

      const review = ensureReviewMetadata(parent, lib, undefined);
      const updatedAt = reviewStateTimestamp(record.dict, lib) || review.updatedAt;
      parent.data = {
        ...parent.data,
        review: {
          ...review,
          status: readReviewStatus(record.dict, lib, review.status),
          statusAuthor: readText(record.dict, 'T', lib) ?? review.statusAuthor,
          updatedAt: Math.max(review.updatedAt, updatedAt),
        },
      };
      parent.updatedAt = Math.max(parent.updatedAt, updatedAt);
    }
  }

  // /NM need only be unique within a page in real-world PDFs. Give the UI
  // distinct IDs while remembering the original native name for writing.
  const counts = new Map<string, number>();
  const perPage = new Map<string, number>();
  for (const annotation of annotations) {
    counts.set(annotation.id, (counts.get(annotation.id) ?? 0) + 1);
    const key = `${annotation.pageNumber}\u0000${annotation.id}`;
    perPage.set(key, (perPage.get(key) ?? 0) + 1);
  }
  const occupied = new Set(annotations.map((annotation) => annotation.id));
  for (const annotation of annotations) {
    if ((counts.get(annotation.id) ?? 0) < 2) continue;
    const nativeName = annotation.id;
    const pageKey = `${annotation.pageNumber}\u0000${nativeName}`;
    let candidate = `pdfhub-native-p${annotation.pageNumber}:${encodeURIComponent(nativeName)}`;
    let suffix = 1;
    while (occupied.has(candidate)) candidate = `pdfhub-native-p${annotation.pageNumber}:${encodeURIComponent(nativeName)}:${suffix++}`;
    occupied.add(candidate);
    annotation.id = candidate;
    annotation.data = {
      ...annotation.data,
      nativeOriginalName: nativeName,
      ...((perPage.get(pageKey) ?? 0) > 1 ? { nativeIdentityAmbiguous: true } : {}),
    };
  }

  return {
    annotations,
    importedCount: annotations.length,
    skippedCount,
  };
}

function readPageAnnotationRecords(
  page: PDFPage,
  lib: PdfLibModule,
): NativeRecord[] {
  const annots = page.node.lookupMaybe(lib.PDFName.of('Annots'), lib.PDFArray);
  if (!annots) return [];

  const records: NativeRecord[] = [];

  for (let index = 0; index < annots.size(); index += 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    records.push({
      refKey: pdfObjectKey(raw, lib),
      dict,
      index,
    });
  }

  return records;
}

function parseRootAnnotation(
  dict: PDFDict,
  page: PDFPage,
  pageNumber: number,
  index: number,
  lib: PdfLibModule,
): PdfAnnotation | null {
  const subtype = readName(dict, 'Subtype', lib);
  const customType = readText(dict, 'PDFHubType', lib);
  const standardType = annotationTypeFromSubtype(dict, subtype, lib);
  const validCustomType =
    customType && isAnnotationType(customType)
      ? customType
      : null;

  // Portable standard fields are authoritative whenever the subtype has a
  // standards-native disambiguator. Text comment-vs-sticky remains an
  // application distinction when no reply/state topology is available, so the
  // private type is retained only for that specific ambiguity.
  const type =
    subtype === 'Text' && validCustomType
      ? validCustomType
      : standardType ?? validCustomType;

  if (!type) return null;

  const rectValues = readNumberArray(dict, 'Rect', lib);
  if (!rectValues || rectValues.length < 4) return null;
  const freeTextBase = type === 'callout' || type === 'textbox'
    ? readNumberArray(dict, 'PDFHubBaseRect', lib) ?? rectValues : rectValues;
  const bodyValues = type === 'callout'
    ? calloutBodyRect(freeTextBase, readNumberArray(dict, 'PDFHubBaseRD', lib) ?? readNumberArray(dict, 'RD', lib), readNumberArray(dict, 'PDFHubBaseCL', lib) ?? readNumberArray(dict, 'CL', lib)) ?? freeTextBase
    : type === 'stamp'
      ? readNumberArray(dict, 'PDFHubBaseRect', lib) ?? rectValues
      : freeTextBase;

  const markupSpace = createMarkupSpace(page.getCropBox(), page.getRotation().angle);
  const rect = pdfRectToViewRect(bodyValues, markupSpace);
  const customData = readCustomData(dict, lib);
  const native = nativeData(dict, type, rect, page.getHeight(), lib, markupSpace);

  // Standard PDF fields are the portable source of truth after an external
  // edit/save. PDFHubData is a compatibility cache/fallback only, so native
  // values must be layered on top when both representations are present.
  const data: PdfAnnotation['data'] = {
    ...customData,
    ...native,
  };
  if ((type === 'textbox' || type === 'callout' || type === 'stamp') && dict.get(lib.PDFName.of('PDFHubBaseRect'))) {
    data.rotation = readNumber(dict, 'PDFHubRotation', lib) ?? 0;
  }
  if (type === 'stamp' && data.hasCustomAppearance) {
    data.nativeStampAppearanceKind = customData.nativeStampAppearanceKind === 'generated'
      ? 'generated' : 'imported';
  }

  const text = readText(dict, 'Contents', lib);
  const hasNativeRichText = dict.get(lib.PDFName.of('RC')) !== undefined;
  if (text !== null) {
    data.text = text;
  } else if (hasNativeRichText) {
    // Do not fall back to stale PDFHubData text when the portable annotation
    // carries rich native content but no flat Contents representation.
    data.text = '';
  }

  if (hasNativeRichText) {
    data.nativeInterop = {
      fidelityClass: 'NATIVE_PRESERVED_READ_ONLY',
      reason: 'RICH_TEXT',
      richText: true,
      defaultStyle: dict.get(lib.PDFName.of('DS')) !== undefined,
      protectedSnapshot: {
        type,
        text: typeof data.text === 'string' ? data.text : '',
        ...(typeof data.content === 'string' ? { content: data.content } : {}),
        ...(typeof data.fontSize === 'number' ? { fontSize: data.fontSize } : {}),
        ...(
          data.fontWeight === 'normal' || data.fontWeight === 'bold'
            ? { fontWeight: data.fontWeight }
            : {}
        ),
        ...(
          data.fontStyle === 'normal' || data.fontStyle === 'italic'
            ? { fontStyle: data.fontStyle }
            : {}
        ),
        ...(typeof data.fontFamily === 'string' ? { fontFamily: data.fontFamily } : {}),
        ...(typeof data.textColor === 'string' ? { textColor: data.textColor } : {}),
        ...(
          data.textAlign === 'left'
          || data.textAlign === 'center'
          || data.textAlign === 'right'
            ? { textAlign: data.textAlign }
            : {}
        ),
        ...(typeof data.lineHeight === 'number' ? { lineHeight: data.lineHeight } : {}),
        ...(typeof data.autoSize === 'boolean' ? { autoSize: data.autoSize } : {}),
      },
    };
  }

  const author = readText(dict, 'T', lib);
  if (author && typeof data.author !== 'string') {
    data.author = author;
  }

  const createdAt =
    readPdfDate(dict, 'CreationDate', lib)
    ?? readPdfDate(dict, 'M', lib)
    ?? Date.now();
  const updatedAt =
    readPdfDate(dict, 'M', lib)
    ?? createdAt;

  const annotation: PdfAnnotation = {
    id:
      readText(dict, 'NM', lib)
      ?? `native:p${pageNumber}:a${index}`,
    type,
    pageNumber,
    rect,
    data,
    createdAt,
    updatedAt,
  };

  const shouldHaveReview =
    Boolean(data.review)
    || type === 'comment'
    || type === 'sticky-note'
    || Boolean(readTextOrName(dict, 'StateModel', lib))
    || Boolean(readTextOrName(dict, 'State', lib))
    || Boolean(readText(dict, 'PDFHubReviewStatus', lib));

  if (shouldHaveReview) {
    annotation.data = {
      ...annotation.data,
      review: ensureReviewMetadata(annotation, lib, dict),
    };
  }

  return annotation;
}

function parseReply(
  dict: PDFDict,
  parentId: string,
  index: number,
  lib: PdfLibModule,
  parentReplyId?: string,
): ReviewReply | null {
  const content = readText(dict, 'Contents', lib)?.trim();
  if (!content) return null;

  const createdAt =
    readPdfDate(dict, 'CreationDate', lib)
    ?? readPdfDate(dict, 'M', lib)
    ?? Date.now();

  const hasNativeRichText = dict.get(lib.PDFName.of('RC')) !== undefined;

  return {
    id: replyLogicalId(dict, parentId, index, lib),
    author: readText(dict, 'T', lib) ?? 'Unknown',
    content,
    createdAt,
    ...(readPdfDate(dict, 'M', lib) !== null ? { updatedAt: readPdfDate(dict, 'M', lib)! } : {}),
    ...(parentReplyId ? { parentReplyId } : {}),
    ...(hasNativeRichText
      ? {
          nativeInterop: {
            fidelityClass: 'NATIVE_PRESERVED_READ_ONLY' as const,
            reason: 'RICH_TEXT' as const,
            richText: true as const,
            protectedContent: content,
          },
        }
      : {}),
  };
}

function replyLogicalId(
  dict: PDFDict,
  parentId: string,
  index: number,
  lib: PdfLibModule,
): string {
  const privateId = readText(dict, 'PDFHubReplyId', lib);
  const annotationName = readText(dict, 'NM', lib);

  return (
    privateId
    ?? replyIdFromAnnotationName(annotationName, parentId)
    ?? annotationName
    ?? `${parentId}:native-reply:${index}`
  );
}

function replyIdFromAnnotationName(
  annotationName: string | null,
  parentId: string,
): string | null {
  if (!annotationName) return null;
  const prefix = `${parentId}:reply:`;
  return annotationName.startsWith(prefix) && annotationName.length > prefix.length
    ? annotationName.slice(prefix.length)
    : null;
}

function isReviewStateRecord(dict: PDFDict, lib: PdfLibModule): boolean {
  return (
    readTextOrName(dict, 'StateModel', lib) === 'Review'
    && Boolean(readTextOrName(dict, 'State', lib))
  );
}

function isReplyRecord(dict: PDFDict, lib: PdfLibModule): boolean {
  if (isReviewStateRecord(dict, lib)) return false;
  const replyType = readName(dict, 'RT', lib);
  return replyType === null || replyType === 'R';
}

function resolveRootForRelatedRecord(
  record: NativeRecord,
  rootByRef: Map<string, PdfAnnotation>,
  rootRecordByRef: Map<string, NativeRecord>,
  recordByRef: Map<string, NativeRecord>,
  lib: PdfLibModule,
  mayTraverse: (dict: PDFDict, lib: PdfLibModule) => boolean,
): { parent: PdfAnnotation; parentRecord: NativeRecord } | null {
  let current: NativeRecord | undefined = record;
  const visited = new Set<string>();

  while (current) {
    const parentKey = pdfObjectKey(current.dict.get(lib.PDFName.of('IRT')), lib);
    if (!parentKey) return null;

    const parent = rootByRef.get(parentKey);
    const parentRecord = rootRecordByRef.get(parentKey);
    if (parent && parentRecord) {
      return { parent, parentRecord };
    }

    if (visited.has(parentKey)) return null;
    visited.add(parentKey);
    const next = recordByRef.get(parentKey);
    if (!next || !mayTraverse(next.dict, lib)) return null;
    current = next;
  }

  return null;
}

function promoteStandardTextRootToComment(
  annotation: PdfAnnotation,
  rootDict: PDFDict,
  lib: PdfLibModule,
): void {
  if (annotation.type !== 'sticky-note') return;
  if (readText(rootDict, 'PDFHubType', lib)) return;
  annotation.type = 'comment';
}

function reviewStateTimestamp(dict: PDFDict, lib: PdfLibModule): number {
  return (
    readPdfDate(dict, 'M', lib)
    ?? readPdfDate(dict, 'CreationDate', lib)
    ?? 0
  );
}

function ensureReviewMetadata(
  annotation: PdfAnnotation,
  lib: PdfLibModule,
  dict: PDFDict | undefined,
): ReviewMetadata {
  const current = isReviewMetadata(annotation.data.review)
    ? annotation.data.review
    : undefined;

  const status = dict
    ? readReviewStatus(dict, lib, current?.status ?? 'open')
    : current?.status ?? 'open';

  return {
    author:
      current?.author
      ?? (typeof annotation.data.author === 'string' ? annotation.data.author : 'Unknown'),
    createdAt: current?.createdAt ?? annotation.createdAt,
    updatedAt: current?.updatedAt ?? annotation.updatedAt,
    status,
    statusAuthor: current?.statusAuthor,
    title: current?.title,
    category: current?.category,
    replies: current?.replies ?? [],
  };
}

function readCustomData(
  dict: PDFDict,
  lib: PdfLibModule,
): PdfAnnotation['data'] {
  const raw = readText(dict, 'PDFHubData', lib);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PdfAnnotation['data']
      : {};
  } catch {
    return {};
  }
}

function nativeData(
  dict: PDFDict,
  type: PdfAnnotation['type'],
  rect: PdfAnnotation['rect'],
  pageHeight: number,
  lib: PdfLibModule,
  markupSpace?: MarkupSpace,
): PdfAnnotation['data'] {
  const data: PdfAnnotation['data'] = {};
  const stroke = readColor(dict, 'C', lib);
  const fill = readColor(dict, 'IC', lib);
  const opacity = readNumber(dict, 'CA', lib);

  if (stroke) data.borderColor = stroke;
  if (fill) data.backgroundColor = fill;
  if (typeof opacity === 'number') data.opacity = opacity;

  const flags = readNumber(dict, 'F', lib);
  if (typeof flags === 'number') {
    data.locked = (Math.trunc(flags) & 128) !== 0;
  }

  const border = readAnnotationBorder(dict, lib);
  if (border) {
    data.borderWidth = border.width;
    data.borderStyle = border.style;
  }

  if (type === 'textbox' || type === 'callout') {
    const alignment = readNumber(dict, 'Q', lib);
    if (alignment === 1) data.textAlign = 'center';
    else if (alignment === 2) data.textAlign = 'right';
    else if (alignment === 0) data.textAlign = 'left';
  }

  if (type === 'sticky-note' || type === 'comment') {
    const open = readBoolean(dict, 'Open', lib);
    if (typeof open === 'boolean') {
      data.isCollapsed = !open;
    }
  }

  if (type === 'line' || type === 'arrow') {
    const endings = readLineEndings(dict, lib);
    if (endings) {
      data.lineStartCap = lineCapFromPdfEnding(endings[0]);
      data.lineEndCap = lineCapFromPdfEnding(endings[1]);
    }
  }

  if (type === 'stamp') {
    const name = readName(dict, 'Name', lib);
    if (name) {
      data.stampStyle = stampStyleFromPdfName(name);
      data.stampName = name;
    }
    const ap = dict.lookupMaybe(lib.PDFName.of('AP'), lib.PDFDict);
    if (ap) {
      data.hasCustomAppearance = true;
    }
  }

  if (type === 'highlight' && stroke && !fill) {
    data.backgroundColor = stroke;
  }

  if (
    type === 'highlight'
    || type === 'underline'
    || type === 'strikeout'
    || type === 'squiggly'
  ) {
    const quads = readNormalizedTextMarkupQuads(
      dict,
      rect,
      pageHeight,
      lib,
      markupSpace,
    );
    if (quads) data.textMarkupQuads = quads;
  }

  if (type === 'textbox' || type === 'callout') {
    const defaultAppearance = readDefaultAppearance(dict, lib);
    if (typeof defaultAppearance.fontSize === 'number') {
      data.fontSize = defaultAppearance.fontSize;
    }
    if (defaultAppearance.textColor) {
      data.textColor = defaultAppearance.textColor;
    }
    if (defaultAppearance.fontFamily) {
      data.fontFamily = defaultAppearance.fontFamily;
    }

    if (fill) {
      data.backgroundColor = fill;
      if (stroke) data.borderColor = stroke;
    } else if (stroke) {
      if (stroke.toLowerCase() === '#ffffff') {
        data.backgroundColor = '#ffffff';
        data.borderColor = data.textColor ?? '#475569';
      } else {
        data.borderColor = stroke;
      }
    }
  }

  if (type === 'line' || type === 'arrow') {
    const line = readNumberArray(dict, 'L', lib);
    if (line && line.length >= 4) {
      const first = markupSpace ? pdfPointToView(line[0], line[1], markupSpace) : { x: line[0], y: pageHeight - line[1] };
      const second = markupSpace ? pdfPointToView(line[2], line[3], markupSpace) : { x: line[2], y: pageHeight - line[3] };
      data.points = [
        first.x - rect.x,
        first.y - rect.y,
        second.x - rect.x,
        second.y - rect.y,
      ];
    }
  }

  if (type === 'shape-polygon') {
    const vertices = readNumberArray(dict, 'Vertices', lib);
    if (vertices && vertices.length >= 6) {
      const converted: number[] = [];
      for (let index = 0; index + 1 < vertices.length; index += 2) {
        const point = markupSpace ? pdfPointToView(vertices[index], vertices[index + 1], markupSpace) : { x: vertices[index], y: pageHeight - vertices[index + 1] };
        converted.push(point.x, point.y);
      }
      data.points = converted;
    }
  }

  if (type === 'ink') {
    const ink = dict.lookupMaybe(lib.PDFName.of('InkList'), lib.PDFArray);
    if (ink) {
      const paths: number[][] = [];
      for (let pathIndex = 0; pathIndex < ink.size(); pathIndex += 1) {
        const path = ink.lookupMaybe(pathIndex, lib.PDFArray);
        if (!path) continue;
        const values = readPdfArrayNumbers(path, lib);
        const converted: number[] = [];
        for (let index = 0; index + 1 < values.length; index += 2) {
          const point = markupSpace ? pdfPointToView(values[index], values[index + 1], markupSpace) : { x: values[index], y: pageHeight - values[index + 1] };
          converted.push(point.x, point.y);
        }
        if (converted.length >= 4) paths.push(converted);
      }
      if (paths.length > 0) data.paths = paths;
    }
  }

  if (type === 'callout') {
    const callout = readNumberArray(dict, 'PDFHubBaseCL', lib) ?? readNumberArray(dict, 'CL', lib);
    if (callout && callout.length >= 4) {
      data.anchor = markupSpace ? pdfPointToView(callout[0], callout[1], markupSpace) : { x: callout[0], y: pageHeight - callout[1] };
      if (callout.length >= 6) {
        data.knee = markupSpace ? pdfPointToView(callout[2], callout[3], markupSpace) : { x: callout[2], y: pageHeight - callout[3] };
        data.leaderStyle = 'elbow';
      } else {
        data.leaderStyle = 'straight';
      }
    }
    const leRaw = dict.lookupMaybe(lib.PDFName.of('LE'), lib.PDFName)?.decodeText()
      ?? dict.lookupMaybe(lib.PDFName.of('LE'), lib.PDFArray)?.lookupMaybe(0, lib.PDFName)?.decodeText()
      ?? null;
    if (leRaw) {
      data.arrowHead = leRaw === 'ClosedArrow' ? 'filled' : leRaw === 'None' ? 'none' : 'open';
    }
  }

  return data;
}

function readNormalizedTextMarkupQuads(
  dict: PDFDict,
  rect: PdfAnnotation['rect'],
  pageHeight: number,
  lib: PdfLibModule,
  markupSpace?: MarkupSpace,
): number[] | null {
  const values = readNumberArray(dict, 'QuadPoints', lib);
  if (
    !values
    || values.length < 8
    || values.length % 8 !== 0
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }

  const normalized: number[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    const pdfX = values[index];
    const pdfY = values[index + 1];
    const app = markupSpace
      ? pdfPointToView(pdfX, pdfY, markupSpace)
      : { x: pdfX, y: pageHeight - pdfY };
    const nx = (app.x - rect.x) / rect.width;
    const ny = (app.y - rect.y) / rect.height;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    normalized.push(nx, ny);
  }

  return normalized;
}

function extractCssColor(css: string | null): string | null {
  if (!css) return null;
  const hex = /color\s*:\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/i.exec(css);
  if (hex) {
    const raw = hex[1];
    if (raw.length === 3) {
      return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
    }
    return `#${raw.toLowerCase()}`;
  }
  const rgb = /color\s*:\s*rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(css);
  if (rgb) {
    const r = Math.max(0, Math.min(255, parseInt(rgb[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgb[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgb[3], 10)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return null;
}

function readDefaultAppearance(
  dict: PDFDict,
  lib: PdfLibModule,
): { fontSize?: number; textColor?: string; fontFamily?: string } {
  let fontSize: number | undefined;
  let textColor: string | undefined;
  let fontFamily: string | undefined;

  const source = readText(dict, 'DA', lib);
  if (source) {
    const tokens = source.trim().split(/\s+/).filter(Boolean);
    for (let index = 0; index < tokens.length; index += 1) {
      const operator = tokens[index];

      if (operator === 'Tf' && index >= 1) {
        if (index >= 2) {
          const fontToken = tokens[index - 2].replace(/^\//, '').toLowerCase();
          if (fontToken.includes('helv') || fontToken.includes('arial')) {
            fontFamily = 'Helvetica, Arial, sans-serif';
          } else if (fontToken.includes('cour')) {
            fontFamily = 'Courier New, Courier, monospace';
          } else if (fontToken.includes('times')) {
            fontFamily = 'Times New Roman, Times, serif';
          }
        }
        const size = Number(tokens[index - 1]);
        if (Number.isFinite(size) && size > 0) {
          fontSize = size;
        }
        continue;
      }

      if (operator === 'g' && index >= 1) {
        const gray = Number(tokens[index - 1]);
        if (Number.isFinite(gray)) {
          textColor = rgbToHex(gray, gray, gray);
        }
        continue;
      }

      if (operator === 'rg' && index >= 3) {
        const r = Number(tokens[index - 3]);
        const g = Number(tokens[index - 2]);
        const b = Number(tokens[index - 1]);
        if ([r, g, b].every((value) => Number.isFinite(value))) {
          textColor = rgbToHex(r, g, b);
        }
        continue;
      }

      if (operator === 'k' && index >= 4) {
        const c = Number(tokens[index - 4]);
        const m = Number(tokens[index - 3]);
        const y = Number(tokens[index - 2]);
        const k = Number(tokens[index - 1]);
        if ([c, m, y, k].every((value) => Number.isFinite(value))) {
          textColor = rgbToHex(
            1 - Math.min(1, c + k),
            1 - Math.min(1, m + k),
            1 - Math.min(1, y + k),
          );
        }
      }
    }
  }

  // PDF ISO 32000-1 §12.5.6.4: When Default Style (/DS) is present, it defines
  // the default CSS style formatting for the free text and overrides /DA.
  const ds = readText(dict, 'DS', lib);
  if (ds) {
    const dsColor = extractCssColor(ds);
    if (dsColor) {
      textColor = dsColor;
    }
    const familyMatch = /font-family\s*:\s*([^;]+)/i.exec(ds) ?? /font\s*:\s*([a-zA-Z0-9_\-\s,]+?)\s+\d+(?:\.\d+)?pt/i.exec(ds);
    if (familyMatch) {
      const fam = familyMatch[1].trim();
      if (fam) fontFamily = fam;
    }
    if (fontSize === undefined) {
      const sizeMatch = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*pt/i.exec(ds) ?? /font\s*:[^;]*?\s+(\d+(?:\.\d+)?)\s*pt/i.exec(ds);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        if (Number.isFinite(size) && size > 0) fontSize = size;
      }
    }
  }

  return { fontSize, textColor, fontFamily };
}

function rgbToHex(r: number, g: number, b: number): string {
  const byte = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * 255)));
  return `#${byte(r).toString(16).padStart(2, '0')}${byte(g).toString(16).padStart(2, '0')}${byte(b).toString(16).padStart(2, '0')}`;
}

function annotationTypeFromSubtype(
  dict: PDFDict,
  subtype: string | null,
  lib: PdfLibModule,
): PdfAnnotation['type'] | null {
  switch (subtype) {
    case 'Text':
      return readTextOrName(dict, 'StateModel', lib) === 'Review'
        ? 'comment'
        : 'sticky-note';
    case 'Highlight':
      return 'highlight';
    case 'Underline':
      return 'underline';
    case 'StrikeOut':
      return 'strikeout';
    case 'Squiggly':
      return 'squiggly';
    case 'FreeText': {
      const callout = readNumberArray(dict, 'CL', lib);
      return (
        readName(dict, 'IT', lib) === 'FreeTextCallout'
        || Boolean(callout && callout.length >= 4)
      )
        ? 'callout'
        : 'textbox';
    }
    case 'Square':
      return squareAnnotationType(dict, lib);
    case 'Circle':
      return 'shape-ellipse';
    case 'Polygon':
      return 'shape-polygon';
    case 'Line':
      return hasArrowEnding(dict, lib) ? 'arrow' : 'line';
    case 'Ink':
      return 'ink';
    case 'Stamp':
      return 'stamp';
    default:
      return null;
  }
}

function hasArrowEnding(dict: PDFDict, lib: PdfLibModule): boolean {
  const endings = readLineEndings(dict, lib);
  return Boolean(endings?.some((ending) => isPdfArrowEnding(ending)));
}

function readLineEndings(
  dict: PDFDict,
  lib: PdfLibModule,
): [string, string] | null {
  const endings = dict.lookupMaybe(lib.PDFName.of('LE'), lib.PDFArray);
  if (!endings || endings.size() < 2) return null;

  const start = endings.lookupMaybe(0, lib.PDFName)?.decodeText();
  const end = endings.lookupMaybe(1, lib.PDFName)?.decodeText();
  return start && end ? [start, end] : null;
}

function isPdfArrowEnding(value: string): boolean {
  return (
    value === 'OpenArrow'
    || value === 'ClosedArrow'
    || value === 'ROpenArrow'
    || value === 'RClosedArrow'
  );
}

function lineCapFromPdfEnding(
  value: string,
): 'none' | 'arrow' | 'circle' | 'square' | undefined {
  if (value === 'None') return 'none';
  if (isPdfArrowEnding(value)) return 'arrow';
  if (value === 'Circle') return 'circle';
  if (value === 'Square') return 'square';
  return undefined;
}

function stampStyleFromPdfName(
  value: string,
): 'approved' | 'rejected' | 'draft' | 'confidential' | 'custom' {
  if (value === 'Approved') return 'approved';
  if (value === 'Rejected') return 'rejected';
  if (value === 'Draft') return 'draft';
  if (value === 'Confidential') return 'confidential';
  return 'custom';
}

function squareAnnotationType(
  dict: PDFDict,
  lib: PdfLibModule,
): 'shape-rect' | 'shape-cloud' | 'redaction' {
  const effect = dict.lookupMaybe(lib.PDFName.of('BE'), lib.PDFDict);
  const effectStyle = effect?.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.decodeText();
  if (effectStyle === 'C') return 'shape-cloud';

  const stroke = readColor(dict, 'C', lib);
  const fill = readColor(dict, 'IC', lib);
  const opacity = readNumber(dict, 'CA', lib);
  if (
    stroke === '#000000'
    && fill === '#000000'
    && (opacity === null || opacity >= 0.999)
  ) {
    return 'redaction';
  }

  return 'shape-rect';
}

function readAnnotationBorder(
  dict: PDFDict,
  lib: PdfLibModule,
): {
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'none' | undefined;
} | null {
  const borderStyle = dict.lookupMaybe(lib.PDFName.of('BS'), lib.PDFDict);
  if (borderStyle) {
    const width =
      borderStyle.lookupMaybe(lib.PDFName.of('W'), lib.PDFNumber)?.asNumber()
      ?? 1;
    if (!Number.isFinite(width)) return null;
    if (width <= 0) return { width: 0, style: 'none' };

    const styleName =
      borderStyle.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.decodeText()
      ?? 'S';
    if (styleName === 'S') return { width, style: 'solid' };
    if (styleName === 'D') {
      const dash = borderStyle.lookupMaybe(lib.PDFName.of('D'), lib.PDFArray);
      const dashValues = dash ? readPdfArrayNumbers(dash, lib) : [];
      const dotted = dashValues.length > 0
        && dashValues.every((value) => value <= 1.5);
      return { width, style: dotted ? 'dotted' : 'dashed' };
    }

    // Bevelled/inset/underline styles are standards-native but not currently
    // editable in PDF Hub. Width remains usable; undefined explicitly clears
    // any stale private borderStyle while the source BS dictionary is preserved.
    return { width, style: undefined };
  }

  const border = dict.lookupMaybe(lib.PDFName.of('Border'), lib.PDFArray);
  if (!border || border.size() < 3) return null;

  const width = border.lookupMaybe(2, lib.PDFNumber)?.asNumber();
  if (typeof width !== 'number' || !Number.isFinite(width)) return null;
  if (width <= 0) return { width: 0, style: 'none' };

  const dash = border.lookupMaybe(3, lib.PDFArray);
  if (!dash || dash.size() === 0) {
    return { width, style: 'solid' };
  }

  const dashValues = readPdfArrayNumbers(dash, lib);
  const dotted = dashValues.length > 0
    && dashValues.every((value) => value <= 1.5);
  return { width, style: dotted ? 'dotted' : 'dashed' };
}

function readBoolean(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): boolean | null {
  const value = dict.lookup(lib.PDFName.of(key));
  if (!(value instanceof lib.PDFBool)) return null;
  return value.toString() === 'true';
}

function readReviewStatus(
  dict: PDFDict,
  lib: PdfLibModule,
  fallback: ReviewStatus = 'open',
): ReviewStatus {
  // /State is the portable native review value and may have been changed by an
  // external PDF writer while PDFHubReviewStatus remained untouched.
  const state = readTextOrName(dict, 'State', lib);
  if (state === 'Completed' || state === 'Accepted') return 'resolved';
  if (state === 'Rejected' || state === 'Cancelled') return 'rejected';
  if (state === 'None') return 'open';

  // Private metadata remains useful for older PDF Hub files or producers that
  // omit a native review state, but it must never override a recognized /State.
  const custom = readText(dict, 'PDFHubReviewStatus', lib);
  if (custom === 'resolved' || custom === 'rejected' || custom === 'open') {
    return custom;
  }

  return fallback;
}

function isReviewMetadata(value: unknown): value is ReviewMetadata {
  if (!value || typeof value !== 'object') return false;
  const review = value as Partial<ReviewMetadata>;
  return (
    (review.status === 'open' || review.status === 'resolved' || review.status === 'rejected')
    && Array.isArray(review.replies)
  );
}


function readText(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): string | null {
  const value = dict.lookup(lib.PDFName.of(key));

  if (value instanceof lib.PDFString || value instanceof lib.PDFHexString) {
    return value.decodeText().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  return null;
}

function readName(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): string | null {
  return dict.lookupMaybe(lib.PDFName.of(key), lib.PDFName)?.decodeText() ?? null;
}

function readTextOrName(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): string | null {
  const value = dict.lookup(lib.PDFName.of(key));
  if (
    value instanceof lib.PDFString
    || value instanceof lib.PDFHexString
    || value instanceof lib.PDFName
  ) {
    return value.decodeText();
  }
  return null;
}

function readNumber(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): number | null {
  return dict.lookupMaybe(lib.PDFName.of(key), lib.PDFNumber)?.asNumber() ?? null;
}

function readNumberArray(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): number[] | null {
  const value = dict.lookupMaybe(lib.PDFName.of(key), lib.PDFArray);
  return value ? readPdfArrayNumbers(value, lib) : null;
}

function readPdfArrayNumbers(
  array: PDFArray,
  lib: PdfLibModule,
): number[] {
  const values: number[] = [];
  for (let index = 0; index < array.size(); index += 1) {
    const value = array.lookupMaybe(index, lib.PDFNumber);
    if (value) values.push(value.asNumber());
  }
  return values;
}

function readColor(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): string | null {
  const values = readNumberArray(dict, key, lib);
  if (!values || values.length < 3) return null;

  const toByte = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * 255)));

  return `#${toByte(values[0]).toString(16).padStart(2, '0')}${toByte(values[1]).toString(16).padStart(2, '0')}${toByte(values[2]).toString(16).padStart(2, '0')}`;
}

function readPdfDate(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): number | null {
  const raw = readText(dict, key, lib);
  if (!raw) return null;

  const match = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(raw);
  if (!match) return null;

  const timestamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );

  return Number.isFinite(timestamp) ? timestamp : null;
}

function pdfObjectKey(
  value: unknown,
  lib: PdfLibModule,
): string | null {
  return value instanceof lib.PDFRef ? value.toString() : null;
}
