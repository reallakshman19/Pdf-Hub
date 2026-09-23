import type {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFPage,
  PDFRef,
} from 'pdf-lib';

import type { PdfAnnotation, Point2D } from '@/core/annotations/types';
import type { ReviewReply } from '@/core/review/types';
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
  rootStateRecords: ReviewStateRecord[];
}

interface ExistingReplyRecord {
  ref: PDFRef;
  refKey: string;
  dict: PDFDict;
  index: number;
  parentKey: string | null;
  logicalId: string;
}

interface ExistingReplyGraph {
  rootRefKey: string | null;
  records: ExistingReplyRecord[];
}

const DEFAULT_STROKE: PdfColor = { r: 0.25, g: 0.35, b: 0.5 };
const DEFAULT_FILL: PdfColor = { r: 1, g: 0.95, b: 0.3 };

const ROOT_OWNED_KEYS = new Set([
  'Type', 'Subtype', 'Rect', 'P', 'NM', 'M', 'CreationDate', 'T', 'F',
  'Contents', 'PDFHubVersion', 'PDFHubType', 'PDFHubData', 'PDFHubReviewStatus',
  'State', 'StateModel', 'IRT', 'RT',
  'Name', 'Open', 'C', 'CA', 'IC', 'Border', 'BS', 'DA', 'Q', 'IT', 'CL', 'BE',
  'Vertices', 'L', 'LE', 'InkList', 'QuadPoints',
]);

const ROOT_APPEARANCE_KEYS = [
  'Subtype', 'Rect', 'Contents', 'F', 'Name', 'Open', 'C', 'CA', 'IC',
  'Border', 'BS', 'DA', 'Q', 'IT', 'CL', 'BE', 'Vertices', 'L', 'LE',
  'InkList', 'QuadPoints',
] as const;

const REPLY_OWNED_KEYS = new Set([
  'Type', 'Subtype', 'P', 'Contents', 'T', 'NM', 'PDFHubReplyId',
  'M', 'CreationDate', 'IRT', 'RT',
]);

const REPLY_APPEARANCE_KEYS = ['Subtype', 'Contents'] as const;

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
      const existingRoot = findManagedRootDict(annots, annotation.id, lib);
      const replyGraph = collectExistingReplyGraph(annots, annotation.id, lib);
      const stateGraph = collectReviewStateGraph(annots, annotation.id, lib);
      const replies = annotation.data.review?.replies ?? [];
      assertNativeRichTextRootMutationSupported(
        existingRoot,
        annotation,
        lib,
      );
      assertNativeRichTextReplyMutationsSupported(
        replyGraph,
        replies,
        lib,
      );
      const representedReplyIds = new Set(replies.map((reply) => reply.id));
      removeManagedAnnotationFamily(
        annots,
        annotation.id,
        replyGraph,
        representedReplyIds,
        lib,
      );

      const rootRef = registerNativeAnnotation(
        doc,
        page,
        annotation,
        existingRoot,
        lib,
      );
      annots.push(rootRef);
      annotationCount += 1;

      const replyRefById = writeNativeReplies(
        doc,
        page,
        annots,
        annotation,
        rootRef,
        replies,
        replyGraph,
        lib,
      );
      replyCount += replies.length;

      relinkPreservedReplyParents(
        replyGraph,
        representedReplyIds,
        rootRef,
        replyRefById,
        lib,
      );

      relinkReviewStateParents(
        stateGraph,
        replyGraph,
        rootRef,
        replyRefById,
        lib,
      );

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

function assertNativeRichTextRootMutationSupported(
  source: PDFDict | null,
  annotation: PdfAnnotation,
  lib: PdfLibModule,
): void {
  if (!hasNativeRichText(source, lib)) return;

  const snapshot = annotation.data.nativeInterop?.protectedSnapshot;
  if (
    annotation.data.nativeInterop?.fidelityClass !== 'NATIVE_PRESERVED_READ_ONLY'
    || annotation.data.nativeInterop.reason !== 'RICH_TEXT'
    || !snapshot
  ) {
    throw nativeRichTextMutationError(annotation.id, 'missing protected import snapshot');
  }

  const currentText =
    typeof annotation.data.text === 'string'
      ? annotation.data.text
      : '';

  if (annotation.type !== snapshot.type) {
    throw nativeRichTextMutationError(annotation.id, 'annotation type');
  }
  if (currentText !== snapshot.text) {
    throw nativeRichTextMutationError(annotation.id, 'text');
  }
  if (!optionalNumberEqual(annotation.data.fontSize, snapshot.fontSize)) {
    throw nativeRichTextMutationError(annotation.id, 'font size');
  }
  if (!optionalStringEqual(annotation.data.textColor, snapshot.textColor)) {
    throw nativeRichTextMutationError(annotation.id, 'text color');
  }
  if (!optionalStringEqual(annotation.data.textAlign, snapshot.textAlign)) {
    throw nativeRichTextMutationError(annotation.id, 'text alignment');
  }
}

