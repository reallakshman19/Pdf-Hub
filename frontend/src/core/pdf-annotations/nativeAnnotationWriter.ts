import type {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFPage,
  PDFRef,
} from 'pdf-lib';

import type { PdfAnnotation, Point2D } from '@/core/annotations/types';
import { pdfLib } from '@/core/pdf/lazyPdfLib';

type PdfLibModule = typeof import('pdf-lib');

export interface NativeAnnotationWriteResult {
  bytes: Uint8Array;
  annotationCount: number;
  replyCount: number;
}

interface PdfColor {
  r: number;
  g: number;
  b: number;
}

interface AnnotationGeometry {
  rect: [number, number, number, number];
  x: number;
  y: number;
  width: number;
  height: number;
  pageHeight: number;
}

interface ReviewStateRecord {
  ref: PDFRef;
  refKey: string;
  dict: PDFDict;
  index: number;
  parentKey: string | null;
  author: string;
  state: string;
  timestamp: number;
}

interface ReviewStateGraph {
  rootRefKey: string | null;
  records: ReviewStateRecord[];
}

const DEFAULT_STROKE: PdfColor = { r: 0.25, g: 0.35, b: 0.5 };
const DEFAULT_FILL: PdfColor = { r: 1, g: 0.95, b: 0.3 };

/**
 * Writes PDF Hub annotations as native PDF /Annot dictionaries.
 *
 * The writer never draws annotation appearance into the page content stream.
 * Existing non-PDF-Hub annotations are preserved. PDF Hub annotations are
 * upserted by /NM so repeated saves do not duplicate them.
 */
export async function writeNativePdfAnnotations(
  baseBytes: Uint8Array,
  annotations: PdfAnnotation[],
): Promise<NativeAnnotationWriteResult> {
  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(baseBytes);

  let annotationCount = 0;
  let replyCount = 0;

  const byPage = new Map<number, PdfAnnotation[]>();
  for (const annotation of annotations) {
    if (annotation.pageNumber < 1 || annotation.pageNumber > doc.getPageCount()) {
      continue;
    }
    const pageAnnotations = byPage.get(annotation.pageNumber) ?? [];
    pageAnnotations.push(annotation);
    byPage.set(annotation.pageNumber, pageAnnotations);
  }

  for (const [pageNumber, pageAnnotations] of byPage) {
    const page = doc.getPage(pageNumber - 1);
    const annots = getOrCreateAnnotsArray(doc, page, lib);

    for (const annotation of pageAnnotations) {
      const stateGraph = collectReviewStateGraph(annots, annotation.id, lib);
      removeManagedAnnotationFamily(annots, annotation.id, lib);

      const rootRef = registerNativeAnnotation(doc, page, annotation, lib);
      annots.push(rootRef);
      annotationCount += 1;

      relinkReviewStateRoots(stateGraph, rootRef, lib);

      const replies = annotation.data.review?.replies ?? [];
      for (const reply of replies) {
        const replyRef = doc.context.register(
          doc.context.obj({
            Type: 'Annot',
            Subtype: 'Text',
            Rect: replyRect(annotation, page),
            P: page.ref,
            Contents: pdfText(lib, reply.content),
            T: pdfText(lib, reply.author || 'Unknown'),
            NM: lib.PDFString.of(replyAnnotationName(annotation.id, reply.id)),
            PDFHubReplyId: lib.PDFString.of(reply.id),
            M: lib.PDFString.of(pdfDate(reply.createdAt)),
            CreationDate: lib.PDFString.of(pdfDate(reply.createdAt)),
            F: 4,
            Name: 'Comment',
            Open: false,
            IRT: rootRef,
            RT: 'R',
          }),
        );
        annots.push(replyRef);
        replyCount += 1;
      }

      if (annotation.data.review) {
        appendReviewStateTransitionIfNeeded(
          doc,
          page,
          annots,
          annotation,
          rootRef,
          stateGraph,
          lib,
        );
      }
    }
  }

  return {
    bytes: new Uint8Array(await doc.save()),
    annotationCount,
    replyCount,
  };
}

