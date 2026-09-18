import type {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFPage,
} from 'pdf-lib';

import type { PdfAnnotation, Point2D } from '@/core/annotations/types';
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
    const replies = records.filter((record) => Boolean(record.dict.get(lib.PDFName.of('IRT'))));

    const rootByRef = new Map<string, PdfAnnotation>();

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
      }
    }

    for (const record of replies) {
      const parentRef = record.dict.get(lib.PDFName.of('IRT'));
      const parentKey = pdfObjectKey(parentRef, lib);
      const parent = parentKey ? rootByRef.get(parentKey) : undefined;

      if (!parent) {
        skippedCount += 1;
        continue;
      }

      const reply = parseReply(record.dict, parent.id, record.index, lib);
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
  const type =
    customType && isAnnotationType(customType)
      ? customType
      : annotationTypeFromSubtype(dict, subtype, lib);

  if (!type) return null;

  const rectValues = readNumberArray(dict, 'Rect', lib);
  if (!rectValues || rectValues.length < 4) return null;

  const rect = pdfRectToAppRect(rectValues, page.getHeight());
  const customData = readCustomData(dict, lib);
  const data: PdfAnnotation['data'] = {
    ...nativeData(dict, type, rect, page.getHeight(), lib),
    ...customData,
  };

  const text = readText(dict, 'Contents', lib);
  if (text && typeof data.text !== 'string') {
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
    || Boolean(readName(dict, 'StateModel', lib));

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
): ReviewReply | null {
  const content = readText(dict, 'Contents', lib)?.trim();
  if (!content) return null;

  const createdAt =
    readPdfDate(dict, 'CreationDate', lib)
    ?? readPdfDate(dict, 'M', lib)
    ?? Date.now();

  return {
    id:
      readText(dict, 'PDFHubReplyId', lib)
      ?? readText(dict, 'NM', lib)
      ?? `${parentId}:native-reply:${index}`,
    author: readText(dict, 'T', lib) ?? 'Unknown',
    content,
    createdAt,
  };
}

function ensureReviewMetadata(
  annotation: PdfAnnotation,
  lib: PdfLibModule,
  dict: PDFDict | undefined,
): ReviewMetadata {
  const current = isReviewMetadata(annotation.data.review)
    ? annotation.data.review
    : undefined;

  const status =
    current?.status
    ?? (dict ? readReviewStatus(dict, lib) : 'open');

  return {
    author:
      current?.author
      ?? (typeof annotation.data.author === 'string' ? annotation.data.author : 'Unknown'),
    createdAt: current?.createdAt ?? annotation.createdAt,
    updatedAt: current?.updatedAt ?? annotation.updatedAt,
    status,
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

  if (type === 'highlight' && stroke && !fill) {
    data.backgroundColor = stroke;
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

function annotationTypeFromSubtype(
  dict: PDFDict,
  subtype: string | null,
  lib: PdfLibModule,
): PdfAnnotation['type'] | null {
  switch (subtype) {
    case 'Text':
      return 'sticky-note';
    case 'Highlight':
      return 'highlight';
    case 'Underline':
      return 'underline';
    case 'StrikeOut':
      return 'strikeout';
    case 'Squiggly':
      return 'squiggly';
    case 'FreeText':
      return readName(dict, 'IT', lib) === 'FreeTextCallout'
        ? 'callout'
        : 'textbox';
    case 'Square':
      return 'shape-rect';
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
  const endings = dict.lookupMaybe(lib.PDFName.of('LE'), lib.PDFArray);
  if (!endings) return false;

  for (let index = 0; index < endings.size(); index += 1) {
    const name = endings.lookupMaybe(index, lib.PDFName)?.decodeText();
    if (name && name !== 'None') return true;
  }
  return false;
}

function readReviewStatus(
  dict: PDFDict,
  lib: PdfLibModule,
): ReviewStatus {
  const custom = readText(dict, 'PDFHubReviewStatus', lib);
  if (custom === 'resolved' || custom === 'rejected' || custom === 'open') {
    return custom;
  }

  const state = readName(dict, 'State', lib);
  if (state === 'Completed' || state === 'Accepted') return 'resolved';
  if (state === 'Rejected' || state === 'Cancelled') return 'rejected';
  return 'open';
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