function assertNativeRichTextReplyMutationsSupported(
  graph: ExistingReplyGraph,
  replies: ReviewReply[],
  lib: PdfLibModule,
): void {
  const sourceById = new Map(
    graph.records.map((record) => [record.logicalId, record.dict]),
  );

  for (const reply of replies) {
    const source = sourceById.get(reply.id);
    if (!hasNativeRichText(source ?? null, lib)) continue;

    const sourceContents = readTextObject(source!, 'Contents', lib) ?? '';
    if (reply.content !== sourceContents) {
      throw nativeRichTextMutationError(
        `${reply.id}`,
        'reply text',
      );
    }
  }
}

function hasNativeRichText(
  dict: PDFDict | null,
  lib: PdfLibModule,
): boolean {
  return Boolean(dict?.get(lib.PDFName.of('RC')));
}

function nativeRichTextMutationError(
  annotationId: string,
  field: string,
): Error {
  return new Error(
    `NATIVE_RICH_TEXT_EDIT_UNSUPPORTED: ${annotationId}: ${field}. `
    + 'This annotation contains native /RC rich text that PDF Hub preserves read-only.',
  );
}

function optionalNumberEqual(
  left: unknown,
  right: number | undefined,
): boolean {
  if (right === undefined) return left === undefined;
  return typeof left === 'number' && nearlyEqual(left, right);
}