function getOrCreateAnnotsArray(
  doc: PDFDocument,
  page: PDFPage,
  lib: PdfLibModule,
): PDFArray {
  const existing =
    page.node.lookupMaybe(lib.PDFName.of('Annots'), lib.PDFArray)
    ?? doc.context.obj([]);

  page.node.set(lib.PDFName.of('Annots'), existing);
  return existing;
}

function removeManagedAnnotationFamily(
  annots: PDFArray,
  annotationId: string,
  lib: PdfLibModule,
): void {
  let rootRefKey: string | null = null;

  for (let index = 0; index < annots.size(); index += 1) {
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const name = readAnnotationName(dict, lib);
    if (name !== annotationId) continue;

    rootRefKey = pdfObjectKey(annots.get(index), lib);
    break;
  }

  for (let index = annots.size() - 1; index >= 0; index -= 1) {
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const name = readAnnotationName(dict, lib);
    const irtKey = pdfObjectKey(dict.get(lib.PDFName.of('IRT')), lib);
    const relatedReplyToManagedRoot = Boolean(
      rootRefKey
      && irtKey === rootRefKey
      && isReplyAnnotation(dict, lib),
    );

    if (
      name === annotationId
      || name?.startsWith(`${annotationId}:reply:`)
      || relatedReplyToManagedRoot
    ) {
      annots.remove(index);
    }
  }
}

function readAnnotationName(dict: PDFDict, lib: PdfLibModule): string | null {
  const value = dict.lookup(lib.PDFName.of('NM'));
  if (value instanceof lib.PDFString || value instanceof lib.PDFHexString) {
    return value.decodeText();
  }
  return null;
}

function isStateAnnotation(dict: PDFDict, lib: PdfLibModule): boolean {
  const stateModel = readTextOrName(dict, 'StateModel', lib);
  const state = readTextOrName(dict, 'State', lib);
  return stateModel === 'Review' && Boolean(state);
}

function isReplyAnnotation(dict: PDFDict, lib: PdfLibModule): boolean {
  if (isStateAnnotation(dict, lib)) return false;
  const replyType = dict.lookupMaybe(lib.PDFName.of('RT'), lib.PDFName)?.decodeText();
  return !replyType || replyType === 'R';
}

function collectReviewStateGraph(
  annots: PDFArray,
  annotationId: string,
  lib: PdfLibModule,
): ReviewStateGraph {
  let rootRefKey: string | null = null;
  const candidates: ReviewStateRecord[] = [];

  for (let index = 0; index < annots.size(); index += 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const refKey = pdfObjectKey(raw, lib);
    if (readAnnotationName(dict, lib) === annotationId) {
      rootRefKey = refKey;
    }

    if (!refKey || !(raw instanceof lib.PDFRef) || !isStateAnnotation(dict, lib)) {
      continue;
    }

    candidates.push({
      ref: raw,
      refKey,
      dict,
      index,
      parentKey: pdfObjectKey(dict.get(lib.PDFName.of('IRT')), lib),
      author: readTextOrName(dict, 'T', lib) ?? 'Unknown',
      state: readTextOrName(dict, 'State', lib) ?? 'None',
      timestamp: readPdfDateValue(dict, 'M', lib)
        ?? readPdfDateValue(dict, 'CreationDate', lib)
        ?? 0,
    });
  }

  if (!rootRefKey) {
    return { rootRefKey: null, records: [] };
  }

  const byRef = new Map(candidates.map((record) => [record.refKey, record]));
  const records = candidates.filter((record) => {
    let parentKey = record.parentKey;
    const visited = new Set<string>();

    while (parentKey) {
      if (parentKey === rootRefKey) return true;
      if (visited.has(parentKey)) return false;
      visited.add(parentKey);
      parentKey = byRef.get(parentKey)?.parentKey ?? null;
    }

    return false;
  });

  return { rootRefKey, records };
}

