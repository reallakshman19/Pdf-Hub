/**
 * PDF Content Stream & Annotation Redaction Sanitizer.
 *
 * Implements Phase 9 + Option A hardened irreversible content redaction:
 * - Tracks PDF CTM (q/Q/cm) and Text Matrix (BT/ET/Tf/Tm/Td/TD/T*\/TL/Tc/Tw/Tz/Ts).
 * - Computes transformed text-span bounding boxes so strings starting before a redaction
 *   box and extending into it (and selective TJ sub-runs) are purged reliably.
 * - Recurses into intersecting Form XObjects (/Subtype /Form) using isolated cloned
 *   streams so non-redacted reuse sites remain intact.
 * - Strips intersecting contained raster Image XObjects (/Subtype /Image) and inline
 *   images (BI...EI), and burns opaque vector rectangles on top of partial intersections.
 * - Permanently eliminates intersecting annotations from /Annots.
 * - Optionally scrubs /Info and XMP /Metadata packets.
 */

import { pdfLib } from '@/core/pdf/lazyPdfLib';
import { throwIfAborted } from '@/core/cancellation/operationCancellation';
import {
  parsePdfContentStreams,
  serializeOperations,
  type PdfContentOperand,
  type PdfContentOperation,
} from '@/core/pdf-content-stream';
import type {
  PdfRect,
  RedactionAuditRecord,
  RedactionSanitizationResult,
  RedactionTarget,
} from './types';

type PdfLibNs = Awaited<ReturnType<typeof pdfLib>>;
type PDFDocumentT = import('pdf-lib').PDFDocument;
type PDFDictT = import('pdf-lib').PDFDict;
type PDFObjectT = import('pdf-lib').PDFObject;

type AffineMatrix = [number, number, number, number, number, number];

const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 1, 0, 0];
const MAX_XOBJECT_DEPTH = 8;

export interface SanitizePdfDocumentOptions {
  signal?: AbortSignal;
  scrubMetadata?: boolean;
}

/**
 * Checks whether two PDF rectangles intersect in user coordinate space.
 */
export function rectsIntersect(a: PdfRect, b: PdfRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Checks whether `inner` lies completely inside `outer` within an optional tolerance.
 */
export function rectContainedIn(inner: PdfRect, outer: PdfRect, epsilon = 2): boolean {
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon
  );
}

/**
 * Checks whether a 2D point (x, y) with an optional font-height extent falls within a redaction rectangle.
 */
export function textPointIntersectsRect(
  x: number,
  y: number,
  fontSizePt: number,
  rect: PdfRect,
): boolean {
  const descent = Math.abs(fontSizePt) * 0.25;
  const ascent = Math.abs(fontSizePt) * 0.85;
  const textMinY = y - descent;
  const textMaxY = y + ascent;

  const yOverlap = textMinY < rect.y + rect.height && textMaxY > rect.y;
  const xOverlap = x >= rect.x - 1 && x <= rect.x + rect.width + 1;

  return xOverlap && yOverlap;
}

/**
 * Checks whether a horizontal text run starting at `(x, y)` in user coordinates
 * with estimated width `spanWidthPt` intersects `rect`.
 */
export function textSpanIntersectsRect(
  x: number,
  y: number,
  spanWidthPt: number,
  fontSizePt: number,
  rect: PdfRect,
): boolean {
  const absSize = Math.max(1, Math.abs(fontSizePt));
  const box: PdfRect = {
    x: x - 1,
    y: y - absSize * 0.25,
    width: Math.max(spanWidthPt, absSize * 0.4) + 2,
    height: absSize * 1.1,
  };
  return rectsIntersect(box, rect);
}

function multiplyAffine(m1: AffineMatrix, m2: AffineMatrix): AffineMatrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