function optionalStringEqual(
  left: unknown,
  right: string | undefined,
): boolean {
  if (right === undefined) return left === undefined;
  return left === right;
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

function findManagedRootDict(
  annots: PDFArray,
  annotationId: string,
  lib: PdfLibModule,
): PDFDict | null {
  for (let index = 0; index < annots.size(); index += 1) {
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (dict && readAnnotationName(dict, lib) === annotationId) {
      return dict;
    }
  }
  return null;
}

function removeManagedAnnotationFamily(
  annots: PDFArray,
  annotationId: string,
  replyGraph: ExistingReplyGraph,
  representedReplyIds: Set<string>,
  lib: PdfLibModule,
): void {
  const replyRefKeys = new Set(
    replyGraph.records
      .filter((record) => representedReplyIds.has(record.logicalId))
      .map((record) => record.refKey),
  );

  for (let index = annots.size() - 1; index >= 0; index -= 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const name = readAnnotationName(dict, lib);
    const refKey = pdfObjectKey(raw, lib);

    if (
      name === annotationId
      || Boolean(refKey && replyRefKeys.has(refKey))
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

function collectExistingReplyGraph(
  annots: PDFArray,
  annotationId: string,
  lib: PdfLibModule,
): ExistingReplyGraph {
  let rootRefKey: string | null = null;
  const candidates: ExistingReplyRecord[] = [];

  for (let index = 0; index < annots.size(); index += 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const refKey = pdfObjectKey(raw, lib);
    if (readAnnotationName(dict, lib) === annotationId) {
      rootRefKey = refKey;
    }

    if (!refKey || !(raw instanceof lib.PDFRef) || !isReplyAnnotation(dict, lib)) {
      continue;
    }

    candidates.push({
      ref: raw,
      refKey,
      dict,
      index,
      parentKey: pdfObjectKey(dict.get(lib.PDFName.of('IRT')), lib),
      logicalId: readReplyLogicalId(dict, annotationId, index, lib),
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

function readReplyLogicalId(
  dict: PDFDict,
  annotationId: string,
  index: number,
  lib: PdfLibModule,
): string {
  const privateId = readTextOrName(dict, 'PDFHubReplyId', lib);
  const annotationName = readAnnotationName(dict, lib);
  const prefix = `${annotationId}:reply:`;

  return (
    privateId
    ?? (
      annotationName?.startsWith(prefix) && annotationName.length > prefix.length
        ? annotationName.slice(prefix.length)
        : null
    )
    ?? annotationName
    ?? `${annotationId}:native-reply:${index}`
  );
}

function collectReviewStateGraph(
  annots: PDFArray,
  annotationId: string,
  lib: PdfLibModule,
): ReviewStateGraph {
  let rootRefKey: string | null = null;
  const candidates: ReviewStateRecord[] = [];
  const parentByRef = new Map<string, string | null>();

  for (let index = 0; index < annots.size(); index += 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const refKey = pdfObjectKey(raw, lib);
    if (readAnnotationName(dict, lib) === annotationId) {
      rootRefKey = refKey;
    }

    if (refKey) {
      parentByRef.set(
        refKey,
        pdfObjectKey(dict.get(lib.PDFName.of('IRT')), lib),
      );
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
    return { rootRefKey: null, records: [], rootStateRecords: [] };
  }

  const stateRefKeys = new Set(candidates.map((record) => record.refKey));
  const records: ReviewStateRecord[] = [];
  const rootStateRecords: ReviewStateRecord[] = [];

  for (const record of candidates) {
    let parentKey = record.parentKey;
    const visited = new Set<string>();
    let reachesRoot = false;
    let stateOnlyAncestry = true;

    while (parentKey) {
      if (parentKey === rootRefKey) {
        reachesRoot = true;
        break;
      }
      if (visited.has(parentKey)) break;
      visited.add(parentKey);

      if (!stateRefKeys.has(parentKey)) {
        stateOnlyAncestry = false;
      }
      parentKey = parentByRef.get(parentKey) ?? null;
    }

    if (!reachesRoot) continue;
    records.push(record);
    if (stateOnlyAncestry) {
      rootStateRecords.push(record);
    }
  }

  return { rootRefKey, records, rootStateRecords };
}

function writeNativeReplies(
  doc: PDFDocument,
  page: PDFPage,
  annots: PDFArray,
  annotation: PdfAnnotation,
  rootRef: PDFRef,
  replies: ReviewReply[],
  sourceGraph: ExistingReplyGraph,
  lib: PdfLibModule,
): Map<string, PDFRef> {
  const replyRefById = new Map<string, PDFRef>();
  const replyDictById = new Map<string, PDFDict>();
  const sourceById = new Map(
    sourceGraph.records.map((record) => [record.logicalId, record]),
  );

  for (const reply of replies) {
    const replyDict = doc.context.obj({
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
    }) as PDFDict;

    preservePassiveAnnotationEntries(
      sourceById.get(reply.id)?.dict ?? null,
      replyDict,
      REPLY_OWNED_KEYS,
      REPLY_APPEARANCE_KEYS,
      lib,
    );

    const replyRef = doc.context.register(replyDict);
    relinkPopupParent(sourceById.get(reply.id)?.dict ?? null, replyRef, lib);
    annots.push(replyRef);
    replyRefById.set(reply.id, replyRef);
    replyDictById.set(reply.id, replyDict);
  }

  const replyById = new Map(replies.map((reply) => [reply.id, reply]));
  for (const reply of replies) {
    const parentReplyId = validParentReplyId(
      reply,
      replyById,
      sourceById,
    );
    if (!parentReplyId) continue;

    const parentRef =
      replyRefById.get(parentReplyId)
      ?? sourceById.get(parentReplyId)?.ref;
    const replyDict = replyDictById.get(reply.id);
    if (parentRef && replyDict) {
      replyDict.set(lib.PDFName.of('IRT'), parentRef);
    }
  }

  return replyRefById;
}

function validParentReplyId(
  reply: ReviewReply,
  replyById: Map<string, ReviewReply>,
  sourceById: Map<string, ExistingReplyRecord>,
): string | null {
  const directParentId = reply.parentReplyId;
  if (!directParentId || directParentId === reply.id) return null;

  // A parent absent from the app model may still be a preserved opaque native
  // reply. The collected source graph is already constrained to an acyclic
  // path back to the managed root, so retaining that native parent is safe.
  if (!replyById.has(directParentId)) {
    return sourceById.has(directParentId) ? directParentId : null;
  }

  let currentId: string | undefined = directParentId;
  const visited = new Set<string>([reply.id]);

  while (currentId) {
    if (visited.has(currentId)) return null;
    visited.add(currentId);
    const current = replyById.get(currentId);
    if (!current) {
      return sourceById.has(currentId) ? directParentId : null;
    }
    currentId = current.parentReplyId;
  }

  return directParentId;
}

function relinkPreservedReplyParents(
  graph: ExistingReplyGraph,
  representedReplyIds: Set<string>,
  newRootRef: PDFRef,
  replyRefById: Map<string, PDFRef>,
  lib: PdfLibModule,
): void {
  if (!graph.rootRefKey) return;

  const replyIdByOldRef = new Map(
    graph.records.map((record) => [record.refKey, record.logicalId]),
  );

  for (const record of graph.records) {
    if (representedReplyIds.has(record.logicalId)) continue;

    if (record.parentKey === graph.rootRefKey) {
      record.dict.set(lib.PDFName.of('IRT'), newRootRef);
      continue;
    }

    const parentReplyId = record.parentKey
      ? replyIdByOldRef.get(record.parentKey)
      : undefined;
    const newParentRef = parentReplyId
      ? replyRefById.get(parentReplyId)
      : undefined;

    if (newParentRef) {
      record.dict.set(lib.PDFName.of('IRT'), newParentRef);
    }
  }
}

function relinkReviewStateParents(
  graph: ReviewStateGraph,
  replyGraph: ExistingReplyGraph,
  newRootRef: PDFRef,
  replyRefById: Map<string, PDFRef>,
  lib: PdfLibModule,
): void {
  if (!graph.rootRefKey) return;

  const oldReplyIdByRef = new Map(
    replyGraph.records.map((record) => [record.refKey, record.logicalId]),
  );

  for (const record of graph.records) {
    if (record.parentKey === graph.rootRefKey) {
      record.dict.set(lib.PDFName.of('IRT'), newRootRef);
      continue;
    }

    const parentReplyId = record.parentKey
      ? oldReplyIdByRef.get(record.parentKey)
      : undefined;
    const newParentReplyRef = parentReplyId
      ? replyRefById.get(parentReplyId)
      : undefined;

    if (newParentReplyRef) {
      record.dict.set(lib.PDFName.of('IRT'), newParentReplyRef);
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
  const latest = latestReviewStateRecord(graph.rootStateRecords);
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

function preservePassiveAnnotationEntries(
  source: PDFDict | null,
  target: PDFDict,
  ownedKeys: Set<string>,
  appearanceKeys: readonly string[],
  lib: PdfLibModule,
): void {
  if (!source) return;

  const preserveAppearance = appearanceFieldsEquivalent(
    source,
    target,
    appearanceKeys,
    lib,
  );

  for (const key of source.keys()) {
    const name = key.decodeText();
    if (ownedKeys.has(name)) continue;
    if (name === 'AP' && !preserveAppearance) continue;

    const value = source.get(key);
    if (value) {
      target.set(key, value);
    }
  }
}

function relinkPopupParent(
  source: PDFDict | null,
  newParentRef: PDFRef,
  lib: PdfLibModule,
): void {
  if (!source) return;
  const popup = source.lookupMaybe(lib.PDFName.of('Popup'), lib.PDFDict);
  if (popup) {
    popup.set(lib.PDFName.of('Parent'), newParentRef);
  }
}

function appearanceFieldsEquivalent(
  source: PDFDict,
  target: PDFDict,
  keys: readonly string[],
  lib: PdfLibModule,
): boolean {
  return keys.every((key) => {
    const name = lib.PDFName.of(key);
    return pdfObjectsEquivalent(source.get(name), target.get(name), lib);
  });
}

function pdfObjectsEquivalent(
  left: unknown,
  right: unknown,
  lib: PdfLibModule,
): boolean {
  return JSON.stringify(pdfSemanticValue(left, lib))
    === JSON.stringify(pdfSemanticValue(right, lib));
}

function pdfSemanticValue(
  value: unknown,
  lib: PdfLibModule,
): unknown {
  if (value === undefined || value === null) return null;

  if (value instanceof lib.PDFString || value instanceof lib.PDFHexString) {
    return { type: 'string', value: value.decodeText() };
  }
  if (value instanceof lib.PDFName) {
    return { type: 'name', value: value.decodeText() };
  }
  if (value instanceof lib.PDFNumber) {
    return { type: 'number', value: value.asNumber() };
  }
  if (value instanceof lib.PDFArray) {
    return Array.from({ length: value.size() }, (_, index) =>
      pdfSemanticValue(value.get(index), lib));
  }
  if (value instanceof lib.PDFDict) {
    return value.keys()
      .map((key) => [key.decodeText(), pdfSemanticValue(value.get(key), lib)] as const)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  }

  return { type: 'other', value: String(value) };
}

function registerNativeAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  annotation: PdfAnnotation,
  sourceDict: PDFDict | null,
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
    F: annotationFlagsValue(annotation, sourceDict, lib),
    PDFHubVersion: 1,
    PDFHubType: lib.PDFString.of(annotation.type),
    PDFHubData: pdfText(lib, JSON.stringify(serializableAnnotationData(annotation))),
  };

  const sourceContents =
    hasNativeRichText(sourceDict, lib)
      ? sourceDict?.get(lib.PDFName.of('Contents'))
      : undefined;
  if (sourceContents) {
    base.Contents = sourceContents;
  } else if (contents) {
    base.Contents = pdfText(lib, contents);
  }

  if (annotation.data.review) {
    // Keep private status only as a backward-compatible cache. Portable review
    // state is written as a separate state annotation linked through /IRT.
    base.PDFHubReviewStatus = lib.PDFString.of(annotation.data.review.status);
  }

  addSubtypeFields(
    base,
    annotation,
    geometry,
    stroke,
    fill,
    opacity,
    borderWidth,
    sourceDict,
    lib,
  );

  const dict = doc.context.obj(base) as PDFDict;
  preservePassiveAnnotationEntries(
    sourceDict,
    dict,
    ROOT_OWNED_KEYS,
    ROOT_APPEARANCE_KEYS,
    lib,
  );
  const ref = doc.context.register(dict);
  relinkPopupParent(sourceDict, ref, lib);
  return ref;
}

function addSubtypeFields(
  target: Record<string, unknown>,
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
  stroke: PdfColor,
  fill: PdfColor,
  opacity: number,
  borderWidth: number,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): void {
  switch (annotation.type) {
    case 'comment':
    case 'sticky-note':
      target.Name = textAnnotationNameValue(sourceDict, lib);
      target.Open = annotation.data.isCollapsed === false;
      target.C = colorArray(fill);
      return;

    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'squiggly':
      target.QuadPoints = textMarkupQuadPoints(
        annotation,
        geometry,
        sourceDict,
        lib,
      );
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
      target.DA = defaultAppearanceValue(
        annotation,
        fontSize,
        sourceDict,
        lib,
      );
      target.Q = freeTextAlignmentValue(
        annotation,
        sourceDict,
        lib,
      );
      target.C = colorArray(stroke);
      target.IC = colorArray(fill);
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );

      if (annotation.type === 'callout') {
        target.IT = 'FreeTextCallout';
        const calloutLine = calloutCoordinates(annotation, geometry);
        if (calloutLine) target.CL = calloutLine;
      } else {
        const sourceIntent = sourceDict?.get(lib.PDFName.of('IT'));
        if (sourceIntent) target.IT = sourceIntent;
      }
      return;
    }

    case 'shape-rect':
    case 'shape-cloud':
    case 'redaction':
      target.C = colorArray(annotation.type === 'redaction' ? { r: 0, g: 0, b: 0 } : stroke);
      target.IC = colorArray(annotation.type === 'redaction' ? { r: 0, g: 0, b: 0 } : fill);
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      target.CA = opacity;
      if (annotation.type === 'shape-cloud') {
        target.BE = cloudBorderEffectValue(sourceDict, lib);
      }
      return;

    case 'shape-ellipse':
      target.C = colorArray(stroke);
      target.IC = colorArray(fill);
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      target.CA = opacity;
      return;

    case 'shape-polygon':
      target.Vertices = polygonVertices(annotation, geometry);
      target.C = colorArray(stroke);
      target.IC = colorArray(fill);
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      target.CA = opacity;
      return;

    case 'line':
    case 'arrow':
      target.L = lineCoordinates(annotation, geometry);
      target.LE = lineEndingsValue(
        annotation,
        sourceDict,
        lib,
      );
      target.C = colorArray(stroke);
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      target.CA = opacity;
      return;

    case 'ink':
      target.InkList = inkLists(annotation, geometry);
      target.C = colorArray(stroke);
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      target.CA = opacity;
      return;

    case 'stamp':
      target.Name = stampNameValue(annotation, sourceDict, lib);
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

function textMarkupQuadPoints(
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown {
  const normalized = readFiniteNumberArray(annotation.data.textMarkupQuads);
  const validNormalized = Boolean(
    normalized
    && normalized.length >= 8
    && normalized.length % 8 === 0,
  );

  const sourceQuadObject = sourceDict?.get(lib.PDFName.of('QuadPoints'));
  const sourceQuadArray = sourceDict
    ? sourceDict.lookupMaybe(lib.PDFName.of('QuadPoints'), lib.PDFArray)
    : undefined;
  const sourceRect = sourceDict
    ? readPdfNumberArray(sourceDict, 'Rect', lib)
    : null;

  if (
    validNormalized
    && sourceQuadObject
    && sourceQuadArray
    && sourceRect
    && numberArraysEquivalent(sourceRect, geometry.rect)
  ) {
    const sourceValues = readPdfArrayValues(sourceQuadArray, lib);
    const sourceNormalized = normalizePdfQuadPoints(
      sourceValues,
      geometry,
    );
    if (
      sourceNormalized
      && numberArraysEquivalent(sourceNormalized, normalized!)
    ) {
      return sourceQuadObject;
    }
  }

  if (validNormalized) {
    const values: number[] = [];
    for (let index = 0; index + 1 < normalized!.length; index += 2) {
      const nx = normalized![index];
      const ny = normalized![index + 1];
      const appX = annotation.rect.x + (nx * annotation.rect.width);
      const appY = annotation.rect.y + (ny * annotation.rect.height);
      values.push(appX, geometry.pageHeight - appY);
    }
    return values;
  }

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

function normalizePdfQuadPoints(
  values: number[],
  geometry: AnnotationGeometry,
): number[] | null {
  if (
    values.length < 8
    || values.length % 8 !== 0
    || geometry.width <= 0
    || geometry.height <= 0
  ) {
    return null;
  }

  const normalized: number[] = [];
  const appRectY = geometry.pageHeight - geometry.y - geometry.height;
  for (let index = 0; index + 1 < values.length; index += 2) {
    const appX = values[index];
    const appY = geometry.pageHeight - values[index + 1];
    const nx = (appX - geometry.x) / geometry.width;
    const ny = (appY - appRectY) / geometry.height;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    normalized.push(nx, ny);
  }
  return normalized;
}

function defaultAppearanceValue(
  annotation: PdfAnnotation,
  fontSize: number,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown {
  const sourceObject = sourceDict?.get(lib.PDFName.of('DA'));
  const sourceText = sourceDict
    ? readTextObject(sourceDict, 'DA', lib)
    : null;
  const desiredColor = readColor(annotation.data.textColor, { r: 0, g: 0, b: 0 });
  const hasExplicitTextColor =
    typeof annotation.data.textColor === 'string'
    && annotation.data.textColor !== 'transparent';

  if (
    sourceObject
    && sourceText
    && hasNativeRichText(sourceDict, lib)
  ) {
    return sourceObject;
  }

  if (sourceObject && sourceText) {
    const parsed = parseDefaultAppearance(sourceText);
    const fontMatches =
      typeof parsed.fontSize === 'number'
      && nearlyEqual(parsed.fontSize, fontSize);
    const colorMatches =
      !hasExplicitTextColor
      || (
        parsed.textColor
        && colorsEquivalent(parsed.textColor, desiredColor)
      );

    if (fontMatches && colorMatches) {
      return sourceObject;
    }

    return lib.PDFString.of(
      rewriteDefaultAppearance(
        sourceText,
        fontSize,
        desiredColor,
        hasExplicitTextColor,
      ),
    );
  }

  return lib.PDFString.of(
    `/Helvetica ${formatPdfNumber(fontSize)} Tf ${formatPdfColor(desiredColor)} rg`,
  );
}

function parseDefaultAppearance(
  source: string,
): { fontSize?: number; textColor?: PdfColor } {
  const tokens = source.trim().split(/\s+/).filter(Boolean);
  let fontSize: number | undefined;
  let textColor: PdfColor | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const operator = tokens[index];

    if (operator === 'Tf' && index >= 1) {
      const size = Number(tokens[index - 1]);
      if (Number.isFinite(size) && size > 0) fontSize = size;
      continue;
    }

    if (operator === 'g' && index >= 1) {
      const gray = Number(tokens[index - 1]);
      if (Number.isFinite(gray)) {
        textColor = { r: clamp(gray, 0, 1), g: clamp(gray, 0, 1), b: clamp(gray, 0, 1) };
      }
      continue;
    }

    if (operator === 'rg' && index >= 3) {
      const r = Number(tokens[index - 3]);
      const g = Number(tokens[index - 2]);
      const b = Number(tokens[index - 1]);
      if ([r, g, b].every((value) => Number.isFinite(value))) {
        textColor = {
          r: clamp(r, 0, 1),
          g: clamp(g, 0, 1),
          b: clamp(b, 0, 1),
        };
      }
      continue;
    }

    if (operator === 'k' && index >= 4) {
      const cyan = Number(tokens[index - 4]);
      const magenta = Number(tokens[index - 3]);
      const yellow = Number(tokens[index - 2]);
      const black = Number(tokens[index - 1]);
      if ([cyan, magenta, yellow, black].every((value) => Number.isFinite(value))) {
        textColor = {
          r: 1 - Math.min(1, cyan + black),
          g: 1 - Math.min(1, magenta + black),
          b: 1 - Math.min(1, yellow + black),
        };
      }
    }
  }

  return { fontSize, textColor };
}

function rewriteDefaultAppearance(
  source: string,
  fontSize: number,
  color: PdfColor,
  rewriteColor: boolean,
): string {
  const tokens = source.trim().split(/\s+/).filter(Boolean);
  let fontUpdated = false;

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === 'Tf' && index >= 1) {
      tokens[index - 1] = formatPdfNumber(fontSize);
      fontUpdated = true;
    }
  }

  if (!fontUpdated) {
    tokens.push('/Helvetica', formatPdfNumber(fontSize), 'Tf');
  }

  if (rewriteColor) {
    let colorIndex = -1;
    let operandCount = 0;
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      if (tokens[index] === 'g') {
        colorIndex = index;
        operandCount = 1;
        break;
      }
      if (tokens[index] === 'rg') {
        colorIndex = index;
        operandCount = 3;
        break;
      }
      if (tokens[index] === 'k') {
        colorIndex = index;
        operandCount = 4;
        break;
      }
    }

    const replacement = [
      formatPdfNumber(color.r),
      formatPdfNumber(color.g),
      formatPdfNumber(color.b),
      'rg',
    ];

    if (colorIndex >= operandCount) {
      tokens.splice(
        colorIndex - operandCount,
        operandCount + 1,
        ...replacement,
      );
    } else {
      tokens.push(...replacement);
    }
  }

  return tokens.join(' ');
}

function readTextObject(
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

function readPdfNumberArray(
  dict: PDFDict,
  key: string,
  lib: PdfLibModule,
): number[] | null {
  const array = dict.lookupMaybe(lib.PDFName.of(key), lib.PDFArray);
  return array ? readPdfArrayValues(array, lib) : null;
}

function readPdfArrayValues(
  array: PDFArray,
  lib: PdfLibModule,
): number[] {
  const values: number[] = [];
  for (let index = 0; index < array.size(); index += 1) {
    const value = array.lookupMaybe(index, lib.PDFNumber);
    if (!value) return [];
    values.push(value.asNumber());
  }
  return values;
}

function readFiniteNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(Number);
  return values.every((entry) => Number.isFinite(entry))
    ? values
    : null;
}

function numberArraysEquivalent(
  left: number[],
  right: number[],
  epsilon = 1e-8,
): boolean {
  return (
    left.length === right.length
    && left.every((value, index) => nearlyEqual(value, right[index], epsilon))
  );
}

function nearlyEqual(
  left: number,
  right: number,
  epsilon = 1e-8,
): boolean {
  return Math.abs(left - right) <= epsilon;
}

function colorsEquivalent(
  left: PdfColor,
  right: PdfColor,
  epsilon = 1 / 255,
): boolean {
  return (
    nearlyEqual(left.r, right.r, epsilon)
    && nearlyEqual(left.g, right.g, epsilon)
    && nearlyEqual(left.b, right.b, epsilon)
  );
}

function formatPdfNumber(value: number): string {
  return String(Number(value.toFixed(6)));
}

function formatPdfColor(color: PdfColor): string {
  return [
    formatPdfNumber(color.r),
    formatPdfNumber(color.g),
    formatPdfNumber(color.b),
  ].join(' ');
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

function annotationFlagsValue(
  annotation: PdfAnnotation,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): number {
  const sourceFlags =
    sourceDict?.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber()
    ?? 4;
  const flags = Math.max(0, Math.trunc(sourceFlags));

  if (typeof annotation.data.locked !== 'boolean') {
    return flags;
  }

  return annotation.data.locked
    ? (flags | 128)
    : (flags & ~128);
}

function textAnnotationNameValue(
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown {
  return sourceDict?.get(lib.PDFName.of('Name')) ?? 'Comment';
}

function applyAnnotationBorderFields(
  target: Record<string, unknown>,
  annotation: PdfAnnotation,
  fallbackWidth: number,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): void {
  target.Border = annotationBorderValue(
    annotation,
    fallbackWidth,
    sourceDict,
    lib,
  );
  const borderStyle = annotationBorderStyleValue(
    annotation,
    fallbackWidth,
    sourceDict,
    lib,
  );
  if (borderStyle) {
    target.BS = borderStyle;
  }
}

function annotationBorderValue(
  annotation: PdfAnnotation,
  fallbackWidth: number,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown {
  const desiredWidth =
    annotation.data.borderStyle === 'none'
      ? 0
      : fallbackWidth;
  const desiredStyle =
    annotation.data.borderStyle === 'dashed'
    || annotation.data.borderStyle === 'dotted'
    || annotation.data.borderStyle === 'none'
      ? annotation.data.borderStyle
      : 'solid';

  const sourceObject = sourceDict?.get(lib.PDFName.of('Border'));
  const sourceBs = sourceDict?.get(lib.PDFName.of('BS'));
  const sourceBorder = sourceDict
    ? readBorderSemantics(sourceDict, lib, false)
    : null;

  if (
    sourceBs
    && sourceObject
    && desiredStyle !== 'none'
  ) {
    return sourceObject;
  }

  if (
    sourceObject
    && sourceBorder
    && nearlyEqual(sourceBorder.width, desiredWidth)
    && sourceBorder.style === desiredStyle
  ) {
    return sourceObject;
  }

  if (desiredWidth <= 0 || desiredStyle === 'none') {
    return [0, 0, 0];
  }

  if (desiredStyle === 'dotted') {
    return [0, 0, desiredWidth, [1, 1]];
  }

  if (desiredStyle === 'dashed') {
    return [0, 0, desiredWidth, [3, 2]];
  }

  return [0, 0, desiredWidth];
}

function readBorderSemantics(
  dict: PDFDict,
  lib: PdfLibModule,
  preferBs = true,
): {
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'none' | undefined;
  rawStyle?: string;
} | null {
  if (preferBs) {
    const bs = dict.lookupMaybe(lib.PDFName.of('BS'), lib.PDFDict);
    if (bs) {
      const width =
        bs.lookupMaybe(lib.PDFName.of('W'), lib.PDFNumber)?.asNumber()
        ?? 1;
      if (!Number.isFinite(width)) return null;
      if (width <= 0) return { width: 0, style: 'none', rawStyle: 'S' };

      const rawStyle =
        bs.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.decodeText()
        ?? 'S';
      if (rawStyle === 'S') return { width, style: 'solid', rawStyle };
      if (rawStyle === 'D') {
        const dash = bs.lookupMaybe(lib.PDFName.of('D'), lib.PDFArray);
        const values = dash ? readPdfArrayValues(dash, lib) : [];
        const dotted = values.length > 0
          && values.every((value) => value <= 1.5);
        return {
          width,
          style: dotted ? 'dotted' : 'dashed',
          rawStyle,
        };
      }
      return { width, style: undefined, rawStyle };
    }
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

  const values = readPdfArrayValues(dash, lib);
  const dotted = values.length > 0
    && values.every((value) => value <= 1.5);
  return { width, style: dotted ? 'dotted' : 'dashed' };
}

function annotationBorderStyleValue(
  annotation: PdfAnnotation,
  fallbackWidth: number,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown | null {
  const sourceObject = sourceDict?.get(lib.PDFName.of('BS'));
  const sourceSemantics = sourceDict
    ? readBorderSemantics(sourceDict, lib, true)
    : null;

  const explicitStyle = annotation.data.borderStyle;
  const desiredWidth =
    explicitStyle === 'none'
      ? 0
      : fallbackWidth;

  if (sourceObject && sourceSemantics) {
    const styleMatches =
      sourceSemantics.style === undefined
        ? explicitStyle === undefined
        : sourceSemantics.style === (explicitStyle ?? 'solid');

    if (
      styleMatches
      && nearlyEqual(sourceSemantics.width, desiredWidth)
    ) {
      return sourceObject;
    }

    if (sourceSemantics.style === undefined && explicitStyle === undefined) {
      const rawStyle = sourceSemantics.rawStyle ?? 'S';
      const sourceBs = sourceDict?.lookupMaybe(lib.PDFName.of('BS'), lib.PDFDict);
      const sourceDash = sourceBs?.get(lib.PDFName.of('D'));
      return {
        W: desiredWidth,
        S: rawStyle,
        ...(sourceDash ? { D: sourceDash } : {}),
      };
    }
  }

  if (!sourceObject) return null;
  if (desiredWidth <= 0 || explicitStyle === 'none') return null;

  if (explicitStyle === 'dashed') {
    return { W: desiredWidth, S: 'D', D: [3, 2] };
  }
  if (explicitStyle === 'dotted') {
    return { W: desiredWidth, S: 'D', D: [1, 1] };
  }

  return { W: desiredWidth, S: 'S' };
}

function cloudBorderEffectValue(
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown {
  const sourceObject = sourceDict?.get(lib.PDFName.of('BE'));
  const effect = sourceDict?.lookupMaybe(lib.PDFName.of('BE'), lib.PDFDict);
  const style = effect?.lookupMaybe(lib.PDFName.of('S'), lib.PDFName)?.decodeText();
  return sourceObject && style === 'C'
    ? sourceObject
    : { S: 'C', I: 1 };
}

function lineEndingsValue(
  annotation: PdfAnnotation,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown {
  const sourceObject = sourceDict?.get(lib.PDFName.of('LE'));
  const sourceEndings = sourceDict
    ? readPdfLineEndings(sourceDict, lib)
    : null;

  const desiredStart = annotation.data.lineStartCap;
  const desiredEnd = annotation.data.lineEndCap;

  if (sourceObject && sourceEndings) {
    const sourceStart = lineCapFromPdfEnding(sourceEndings[0]);
    const sourceEnd = lineCapFromPdfEnding(sourceEndings[1]);
    const startMatches =
      sourceStart === undefined
        ? desiredStart === undefined
        : sourceStart === desiredStart;
    const endMatches =
      sourceEnd === undefined
        ? desiredEnd === undefined
        : sourceEnd === desiredEnd;

    if (startMatches && endMatches) {
      return sourceObject;
    }
  }

  return [
    lineEnding(desiredStart, 'None'),
    lineEnding(
      desiredEnd,
      annotation.type === 'arrow' ? 'OpenArrow' : 'None',
    ),
  ];
}

function readPdfLineEndings(
  dict: PDFDict,
  lib: PdfLibModule,
): [string, string] | null {
  const array = dict.lookupMaybe(lib.PDFName.of('LE'), lib.PDFArray);
  if (!array || array.size() < 2) return null;
  const start = array.lookupMaybe(0, lib.PDFName)?.decodeText();
  const end = array.lookupMaybe(1, lib.PDFName)?.decodeText();
  return start && end ? [start, end] : null;
}

function lineCapFromPdfEnding(
  value: string,
): 'none' | 'arrow' | 'circle' | 'square' | undefined {
  if (value === 'None') return 'none';
  if (
    value === 'OpenArrow'
    || value === 'ClosedArrow'
    || value === 'ROpenArrow'
    || value === 'RClosedArrow'
  ) {
    return 'arrow';
  }
  if (value === 'Circle') return 'circle';
  if (value === 'Square') return 'square';
  return undefined;
}

function stampNameValue(
  annotation: PdfAnnotation,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown {
  const sourceObject = sourceDict?.get(lib.PDFName.of('Name'));
  const sourceName = sourceDict
    ?.lookupMaybe(lib.PDFName.of('Name'), lib.PDFName)
    ?.decodeText();

  if (
    sourceObject
    && sourceName
    && stampStyleFromPdfName(sourceName) === (
      annotation.data.stampStyle ?? 'custom'
    )
  ) {
    return sourceObject;
  }

  return stampName(annotation.data.stampStyle);
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

function reviewStateName(status: 'open' | 'resolved' | 'rejected'): string {
  if (status === 'resolved') return 'Completed';
  if (status === 'rejected') return 'Rejected';
  return 'None';
}

function freeTextAlignmentValue(
  annotation: PdfAnnotation,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): unknown {
  if (hasNativeRichText(sourceDict, lib)) {
    const sourceQ = sourceDict?.get(lib.PDFName.of('Q'));
    if (sourceQ) return sourceQ;
  }
  return textAlignment(annotation.data.textAlign);
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