function relinkReviewStateRoots(
  graph: ReviewStateGraph,
  newRootRef: PDFRef,
  lib: PdfLibModule,
): void {
  if (!graph.rootRefKey) return;

  for (const record of graph.records) {
    if (record.parentKey === graph.rootRefKey) {
      record.dict.set(lib.PDFName.of('IRT'), newRootRef);
    }
  }
}

function appendReviewStateTransitionIfNeeded(
  doc: PDFDocument,
  page: PDFPage,
  annots: PDFArray,
  annotation: PdfAnnotation,
  rootRef: PDFRef,
  graph: ReviewStateGraph,
  lib: PdfLibModule,
): void {
  const review = annotation.data.review;
  if (!review) return;

  const desiredStatus = review.status;
  const latest = latestReviewStateRecord(graph.records);
  if (latest && reviewStatusFromState(latest.state) === desiredStatus) {
    return;
  }

  const author = review.statusAuthor ?? review.author ?? 'Unknown';
  const parentRef = rootRef;
  const transitionTime = graph.records.length > 0
    ? review.updatedAt
    : review.createdAt;

  const stateRef = doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: replyRect(annotation, page),
      P: page.ref,
      T: pdfText(lib, author),
      NM: lib.PDFString.of(nextStateAnnotationName(annotation.id, annots, lib)),
      M: lib.PDFString.of(pdfDate(transitionTime)),
      CreationDate: lib.PDFString.of(pdfDate(transitionTime)),
      IRT: parentRef,
      StateModel: pdfText(lib, 'Review'),
      State: pdfText(lib, reviewStateName(desiredStatus)),
      PDFHubReviewStatus: lib.PDFString.of(desiredStatus),
    }),
  );
  annots.push(stateRef);
}

function latestReviewStateRecord(
  records: ReviewStateRecord[],
): ReviewStateRecord | undefined {
  return [...records].sort(
    (left, right) =>
      (right.timestamp - left.timestamp)
      || (right.index - left.index),
  )[0];
}

function reviewStatusFromState(
  state: string,
): 'open' | 'resolved' | 'rejected' {
  if (state === 'Completed' || state === 'Accepted') return 'resolved';
  if (state === 'Rejected' || state === 'Cancelled') return 'rejected';
  return 'open';
}