function transformPoint(m: AffineMatrix, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

function transformRect(m: AffineMatrix, rect: PdfRect): PdfRect {
  const corners = [
    transformPoint(m, rect.x, rect.y),
    transformPoint(m, rect.x + rect.width, rect.y),
    transformPoint(m, rect.x, rect.y + rect.height),
    transformPoint(m, rect.x + rect.width, rect.y + rect.height),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * Executes irreversible document redaction across the target pages.
 */
export async function sanitizePdfDocument(
  sourceBytes: Uint8Array,
  redactions: readonly RedactionTarget[],
  options?: SanitizePdfDocumentOptions,
): Promise<RedactionSanitizationResult> {
  if (redactions.length === 0) {
    throw new Error('Cannot execute redaction with empty redaction list.');
  }

  throwIfAborted(options?.signal, 'sanitize PDF document');

  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(sourceBytes, {
    throwOnInvalidObject: false,
    updateMetadata: false,
  });

  const totalPages = doc.getPageCount();
  const nowIso = new Date().toISOString();

  // Group redactions by page index
  const redactionsByPage = new Map<number, RedactionTarget[]>();
  for (const r of redactions) {
    if (!Number.isInteger(r.pageIndex) || r.pageIndex < 0 || r.pageIndex >= totalPages) {
      throw new Error(
        `Redaction target page index ${r.pageIndex} is out of bounds [0..${totalPages - 1}].`,
      );
    }
    if (r.rect.width <= 0 || r.rect.height <= 0) {
      throw new Error(
        `Invalid redaction dimensions: width=${r.rect.width}, height=${r.rect.height}. Must be positive.`,
      );
    }
    const list = redactionsByPage.get(r.pageIndex) ?? [];
    list.push(r);
    redactionsByPage.set(r.pageIndex, list);
  }

  let totalPurgedChars = 0;
  let totalPurgedAnnotations = 0;
  let totalPurgedImages = 0;
  const auditRecords: RedactionAuditRecord[] = [];
  const formCloneCounter = { count: 0 };

  const modifiedPages = Array.from(redactionsByPage.keys()).sort((a, b) => a - b);

  for (const pageIndex of modifiedPages) {
    throwIfAborted(options?.signal, 'sanitize PDF page');

    const page = doc.getPage(pageIndex);
    const pageRedactions = redactionsByPage.get(pageIndex) ?? [];

    // 1. Purge intersecting annotations from /Annots
    const purgedAnnotsCount = purgePageAnnotations(page, pageRedactions, doc, lib);
    totalPurgedAnnotations += purgedAnnotsCount;

    // 2. Sanitize content streams + intersecting Form/Image XObjects
    const streamMetrics = sanitizePageContentStreams(
      page,
      pageRedactions,
      doc,
      lib,
      formCloneCounter,
    );
    totalPurgedChars += streamMetrics.charsPurged;
    totalPurgedImages += streamMetrics.imagesPurged;

    // 3. Burn in permanent opaque vector fill rectangles
    burnInRedactionBoxes(page, pageRedactions, lib);

    // Record audit records for this page's redactions
    for (let i = 0; i < pageRedactions.length; i++) {
      const r = pageRedactions[i];
      auditRecords.push({
        regionId: r.id ?? `redact-${pageIndex + 1}-${i + 1}`,
        pageIndex,
        pageNumber: pageIndex + 1,
        rect: { ...r.rect },
        reason: r.reason ?? 'Confidential',
        purgedTextCharacters: Math.round(streamMetrics.charsPurged / Math.max(1, pageRedactions.length)),
        purgedAnnotationsCount: Math.round(purgedAnnotsCount / Math.max(1, pageRedactions.length)),
        purgedImagesCount: Math.round(streamMetrics.imagesPurged / Math.max(1, pageRedactions.length)),
        timestamp: nowIso,
      });
    }
  }

  let metadataScrubbed = false;
  if (options?.scrubMetadata) {
    scrubDocumentMetadata(doc, lib);
    metadataScrubbed = true;
  }

  const sanitizedBytes = await doc.save();

  return {
    sanitizedBytes,
    purgedTextCharacterCount: totalPurgedChars,
    purgedAnnotationsCount: totalPurgedAnnotations,
    purgedImagesCount: totalPurgedImages,
    metadataScrubbed,
    appliedRedactionCount: redactions.length,
    redactedPages: modifiedPages,
    records: auditRecords,
  };
}

function scrubDocumentMetadata(doc: PDFDocumentT, lib: PdfLibNs): void {
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  doc.catalog.delete(lib.PDFName.of('Metadata'));
  const infoRef = doc.context.trailerInfo.Info;
  const infoDict = infoRef instanceof lib.PDFRef ? doc.context.lookup(infoRef) : infoRef;
  if (infoDict instanceof lib.PDFDict) {
    for (const key of ['CreationDate', 'ModDate']) {
      infoDict.delete(lib.PDFName.of(key));
    }
  }
}

/**
 * Removes any annotations whose /Rect intersects the redaction bounds.
 */
function purgePageAnnotations(
  page: import('pdf-lib').PDFPage,
  redactions: readonly RedactionTarget[],
  doc: PDFDocumentT,
  lib: PdfLibNs,
): number {
  if (!page.node.has(lib.PDFName.of('Annots'))) {
    return 0;
  }

  const rawAnnots = page.node.get(lib.PDFName.of('Annots'));
  const resolved = rawAnnots instanceof lib.PDFRef ? doc.context.lookup(rawAnnots) : rawAnnots;
  if (!(resolved instanceof lib.PDFArray)) {
    return 0;
  }

  const initialCount = resolved.size();
  const survivingRefs: PDFObjectT[] = [];
  let purged = 0;

  for (let i = 0; i < initialCount; i++) {
    const annotRef = resolved.get(i);
    const annotObj = annotRef instanceof lib.PDFRef ? doc.context.lookup(annotRef) : annotRef;

    if (annotObj instanceof lib.PDFDict) {
      const rectObj = annotObj.get(lib.PDFName.of('Rect'));
      const resolvedRect = rectObj instanceof lib.PDFRef ? doc.context.lookup(rectObj) : rectObj;

      if (resolvedRect instanceof lib.PDFArray && resolvedRect.size() === 4) {
        const x1 = (resolvedRect.get(0) as import('pdf-lib').PDFNumber).asNumber();
        const y1 = (resolvedRect.get(1) as import('pdf-lib').PDFNumber).asNumber();
        const x2 = (resolvedRect.get(2) as import('pdf-lib').PDFNumber).asNumber();
        const y2 = (resolvedRect.get(3) as import('pdf-lib').PDFNumber).asNumber();

        const annotRect: PdfRect = {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        };

        const overlaps = redactions.some((r) => rectsIntersect(r.rect, annotRect));
        if (overlaps) {
          purged++;
          continue; // Strip this annotation
        }
      }
    }

    survivingRefs.push(annotRef);
  }

  if (purged > 0) {
    if (survivingRefs.length === 0) {
      page.node.delete(lib.PDFName.of('Annots'));
    } else {
      const newArray = doc.context.obj(survivingRefs);
      page.node.set(lib.PDFName.of('Annots'), newArray);
    }
  }

  return purged;
}

interface StreamSanitizeMetrics {
  charsPurged: number;
  imagesPurged: number;
}

function resolveDictEntry(
  dict: PDFDictT,
  key: string,
  doc: PDFDocumentT,
  lib: PdfLibNs,
): PDFObjectT | undefined {
  const val = dict.get(lib.PDFName.of(key));
  return val instanceof lib.PDFRef ? doc.context.lookup(val) : val;
}

function getXObjectDict(
  containerDict: PDFDictT,
  doc: PDFDocumentT,
  lib: PdfLibNs,
): PDFDictT | null {
  const res = resolveDictEntry(containerDict, 'Resources', doc, lib);
  if (!(res instanceof lib.PDFDict)) return null;
  const xObjects = resolveDictEntry(res, 'XObject', doc, lib);
  return xObjects instanceof lib.PDFDict ? xObjects : null;
}

function ensureMutableXObjectDict(
  containerDict: PDFDictT,
  doc: PDFDocumentT,
  lib: PdfLibNs,
): PDFDictT {
  const rawRes = containerDict.get(lib.PDFName.of('Resources'));
  const resolvedRes = rawRes instanceof lib.PDFRef ? doc.context.lookup(rawRes) : rawRes;
  const resDict = resolvedRes instanceof lib.PDFDict ? resolvedRes.clone(doc.context) : doc.context.obj({});
  containerDict.set(lib.PDFName.of('Resources'), resDict);

  const rawXObj = resDict.get(lib.PDFName.of('XObject'));
  const resolvedXObj = rawXObj instanceof lib.PDFRef ? doc.context.lookup(rawXObj) : rawXObj;
  const xObjDict = resolvedXObj instanceof lib.PDFDict ? resolvedXObj.clone(doc.context) : doc.context.obj({});
  resDict.set(lib.PDFName.of('XObject'), xObjDict);
  return xObjDict;
}

function readPdfMatrix(dict: PDFDictT, doc: PDFDocumentT, lib: PdfLibNs): AffineMatrix {
  const raw = resolveDictEntry(dict, 'Matrix', doc, lib);
  if (!(raw instanceof lib.PDFArray) || raw.size() !== 6) {
    return [...IDENTITY_MATRIX];
  }
  const nums: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const val = raw.get(i);
    if (val instanceof lib.PDFNumber && Number.isFinite(val.asNumber())) {
      nums.push(val.asNumber());
    } else {
      return [...IDENTITY_MATRIX];
    }
  }
  return nums as AffineMatrix;
}

function readFormBBox(dict: PDFDictT, doc: PDFDocumentT, lib: PdfLibNs): PdfRect | null {
  const raw = resolveDictEntry(dict, 'BBox', doc, lib);
  if (!(raw instanceof lib.PDFArray) || raw.size() !== 4) {
    return null;
  }
  const vals: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const val = raw.get(i);
    if (val instanceof lib.PDFNumber && Number.isFinite(val.asNumber())) {
      vals.push(val.asNumber());
    } else {
      return null;
    }
  }
  const minX = Math.min(vals[0], vals[2]);
  const maxX = Math.max(vals[0], vals[2]);
  const minY = Math.min(vals[1], vals[3]);
  const maxY = Math.max(vals[1], vals[3]);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Scans content stream AST operations + Form/Image XObjects and strips intersecting content.
 */
function sanitizePageContentStreams(
  page: import('pdf-lib').PDFPage,
  redactions: readonly RedactionTarget[],
  doc: PDFDocumentT,
  lib: PdfLibNs,
  formCloneCounter: { count: number },
): StreamSanitizeMetrics {
  if (!page.node.has(lib.PDFName.of('Contents'))) {
    return { charsPurged: 0, imagesPurged: 0 };
  }

  const rawContents = page.node.get(lib.PDFName.of('Contents'));
  if (!rawContents) return { charsPurged: 0, imagesPurged: 0 };

  const resolved = rawContents instanceof lib.PDFRef ? doc.context.lookup(rawContents) : rawContents;
  const streamEntries = resolved instanceof lib.PDFArray ? resolved.asArray() : [rawContents];

  let totalCharsPurged = 0;
  let totalImagesPurged = 0;

  for (let idx = 0; idx < streamEntries.length; idx++) {
    const entry = streamEntries[idx];
    const streamObj = entry instanceof lib.PDFRef ? doc.context.lookup(entry) : entry;

    if (!(streamObj instanceof lib.PDFRawStream)) {
      continue;
    }

    let decodedBytes: Uint8Array;
    try {
      const decoded = lib.decodePDFRawStream(streamObj).decode();
      decodedBytes = Uint8Array.from(decoded);
    } catch {
      continue;
    }

    const ast = parsePdfContentStreams([{ streamIndex: idx, decodedBytes }]);
    const sanitized = sanitizeOperationsList({
      operations: ast.operations,
      redactions,
      containerDict: page.node,
      initialCtm: [...IDENTITY_MATRIX],
      doc,
      lib,
      formCloneCounter,
      depth: 0,
      ancestorRefs: new Set(),
    });

    totalCharsPurged += sanitized.charsPurged;
    totalImagesPurged += sanitized.imagesPurged;

    if (sanitized.modified) {
      const sanitizedBytes = serializeOperations(sanitized.operations, { normalize: true });
      const newStream = doc.context.flateStream(sanitizedBytes);

      if (entry instanceof lib.PDFRef) {
        doc.context.assign(entry, newStream);
      } else if (resolved instanceof lib.PDFArray) {
        resolved.set(idx, newStream);
      } else {
        page.node.set(lib.PDFName.of('Contents'), newStream);
      }
    }
  }

  return { charsPurged: totalCharsPurged, imagesPurged: totalImagesPurged };
}

function estimateStringGlyphCount(operand: PdfContentOperand): number {
  if (operand.kind !== 'literal-string' && operand.kind !== 'hex-string') {
    return 0;
  }
  const bytes = operand.bytes;
  if (!bytes || bytes.length === 0) {
    const rawLen = 'raw' in operand && typeof operand.raw === 'string' ? operand.raw.length : 0;
    return Math.max(0, rawLen - 2);
  }
  if (bytes.length >= 2 && bytes.length % 2 === 0) {
    let zeroHighBytes = 0;
    for (let i = 0; i < bytes.length; i += 2) {
      if (bytes[i] === 0) zeroHighBytes += 1;
    }
    if (zeroHighBytes >= bytes.length / 4) {
      return bytes.length / 2;
    }
  }
  return bytes.length;
}

function estimateTextAdvanceInTextSpace(
  glyphCount: number,
  fontSizePt: number,
  charSpacePt: number,
  horizontalScalePct: number,
): number {
  if (glyphCount <= 0) return 0;
  const absSize = Math.abs(fontSizePt);
  const scaleFactor = horizontalScalePct / 100;
  return glyphCount * absSize * 0.56 * scaleFactor + Math.max(0, glyphCount - 1) * charSpacePt * scaleFactor;
}

function numberOperand(op: PdfContentOperand | undefined, fallback = 0): number {
  return op && op.kind === 'number' && Number.isFinite(op.value) ? op.value : fallback;
}

function blankStringOperand(): PdfContentOperand {
  return {
    kind: 'literal-string',
    bytes: new Uint8Array(),
    raw: '()',
  };
}

interface SanitizeOperationsInput {
  operations: readonly PdfContentOperation[];
  redactions: readonly RedactionTarget[];
  containerDict: PDFDictT;
  initialCtm: AffineMatrix;
  doc: PDFDocumentT;
  lib: PdfLibNs;
  formCloneCounter: { count: number };
  depth: number;
  ancestorRefs: Set<string>;
}

interface SanitizeOperationsOutput {
  operations: PdfContentOperation[];
  charsPurged: number;
  imagesPurged: number;
  modified: boolean;
}

interface TextStateSnapshot {
  textMatrix: AffineMatrix;
  textLineMatrix: AffineMatrix;
  curFontSize: number;
  textLeading: number;
  charSpace: number;
  wordSpace: number;
  horizontalScale: number;
  textRise: number;
}

function createInitialTextSnapshot(): TextStateSnapshot {
  return {
    textMatrix: [...IDENTITY_MATRIX],
    textLineMatrix: [...IDENTITY_MATRIX],
    curFontSize: 12,
    textLeading: 0,
    charSpace: 0,
    wordSpace: 0,
    horizontalScale: 100,
    textRise: 0,
  };
}

interface GraphicsSnapshot {
  ctm: AffineMatrix;
  curFontSize: number;
  textLeading: number;
  charSpace: number;
  wordSpace: number;
  horizontalScale: number;
  textRise: number;
}

function sanitizeOperationsList(input: SanitizeOperationsInput): SanitizeOperationsOutput {
  const {
    operations,
    redactions,
    containerDict,
    initialCtm,
    doc,
    lib,
    formCloneCounter,
    depth,
    ancestorRefs,
  } = input;

  let charsPurged = 0;
  let imagesPurged = 0;
  let modified = false;

  const graphicsStack: GraphicsSnapshot[] = [];
  let ctm: AffineMatrix = [...initialCtm];
  const text = createInitialTextSnapshot();

  const outOps: PdfContentOperation[] = [];
  let pendingInlineBiStart: number | null = null;

  for (let opIdx = 0; opIdx < operations.length; opIdx += 1) {
    const op = operations[opIdx];

    if (op.operator === 'BI') {
      pendingInlineBiStart = outOps.length;
      outOps.push(op);
      continue;
    }

    if (op.operator === 'EI' && pendingInlineBiStart !== null) {
      const imgRect = transformRect(ctm, { x: 0, y: 0, width: 1, height: 1 });
      const stripInline = redactions.some((r) => rectContainedIn(imgRect, r.rect));
      if (stripInline) {
        outOps.length = pendingInlineBiStart;
        pendingInlineBiStart = null;
        imagesPurged += 1;
        modified = true;
        continue;
      }
      pendingInlineBiStart = null;
      outOps.push(op);
      continue;
    }

    if (op.operator === 'q') {
      graphicsStack.push({
        ctm: [...ctm],
        curFontSize: text.curFontSize,
        textLeading: text.textLeading,
        charSpace: text.charSpace,
        wordSpace: text.wordSpace,
        horizontalScale: text.horizontalScale,
        textRise: text.textRise,
      });
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Q') {
      const prev = graphicsStack.pop();
      if (prev) {
        ctm = prev.ctm;
        text.curFontSize = prev.curFontSize;
        text.textLeading = prev.textLeading;
        text.charSpace = prev.charSpace;
        text.wordSpace = prev.wordSpace;
        text.horizontalScale = prev.horizontalScale;
        text.textRise = prev.textRise;
      }
      outOps.push(op);
      continue;
    }

    if (op.operator === 'cm' && op.operands.length >= 6) {
      const m: AffineMatrix = [
        numberOperand(op.operands[0], 1),
        numberOperand(op.operands[1], 0),
        numberOperand(op.operands[2], 0),
        numberOperand(op.operands[3], 1),
        numberOperand(op.operands[4], 0),
        numberOperand(op.operands[5], 0),
      ];
      ctm = multiplyAffine(m, ctm);
      outOps.push(op);
      continue;
    }

    if (op.operator === 'BT') {
      text.textMatrix = [...IDENTITY_MATRIX];
      text.textLineMatrix = [...IDENTITY_MATRIX];
      outOps.push(op);
      continue;
    }

    if (op.operator === 'ET') {
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Tf' && op.operands.length >= 2) {
      text.curFontSize = numberOperand(op.operands[1], text.curFontSize);
      outOps.push(op);
      continue;
    }

    if (op.operator === 'TL' && op.operands.length >= 1) {
      text.textLeading = numberOperand(op.operands[0], 0);
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Tc' && op.operands.length >= 1) {
      text.charSpace = numberOperand(op.operands[0], 0);
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Tw' && op.operands.length >= 1) {
      text.wordSpace = numberOperand(op.operands[0], 0);
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Tz' && op.operands.length >= 1) {
      text.horizontalScale = numberOperand(op.operands[0], 100) || 100;
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Ts' && op.operands.length >= 1) {
      text.textRise = numberOperand(op.operands[0], 0);
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Tm' && op.operands.length >= 6) {
      const tm: AffineMatrix = [
        numberOperand(op.operands[0], 1),
        numberOperand(op.operands[1], 0),
        numberOperand(op.operands[2], 0),
        numberOperand(op.operands[3], 1),
        numberOperand(op.operands[4], 0),
        numberOperand(op.operands[5], 0),
      ];
      text.textMatrix = tm;
      text.textLineMatrix = [...tm];
      outOps.push(op);
      continue;
    }

    if ((op.operator === 'Td' || op.operator === 'TD') && op.operands.length >= 2) {
      const tx = numberOperand(op.operands[0], 0);
      const ty = numberOperand(op.operands[1], 0);
      if (op.operator === 'TD') {
        text.textLeading = -ty;
      }
      const nextLine = multiplyAffine([1, 0, 0, 1, tx, ty], text.textLineMatrix);
      text.textLineMatrix = nextLine;
      text.textMatrix = [...nextLine];
      outOps.push(op);
      continue;
    }

    if (op.operator === 'T*') {
      const ty = -(text.textLeading || Math.abs(text.curFontSize) * 1.2);
      const nextLine = multiplyAffine([1, 0, 0, 1, 0, ty], text.textLineMatrix);
      text.textLineMatrix = nextLine;
      text.textMatrix = [...nextLine];
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Tj' || op.operator === "'" || op.operator === '"') {
      if (op.operator === '"' && op.operands.length >= 3) {
        text.wordSpace = numberOperand(op.operands[0], text.wordSpace);
        text.charSpace = numberOperand(op.operands[1], text.charSpace);
      }
      if (op.operator === "'" || op.operator === '"') {
        const ty = -(text.textLeading || Math.abs(text.curFontSize) * 1.2);
        const nextLine = multiplyAffine([1, 0, 0, 1, 0, ty], text.textLineMatrix);
        text.textLineMatrix = nextLine;
        text.textMatrix = [...nextLine];
      }

      if (op.operands.length > 0) {
        const textOperand = op.operands[op.operands.length - 1];
        const glyphCount = estimateStringGlyphCount(textOperand);
        const widthPt = estimateTextAdvanceInTextSpace(
          glyphCount,
          text.curFontSize,
          text.charSpace,
          text.horizontalScale,
        );
        const trm = multiplyAffine(text.textMatrix, ctm);
        const absSize = Math.max(1, Math.abs(text.curFontSize));
        const runBox = transformRect(trm, {
          x: 0,
          y: text.textRise - absSize * 0.25,
          width: Math.max(widthPt, absSize * 0.4),
          height: absSize * 1.1,
        });

        const intersects = redactions.some((r) => rectsIntersect(runBox, r.rect));
        if (intersects && glyphCount > 0) {
          charsPurged += glyphCount;
          op.operands[op.operands.length - 1] = blankStringOperand();
          modified = true;
        }
        if (widthPt > 0) {
          text.textMatrix = multiplyAffine([1, 0, 0, 1, widthPt, 0], text.textMatrix);
        }
      }
      outOps.push(op);
      continue;
    }

    if (op.operator === 'TJ' && op.operands.length > 0 && op.operands[0].kind === 'array') {
      const arr = op.operands[0];
      const trm = multiplyAffine(text.textMatrix, ctm);
      const absSize = Math.max(1, Math.abs(text.curFontSize));
      const scaleFactor = text.horizontalScale / 100;
      let cursorX = 0;

      for (let i = 0; i < arr.items.length; i++) {
        const item = arr.items[i];
        if (item.kind === 'number') {
          cursorX -= (item.value / 1000) * absSize * scaleFactor;
          continue;
        }
        if (item.kind === 'literal-string' || item.kind === 'hex-string') {
          const glyphCount = estimateStringGlyphCount(item);
          const itemWidth = estimateTextAdvanceInTextSpace(
            glyphCount,
            text.curFontSize,
            text.charSpace,
            text.horizontalScale,
          );
          const itemBox = transformRect(trm, {
            x: cursorX,
            y: text.textRise - absSize * 0.25,
            width: Math.max(itemWidth, absSize * 0.4),
            height: absSize * 1.1,
          });
          const intersects = redactions.some((r) => rectsIntersect(itemBox, r.rect));
          if (intersects && glyphCount > 0) {
            charsPurged += glyphCount;
            arr.items[i] = blankStringOperand();
            modified = true;
          }
          cursorX += itemWidth;
        }
      }

      if (cursorX !== 0) {
        text.textMatrix = multiplyAffine([1, 0, 0, 1, cursorX, 0], text.textMatrix);
      }
      outOps.push(op);
      continue;
    }

    if (op.operator === 'Do' && op.operands.length >= 1 && op.operands[0].kind === 'name') {
      const xObjectName = op.operands[0].name;
      const xObjects = getXObjectDict(containerDict, doc, lib);
      if (xObjects) {
        const rawRef = xObjects.get(lib.PDFName.of(xObjectName));
        const xObj = rawRef instanceof lib.PDFRef ? doc.context.lookup(rawRef) : rawRef;
        if (xObj instanceof lib.PDFRawStream) {
          const subtype = xObj.dict.get(lib.PDFName.of('Subtype'));
          const subtypeText = subtype instanceof lib.PDFName ? subtype.decodeText() : '';

          if (subtypeText === 'Image') {
            const imgRect = transformRect(ctm, { x: 0, y: 0, width: 1, height: 1 });
            if (redactions.some((r) => rectContainedIn(imgRect, r.rect))) {
              imagesPurged += 1;
              modified = true;
              continue; // Strip fully contained image XObject Do operator
            }
          } else if (subtypeText === 'Form' && depth < MAX_XOBJECT_DEPTH) {
            const refKey = rawRef instanceof lib.PDFRef ? rawRef.toString() : `inline:${depth}:${xObjectName}`;
            if (!ancestorRefs.has(refKey)) {
              const formMatrix = readPdfMatrix(xObj.dict, doc, lib);
              const formCtm = multiplyAffine(formMatrix, ctm);
              const formBBox = readFormBBox(xObj.dict, doc, lib);
              const formPageBox = formBBox ? transformRect(ctm, formBBox) : null;
              const intersectsForm =
                !formPageBox || redactions.some((r) => rectsIntersect(formPageBox, r.rect));

              if (intersectsForm) {
                let formBytes: Uint8Array | null = null;
                try {
                  formBytes = Uint8Array.from(lib.decodePDFRawStream(xObj).decode());
                } catch {
                  formBytes = null;
                }

                if (formBytes) {
                  const formAst = parsePdfContentStreams([{ streamIndex: 0, decodedBytes: formBytes }]);
                  const clonedFormDict = xObj.dict.clone(doc.context);
                  const nextAncestors = new Set(ancestorRefs);
                  nextAncestors.add(refKey);

                  const nestedResult = sanitizeOperationsList({
                    operations: formAst.operations,
                    redactions,
                    containerDict: clonedFormDict,
                    initialCtm: formCtm,
                    doc,
                    lib,
                    formCloneCounter,
                    depth: depth + 1,
                    ancestorRefs: nextAncestors,
                  });

                  if (nestedResult.modified) {
                    const updatedFormBytes = serializeOperations(nestedResult.operations, {
                      normalize: true,
                    });
                    const compressedFormBytes = doc.context.flateStream(updatedFormBytes);
                    // Preserve Form attributes (/Type, /Subtype, /BBox, /Matrix, /Resources, /Group)
                    for (const [k, v] of clonedFormDict.entries()) {
                      const keyName = k.decodeText();
                      if (keyName === 'Length' || keyName === 'Filter' || keyName === 'DecodeParms') {
                        continue;
                      }
                      compressedFormBytes.dict.set(k, v);
                    }
                    const clonedRef = doc.context.register(compressedFormBytes);
                    const mutableXObjects = ensureMutableXObjectDict(containerDict, doc, lib);
                    formCloneCounter.count += 1;
                    const clonedName = `${xObjectName}_red${formCloneCounter.count}`;
                    mutableXObjects.set(lib.PDFName.of(clonedName), clonedRef);

                    charsPurged += nestedResult.charsPurged;
                    imagesPurged += nestedResult.imagesPurged;
                    modified = true;

                    outOps.push({
                      ...op,
                      operands: [
                        {
                          kind: 'name',
                          name: clonedName,
                          raw: `/${clonedName}`,
                        },
                      ],
                    });
                    continue;
                  }
                }
              }
            }
          }
        }
      }
      outOps.push(op);
      continue;
    }

    outOps.push(op);
  }

  return {
    operations: outOps,
    charsPurged,
    imagesPurged,
    modified,
  };
}

/**
 * Draws unremovable opaque vector fill rectangles onto the page content stream.
 */
function burnInRedactionBoxes(
  page: import('pdf-lib').PDFPage,
  redactions: readonly RedactionTarget[],
  lib: PdfLibNs,
): void {
  for (const r of redactions) {
    const isWhite = r.fillColor === 'white';
    const color = isWhite ? lib.rgb(1, 1, 1) : lib.rgb(0, 0, 0);

    page.drawRectangle({
      x: r.rect.x,
      y: r.rect.y,
      width: r.rect.width,
      height: r.rect.height,
      color,
      borderColor: color,
      borderWidth: 0,
    });
  }
}
