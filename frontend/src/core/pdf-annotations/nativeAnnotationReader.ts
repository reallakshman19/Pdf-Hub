import type {
  PDFArray,
  PDFDict,
  PDFPage,
} from 'pdf-lib';

import type { PdfAnnotation } from '@/core/annotations/types';
import { isAnnotationType } from '@/core/annotations/annotationTypes';
import type { ReviewMetadata, ReviewReply, ReviewStatus } from '@/core/review/types';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

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
        immediateParentRecord && isReplyRecord(immediateParentRecord.dict, lib)
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

    const orderedStates = [...states].sort((left, right) => {
      const timestampDelta =
        reviewStateTimestamp(left.dict, lib) - reviewStateTimestamp(right.dict, lib);
      return timestampDelta || left.index - right.index;
    });

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

  const rect = pdfRectToAppRect(rectValues, page.getHeight());
  const customData = readCustomData(dict, lib);
  const native = nativeData(dict, type, rect, page.getHeight(), lib);

  // Standard PDF fields are the portable source of truth after an external
  // edit/save. PDFHubData is a compatibility cache/fallback only, so native
  // values must be layered on top when both representations are present.
  const data: PdfAnnotation['data'] = {
    ...customData,
    ...native,
  };

  const text = readText(dict, 'Contents', lib);
  if (text !== null) {
    data.text = text;
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
    || Boolean(readTextOrName(dict, 'StateModel', lib));

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

  return {
    id: replyLogicalId(dict, parentId, index, lib),
    author: readText(dict, 'T', lib) ?? 'Unknown',
    content,
    createdAt,
    ...(parentReplyId ? { parentReplyId } : {}),
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

  if (type === 'sticky-note') {
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
  }

  if (type === 'line' || type === 'arrow') {
    const line = readNumberArray(dict, 'L', lib);
    if (line && line.length >= 4) {
      const x1 = line[0];
      const y1 = pageHeight - line[1];
      const x2 = line[2];
      const y2 = pageHeight - line[3];
      data.points = [
        x1 - rect.x,
        y1 - rect.y,
        x2 - rect.x,
        y2 - rect.y,
      ];
    }
  }

  if (type === 'shape-polygon') {
    const vertices = readNumberArray(dict, 'Vertices', lib);
    if (vertices && vertices.length >= 6) {
      const converted: number[] = [];
      for (let index = 0; index + 1 < vertices.length; index += 2) {
        converted.push(vertices[index], pageHeight - vertices[index + 1]);
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
          converted.push(
            values[index] - rect.x,
            pageHeight - values[index + 1] - rect.y,
          );
        }
        if (converted.length >= 4) paths.push(converted);
      }
      if (paths.length > 0) data.paths = paths;
    }
  }

  if (type === 'callout') {
    const callout = readNumberArray(dict, 'CL', lib);
    if (callout && callout.length >= 4) {
      data.anchor = {
        x: callout[0],
        y: pageHeight - callout[1],
      };
      if (callout.length >= 6) {
        data.knee = {
          x: callout[2],
          y: pageHeight - callout[3],
        };
      }
    }
  }

  return data;
}

function readNormalizedTextMarkupQuads(
  dict: PDFDict,
  rect: PdfAnnotation['rect'],
  pageHeight: number,
  lib: PdfLibModule,
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
    const appX = pdfX;
    const appY = pageHeight - pdfY;
    const nx = (appX - rect.x) / rect.width;
    const ny = (appY - rect.y) / rect.height;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    normalized.push(nx, ny);
  }

  return normalized;
}

function readDefaultAppearance(
  dict: PDFDict,
  lib: PdfLibModule,
): { fontSize?: number; textColor?: string } {
  const source = readText(dict, 'DA', lib);
  if (!source) return {};

  const tokens = source.trim().split(/\s+/).filter(Boolean);
  let fontSize: number | undefined;
  let textColor: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const operator = tokens[index];

    if (operator === 'Tf' && index >= 1) {
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

  return { fontSize, textColor };
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

function pdfRectToAppRect(
  values: number[],
  pageHeight: number,
): PdfAnnotation['rect'] {
  const x1 = Math.min(values[0], values[2]);
  const x2 = Math.max(values[0], values[2]);
  const y1 = Math.min(values[1], values[3]);
  const y2 = Math.max(values[1], values[3]);

  return {
    x: x1,
    y: pageHeight - y2,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function readText(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): string | null {
  const value = dict.lookup(lib.PDFName.of(key));

  if (value instanceof lib.PDFString || value instanceof lib.PDFHexString) {
    return value.decodeText();
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