function nextStateAnnotationName(
  annotationId: string,
  annots: PDFArray,
  lib: PdfLibModule,
): string {
  const existing = new Set<string>();
  for (let index = 0; index < annots.size(); index += 1) {
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;
    const name = readAnnotationName(dict, lib);
    if (name) existing.add(name);
  }

  const base = stateAnnotationName(annotationId);
  if (!existing.has(base)) return base;

  let sequence = 2;
  while (existing.has(`${base}:${sequence}`)) {
    sequence += 1;
  }
  return `${base}:${sequence}`;
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

function readPdfDateValue(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): number | null {
  const raw = readTextOrName(dict, key, lib);
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

function registerNativeAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  annotation: PdfAnnotation,
  lib: PdfLibModule,
): PDFRef {
  const geometry = toPdfGeometry(annotation, page);
  const stroke = readColor(annotation.data.borderColor, DEFAULT_STROKE);
  const fill = readColor(annotation.data.backgroundColor, DEFAULT_FILL);
  const opacity =
    typeof annotation.data.opacity === 'number'
      ? clamp(annotation.data.opacity, 0, 1)
      : 1;
  const borderWidth =
    typeof annotation.data.borderWidth === 'number'
      ? Math.max(0, annotation.data.borderWidth)
      : 1;

  const contents = annotationText(annotation);
  const author =
    annotation.data.review?.author
    ?? (typeof annotation.data.author === 'string' ? annotation.data.author : 'PDF Hub');
  const modifiedAt = annotation.data.review?.updatedAt ?? annotation.updatedAt;
  const createdAt = annotation.data.review?.createdAt ?? annotation.createdAt;

  const base: Record<string, unknown> = {
    Type: 'Annot',
    Subtype: subtypeFor(annotation.type),
    Rect: geometry.rect,
    P: page.ref,
    NM: lib.PDFString.of(annotation.id),
    M: lib.PDFString.of(pdfDate(modifiedAt)),
    CreationDate: lib.PDFString.of(pdfDate(createdAt)),
    T: pdfText(lib, author),
    F: 4,
    PDFHubVersion: 1,
    PDFHubType: lib.PDFString.of(annotation.type),
    PDFHubData: pdfText(lib, JSON.stringify(serializableAnnotationData(annotation))),
  };

  if (contents) {
    base.Contents = pdfText(lib, contents);
  }

  if (annotation.data.review) {
    // Keep private status only as a backward-compatible cache. Portable review
    // state is written as a separate state annotation linked through /IRT.
    base.PDFHubReviewStatus = lib.PDFString.of(annotation.data.review.status);
  }

  addSubtypeFields(base, annotation, geometry, stroke, fill, opacity, borderWidth, lib);

  const dict = doc.context.obj(base) as PDFDict;
  return doc.context.register(dict);
}

function addSubtypeFields(
  target: Record<string, unknown>,
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
  stroke: PdfColor,
  fill: PdfColor,
  opacity: number,
  borderWidth: number,
  lib: PdfLibModule,
): void {
  switch (annotation.type) {
    case 'comment':
    case 'sticky-note':
      target.Name = 'Comment';
      target.Open = annotation.type === 'sticky-note' && annotation.data.isCollapsed === false;
      target.C = colorArray(fill);
      return;

    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'squiggly':
      target.QuadPoints = quadPoints(geometry);
      target.C = colorArray(
        annotation.type === 'highlight' ? fill : stroke,
      );
      target.CA = opacity;
      return;

    case 'textbox':
    case 'callout': {
      const fontSize =
        typeof annotation.data.fontSize === 'number'
          ? clamp(annotation.data.fontSize, 6, 144)
          : 12;
      target.DA = lib.PDFString.of(`/Helvetica ${fontSize} Tf 0 g`);
      target.Q = textAlignment(annotation.data.textAlign);
      target.C = colorArray(stroke);
      target.IC = colorArray(fill);
      target.Border = [0, 0, borderWidth];

      if (annotation.type === 'callout') {
        target.IT = 'FreeTextCallout';
        const calloutLine = calloutCoordinates(annotation, geometry);
        if (calloutLine) target.CL = calloutLine;
      }
      return;
    }

    case 'shape-rect':
    case 'shape-cloud':
    case 'redaction':
      target.C = colorArray(annotation.type === 'redaction' ? { r: 0, g: 0, b: 0 } : stroke);
      target.IC = colorArray(annotation.type === 'redaction' ? { r: 0, g: 0, b: 0 } : fill);
      target.Border = [0, 0, borderWidth];
      target.CA = opacity;
      if (annotation.type === 'shape-cloud') {
        target.BE = { S: 'C', I: 1 };
      }
      return;

    case 'shape-ellipse':
      target.C = colorArray(stroke);
      target.IC = colorArray(fill);
      target.Border = [0, 0, borderWidth];
      target.CA = opacity;
      return;

    case 'shape-polygon':
      target.Vertices = polygonVertices(annotation, geometry);
      target.C = colorArray(stroke);
      target.IC = colorArray(fill);
      target.Border = [0, 0, borderWidth];
      target.CA = opacity;
      return;

    case 'line':
    case 'arrow':
      target.L = lineCoordinates(annotation, geometry);
      target.LE = [
        lineEnding(annotation.data.lineStartCap, 'None'),
        lineEnding(
          annotation.data.lineEndCap,
          annotation.type === 'arrow' ? 'OpenArrow' : 'None',
        ),
      ];
      target.C = colorArray(stroke);
      target.Border = [0, 0, borderWidth];
      target.CA = opacity;
      return;

    case 'ink':
      target.InkList = inkLists(annotation, geometry);
      target.C = colorArray(stroke);
      target.Border = [0, 0, borderWidth];
      target.CA = opacity;
      return;

    case 'stamp':
      target.Name = stampName(annotation.data.stampStyle);
      target.C = colorArray(stroke);
      target.CA = opacity;
      return;
  }
}

function subtypeFor(type: PdfAnnotation['type']): string {
  switch (type) {
    case 'comment':
    case 'sticky-note':
      return 'Text';
    case 'highlight':
      return 'Highlight';
    case 'underline':
      return 'Underline';
    case 'strikeout':
      return 'StrikeOut';
    case 'squiggly':
      return 'Squiggly';
    case 'textbox':
    case 'callout':
      return 'FreeText';
    case 'shape-rect':
    case 'shape-cloud':
    case 'redaction':
      return 'Square';
    case 'shape-ellipse':
      return 'Circle';
    case 'shape-polygon':
      return 'Polygon';
    case 'line':
    case 'arrow':
      return 'Line';
    case 'ink':
      return 'Ink';
    case 'stamp':
      return 'Stamp';
  }
}

function toPdfGeometry(annotation: PdfAnnotation, page: PDFPage): AnnotationGeometry {
  const pageHeight = page.getHeight();
  const x = annotation.rect.x;
  const y = pageHeight - annotation.rect.y - annotation.rect.height;
  const width = Math.max(0, annotation.rect.width);
  const height = Math.max(0, annotation.rect.height);

  return {
    x,
    y,
    width,
    height,
    pageHeight,
    rect: [x, y, x + width, y + height],
  };
}

function quadPoints(geometry: AnnotationGeometry): number[] {
  const left = geometry.x;
  const right = geometry.x + geometry.width;
  const bottom = geometry.y;
  const top = geometry.y + geometry.height;

  return [
    left, top,
    right, top,
    left, bottom,
    right, bottom,
  ];
}

function polygonVertices(
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
): number[] {
  const points = Array.isArray(annotation.data.points)
    ? annotation.data.points
    : [];

  if (points.length >= 6 && points.length % 2 === 0) {
    const result: number[] = [];
    for (let index = 0; index < points.length; index += 2) {
      const px = Number(points[index]);
      const py = Number(points[index + 1]);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      result.push(px, geometry.pageHeight - py);
    }
    if (result.length >= 6) return result;
  }

  return [
    geometry.x, geometry.y,
    geometry.x + geometry.width, geometry.y,
    geometry.x + geometry.width, geometry.y + geometry.height,
    geometry.x, geometry.y + geometry.height,
  ];
}

function lineCoordinates(
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
): number[] {
  const points =
    Array.isArray(annotation.data.points) && annotation.data.points.length >= 4
      ? annotation.data.points
      : [0, geometry.height / 2, geometry.width, geometry.height / 2];

  const x1 = geometry.x + finite(points[0], 0);
  const y1 = geometry.y + geometry.height - finite(points[1], geometry.height / 2);
  const x2 = geometry.x + finite(points[2], geometry.width);
  const y2 = geometry.y + geometry.height - finite(points[3], geometry.height / 2);

  return [x1, y1, x2, y2];
}

function inkLists(
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
): number[][] {
  const paths = Array.isArray(annotation.data.paths)
    ? annotation.data.paths
    : [];

  const result: number[][] = [];

  for (const path of paths) {
    if (!Array.isArray(path) || path.length < 4) continue;
    const converted: number[] = [];

    for (let index = 0; index + 1 < path.length; index += 2) {
      converted.push(
        geometry.x + finite(path[index], 0),
        geometry.y + geometry.height - finite(path[index + 1], 0),
      );
    }

    if (converted.length >= 4) result.push(converted);
  }

  return result;
}

function calloutCoordinates(
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
): number[] | undefined {
  const anchor = readPoint(annotation.data.anchor);
  if (!anchor) return undefined;

  const knee = readPoint(annotation.data.knee);
  const end = closestRectPoint(annotation.rect, knee ?? anchor);

  const coordinates = [
    anchor.x,
    geometry.pageHeight - anchor.y,
  ];

  if (knee) {
    coordinates.push(knee.x, geometry.pageHeight - knee.y);
  }

  coordinates.push(end.x, geometry.pageHeight - end.y);
  return coordinates;
}

function closestRectPoint(
  rect: PdfAnnotation['rect'],
  point: Point2D,
): Point2D {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.width),
    y: clamp(point.y, rect.y, rect.y + rect.height),
  };
}

function replyRect(annotation: PdfAnnotation, page: PDFPage): number[] {
  const geometry = toPdfGeometry(annotation, page);
  const size = 18;
  return [
    geometry.x,
    geometry.y + geometry.height,
    geometry.x + size,
    geometry.y + geometry.height + size,
  ];
}

function annotationText(annotation: PdfAnnotation): string {
  if (typeof annotation.data.text === 'string' && annotation.data.text.trim()) {
    return annotation.data.text.trim();
  }
  if (typeof annotation.data.content === 'string' && annotation.data.content.trim()) {
    return annotation.data.content.trim();
  }
  if (annotation.data.review?.title?.trim()) {
    return annotation.data.review.title.trim();
  }
  return '';
}

function reviewStateName(status: 'open' | 'resolved' | 'rejected'): string {
  if (status === 'resolved') return 'Completed';
  if (status === 'rejected') return 'Rejected';
  return 'None';
}

function textAlignment(value: unknown): number {
  if (value === 'center') return 1;
  if (value === 'right') return 2;
  return 0;
}

function lineEnding(value: unknown, fallback: string): string {
  switch (value) {
    case 'arrow':
      return 'OpenArrow';
    case 'circle':
      return 'Circle';
    case 'square':
      return 'Square';
    case 'none':
      return 'None';
    default:
      return fallback;
  }
}

function stampName(value: unknown): string {
  switch (value) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'draft':
      return 'Draft';
    case 'confidential':
      return 'Confidential';
    default:
      return 'Draft';
  }
}

function readPoint(value: unknown): Point2D | null {
  if (!value || typeof value !== 'object') return null;
  const x = (value as { x?: unknown }).x;
  const y = (value as { y?: unknown }).y;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return { x, y };
}

function readColor(value: unknown, fallback: PdfColor): PdfColor {
  if (typeof value !== 'string' || value === 'transparent') {
    return fallback;
  }

  const normalized = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(normalized);
  if (short) {
    return {
      r: parseInt(short[1][0] + short[1][0], 16) / 255,
      g: parseInt(short[1][1] + short[1][1], 16) / 255,
      b: parseInt(short[1][2] + short[1][2], 16) / 255,
    };
  }

  const full = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!full) return fallback;

  return {
    r: parseInt(full[1].slice(0, 2), 16) / 255,
    g: parseInt(full[1].slice(2, 4), 16) / 255,
    b: parseInt(full[1].slice(4, 6), 16) / 255,
  };
}

function colorArray(color: PdfColor): number[] {
  return [color.r, color.g, color.b];
}

function pdfDate(timestamp: number): string {
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const pad = (value: number) => String(value).padStart(2, '0');

  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function replyAnnotationName(annotationId: string, replyId: string): string {
  return `${annotationId}:reply:${replyId}`;
}

function stateAnnotationName(annotationId: string): string {
  return `${annotationId}:state:Review`;
}

function pdfObjectKey(value: unknown, lib: PdfLibModule): string | null {
  return value instanceof lib.PDFRef ? value.toString() : null;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


function serializableAnnotationData(annotation: PdfAnnotation): Record<string, unknown> {
  const data = { ...annotation.data };

  if (data.review) {
    data.review = {
      ...data.review,
      replies: [],
    };
  }

  // Large binary payloads should remain in dedicated asset storage rather than
  // being copied into a custom PDF string.
  delete data.stampImageDataUrl;

  return data;
}

function pdfText(lib: PdfLibModule, value: string) {
  return lib.PDFHexString.fromText(value);
}
