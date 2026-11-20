import type {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFObject,
  PDFPage,
  PDFRef,
} from 'pdf-lib';

import type { PdfAnnotation, Point2D } from '@/core/annotations/types';
import type { ReviewMetadata, ReviewReply } from '@/core/review/types';
import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  attachNativeMarkupAppearance,
  attachNativeStampAppearance,
} from './nativeMarkupAppearance';
import { editNativeRichText } from './nativeRichTextEdit';
import { attachNativeFreeTextAppearance } from './nativeFreeTextAppearance';
import { calloutBodyRect, enclosingCalloutRect, type PdfRect } from './freeTextGeometry';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { orderNativeReviewStates } from './nativeReviewStateOrder';
import { applyNativeStampRotation } from './nativeStampRotation';
import {
  fingerprintStampAppearance, sealStampAppearanceFingerprint, sealStampRotationFingerprint, STAMP_AP_FINGERPRINT_KEY,
  STAMP_ROTATION_FINGERPRINT_KEY, verifyStampAppearanceFingerprint, verifyStampRotationFingerprint,
} from './nativeStampProvenance';
import { BOX_GENERATED_AP_FINGERPRINT_KEY, BOX_GENERATED_AP_ORIENTATION_KEY,
  sealGeneratedBoxAppearanceFingerprint, verifyGeneratedBoxAppearanceFingerprint } from './nativeBoxShapeProvenance';
import { fingerprintNativeCloudRotation, rotateCloudInsets, supportsNativeCloudRotation } from './nativeCloudRotation';
import {
  createMarkupSpace, markupOrMask, pdfPointToView, viewPointToPdf,
  viewRectToPdfRect, type MarkupSpace,
} from './markupGeometry';

type PdfLibModule = typeof import('pdf-lib');

// Mirrors the recursive input accepted by PDFContext.obj; native PDF objects
// are retained as objects rather than converted or discarded.
type PdfLiteral = PDFObject | string | number | boolean | null | undefined | PdfLiteral[] | PdfLiteralDict;
interface PdfLiteralDict { [key: string]: PdfLiteral }

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
  space?: MarkupSpace;
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

interface NativeCopyOrigin {
  dict: PDFDict;
  replies: ExistingReplyGraph;
  states: ReviewStateGraph;
  model: PdfAnnotation;
}

const DEFAULT_STROKE: PdfColor = { r: 0.25, g: 0.35, b: 0.5 };
const DEFAULT_FILL: PdfColor = { r: 1, g: 0.95, b: 0.3 };
const MARKUP_GENERATED_AP_KEY = 'PDFHubGeneratedMarkupAPFingerprint';
const MARKUP_GENERATED_AP_VERSION = 'pdfhub-generated-markup-ap-v1:';

const ROOT_OWNED_KEYS = new Set([
  'Type', 'Subtype', 'Rect', 'P', 'NM', 'M', 'CreationDate', 'T', 'F',
  'Contents', 'PDFHubVersion', 'PDFHubType', 'PDFHubData', 'PDFHubReviewStatus',
  'PDFHubBaseAP', 'PDFHubBaseRect', 'PDFHubBaseRD', 'PDFHubBaseCL', 'PDFHubRotation',
  'State', 'StateModel', 'IRT', 'RT',
  'Name', 'Open', 'C', 'CA', 'IC', 'Border', 'BS', 'DA', 'Q', 'IT', 'CL', 'RD', 'BE',
  'Vertices', 'L', 'LE', 'InkList', 'QuadPoints', MARKUP_GENERATED_AP_KEY,
]);
const STAMP_ROOT_OWNED_KEYS = new Set([...ROOT_OWNED_KEYS, STAMP_AP_FINGERPRINT_KEY, STAMP_ROTATION_FINGERPRINT_KEY]);
const BOX_ROOT_OWNED_KEYS = new Set([...ROOT_OWNED_KEYS, BOX_GENERATED_AP_FINGERPRINT_KEY, BOX_GENERATED_AP_ORIENTATION_KEY]);

const ROOT_APPEARANCE_KEYS = [
  'Subtype', 'Rect', 'Contents', 'F', 'Name', 'Open', 'C', 'CA', 'IC',
  'Border', 'BS', 'DA', 'Q', 'IT', 'CL', 'RD', 'BE', 'Vertices', 'L', 'LE',
  'InkList', 'QuadPoints',
] as const;

const REPLY_OWNED_KEYS = new Set([
  'Type', 'Subtype', 'P', 'Rect', 'Contents', 'T', 'NM', 'PDFHubReplyId',
  'M', 'CreationDate', 'IRT', 'RT',
]);

const REPLY_APPEARANCE_KEYS = ['Subtype', 'Contents'] as const;

/** Bind application-generated artwork to the actual PDF geometry, not sidecar flags. */
async function fingerprintGeneratedMarkupAppearance(doc: PDFDocument, source: PDFDict, lib: PdfLibModule): Promise<string | null> {
  try {
    const name = source.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText();
    if (!name || !['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Square'].includes(name)) return null;
    if (name === 'Square' && readTextObject(source, 'PDFHubType', lib) !== 'redaction') return null;
    if (name === 'Square' && source.get(lib.PDFName.of('QuadPoints'))) return null;
    if (['IT', 'Measure', 'Vertices', 'L', 'CL', 'InkList', 'RD', 'BE', 'Rotate', 'PDFHubBaseAP', 'MK', 'AS', 'OC']
      .some((key) => source.get(lib.PDFName.of(key)))) return null;
    const rect = readPdfNumberArray(source, 'Rect', lib);
    if (!rect || rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] <= rect[0] || rect[3] <= rect[1]) return null;
    const quads = name === 'Square' ? [] : readPdfNumberArray(source, 'QuadPoints', lib);
    if (!quads || (name !== 'Square' && (quads.length < 8 || quads.length % 8 || !quads.every(Number.isFinite)))) return null;
    const ap = source.get(lib.PDFName.of('AP'));
    if (!ap) return null;
    const root = doc.context.obj({}) as PDFDict;
    root.set(lib.PDFName.of('Subtype'), lib.PDFName.of(name));
    root.set(lib.PDFName.of('Rect'), doc.context.obj(rect));
    root.set(lib.PDFName.of('AP'), ap);
    root.set(lib.PDFName.of('PDFHubData'), lib.PDFString.of(JSON.stringify(quads)));
    for (const key of ['F', 'C', 'CA', 'IC', 'Border', 'BS']) {
      const value = source.get(lib.PDFName.of(key));
      if (value) root.set(lib.PDFName.of(key), value);
    }
    const fingerprint = await fingerprintStampAppearance(doc, root, lib);
    return fingerprint?.startsWith('pdfhub-stamp-ap-v1:')
      ? MARKUP_GENERATED_AP_VERSION + fingerprint.slice('pdfhub-stamp-ap-v1:'.length) : null;
  } catch { return null; }
}

async function verifyGeneratedMarkupAppearance(doc: PDFDocument, source: PDFDict, lib: PdfLibModule): Promise<boolean> {
  try {
    const stored = source.lookupMaybe(lib.PDFName.of(MARKUP_GENERATED_AP_KEY), lib.PDFString, lib.PDFHexString)?.decodeText();
    return Boolean(stored && /^pdfhub-generated-markup-ap-v1:[0-9a-f]{64}$/.test(stored)
      && stored === await fingerprintGeneratedMarkupAppearance(doc, source, lib));
  } catch { return false; }
}

async function sealGeneratedMarkupAppearance(doc: PDFDocument, target: PDFDict, lib: PdfLibModule): Promise<boolean> {
  const digest = await fingerprintGeneratedMarkupAppearance(doc, target, lib);
  if (!digest) { target.delete(lib.PDFName.of(MARKUP_GENERATED_AP_KEY)); return false; }
  target.set(lib.PDFName.of(MARKUP_GENERATED_AP_KEY), lib.PDFString.of(digest));
  return true;
}

/** The appearance builder consumes paired top/bottom edges, not perimeter order. */
function supportsMarkupAppearanceQuads(values: number[]): boolean {
  if (values.length < 8 || values.length % 8 || !values.every(Number.isFinite)) return false;
  for (let i = 0; i < values.length; i += 8) {
    const p = [0, 1, 3, 2].map((index) => ({ x: values[i + index * 2], y: values[i + index * 2 + 1] }));
    const turns = p.map((point, index) => {
      const next = p[(index + 1) % 4]; const after = p[(index + 2) % 4];
      return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
    });
    if (!turns.every((turn) => turn > 1e-9) && !turns.every((turn) => turn < -1e-9)) return false;
  }
  return true;
}

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
  options: { replaceManagedAnnotations?: boolean } = {},
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

  // Freeze source dictionaries before any root or popup is rewritten. The
  // source name is page-scoped; identical names on other pages are unrelated.
  const copies = annotations.filter((annotation) => annotation.data.nativeCopySource);
  const sourceModels = options.replaceManagedAnnotations || copies.length
    || annotations.some((item) => item.id.startsWith('native:p') || item.type === 'stamp'
      || item.type === 'comment' || item.type === 'sticky-note' || markupOrMask(item.type) || item.data.review)
    ? (await readNativePdfAnnotations(baseBytes)).annotations : [];
  const copyOrigins = new Map<PdfAnnotation, NativeCopyOrigin>();
  for (const annotation of copies) {
    const source = annotation.data.nativeCopySource!;
    if (source.ambiguous) throw new Error('Cannot safely copy an annotation with an ambiguous native identity.');
    if (source.pageNumber < 1 || source.pageNumber > doc.getPageCount()) {
      if (source.requiresSource) throw new Error('Cannot safely copy this annotation: its source page is unavailable.');
      continue;
    }
    const sourcePage = doc.getPage(source.pageNumber - 1);
    const sourceAnnots = sourcePage.node.lookupMaybe(lib.PDFName.of('Annots'), lib.PDFArray);
    if (!sourceAnnots) {
      if (source.requiresSource) throw new Error('Cannot safely copy this annotation: its source page has no native annotations.');
      continue;
    }
    const model = sourceModels.find((candidate) => candidate.pageNumber === source.pageNumber
      && (candidate.data.nativeOriginalName ?? candidate.id) === source.nativeName);
    const sourceDict = findManagedRootDict(sourceAnnots, source.nativeName, lib, model?.data.nativeSourceRef);
    if (sourceDict && model) {
      copyOrigins.set(annotation, {
        dict: sourceDict,
        replies: collectExistingReplyGraph(sourceAnnots, source.nativeName, lib, model.data.nativeSourceRef),
        states: collectReviewStateGraph(sourceAnnots, source.nativeName, lib, model.data.nativeSourceRef),
        model,
      });
    } else if (source.requiresSource) {
      throw new Error('Cannot safely copy this annotation: its native source could not be located.');
    }
  }

  if (options.replaceManagedAnnotations) {
    for (const source of sourceModels) {
      const sourceName = source.data.nativeOriginalName ?? source.id;
      const retained = annotations.some((item) => item.pageNumber === source.pageNumber
        && (item.data.nativeOriginalName ?? item.id) === sourceName);
      if (retained) continue;
      if (source.data.nativeIdentityAmbiguous || !source.data.nativeSourceRef) {
        throw new Error('Cannot safely delete a native annotation with an ambiguous identity.');
      }
      const page = doc.getPage(source.pageNumber - 1);
      const annots = page.node.lookupMaybe(lib.PDFName.of('Annots'), lib.PDFArray);
      if (annots) removeDeletedNativeFamily(annots, sourceName, source.data.nativeSourceRef, lib);
    }
  }

  for (const [pageNumber, pageAnnotations] of byPage) {
    const page = doc.getPage(pageNumber - 1);
    const annots = getOrCreateAnnotsArray(doc, page, lib);

    for (const candidate of pageAnnotations) {
      let annotation = candidate;
      if (annotation.data.nativeIdentityAmbiguous) {
        throw new Error('Cannot safely save annotations with a duplicate native name on the same page.');
      }
      const nativeName = annotation.data.nativeOriginalName ?? annotation.id;
      const sourceModel = sourceModels.find((item) => item.pageNumber === pageNumber
        && (item.data.nativeOriginalName ?? item.id) === nativeName);
      const sourceRef = sourceModel?.data.nativeSourceRef;
      const existingRoot = findManagedRootDict(annots, nativeName, lib, sourceRef);
      const copyOrigin = existingRoot ? undefined : copyOrigins.get(candidate);
      const isBox = annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse';
      const boxSource = isBox ? existingRoot ?? copyOrigin?.dict : undefined;
      const trustedBox = isBox && (boxSource ? await verifyGeneratedBoxAppearanceFingerprint(doc, boxSource, lib) : !annotation.data.nativeBoxShapeImported);
      const sourceBoxOrientation = boxSource && trustedBox
        ? boxSource.lookup(lib.PDFName.of(BOX_GENERATED_AP_ORIENTATION_KEY), lib.PDFNumber).asNumber() : 0;
      if (isBox) annotation = { ...annotation, data: { ...annotation.data,
        nativeBoxShapeGenerated: trustedBox,
        ...(trustedBox ? { nativeBoxShapeGeneratedOrientation: sourceBoxOrientation } : {}),
      } };
      if ((annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse' || annotation.type === 'shape-cloud') && annotation.data.nativeBoxShapeTurn) {
        const source = existingRoot ?? copyOrigin?.dict;
        const expected = annotation.data.nativeBoxShapeTurn.sourceHash;
        const actual = source ? (annotation.type === 'shape-cloud' ? await fingerprintNativeCloudRotation(doc, source, lib)
          : await fingerprintStampAppearance(doc, source, lib)) : null;
        if (source ? (!expected || expected !== actual)
          : Boolean(expected || annotation.data.nativeBoxShapeImported)) {
          throw new Error('Cannot safely rotate this shape: its source appearance or identity changed.');
        }
        if (annotation.type === 'shape-cloud' && (!source || !supportsNativeCloudRotation(source, lib))) {
          throw new Error('Cannot safely rotate this cloud without a supported source appearance.');
        }
      }
      const nativeSubtype = existingRoot ? doc.context.lookup(existingRoot.get(lib.PDFName.of('Subtype'))) : undefined;
      if (existingRoot && sourceModel && markupOrMask(sourceModel.type)
        && annotation.type !== sourceModel.type && existingRoot.get(lib.PDFName.of('AP'))) {
        throw new Error('Cannot safely convert this markup while preserving its native appearance.');
      }
      if (existingRoot && sourceModel && ['shape-rect', 'shape-ellipse', 'shape-cloud'].includes(sourceModel.type)
        && annotation.type !== sourceModel.type && existingRoot.get(lib.PDFName.of('AP'))
        && !await verifyGeneratedBoxAppearanceFingerprint(doc, existingRoot, lib)) {
        throw new Error('Cannot safely convert this imported shape while preserving its original artwork.');
      }
      if (nativeSubtype instanceof lib.PDFName && nativeSubtype.decodeText() === 'Stamp'
        && annotation.type !== 'stamp' && !await verifyStampAppearanceFingerprint(doc, existingRoot!, lib)) {
        throw new Error('Cannot safely convert this imported stamp while preserving its original artwork.');
      }
      const stampSource = annotation.type === 'stamp' ? existingRoot ?? copyOrigin?.dict : null;
      // Never trust a sidecar/model classification when an actual source PDF
      // is present: the source artwork may have changed outside this app.
      const trustedStamp = annotation.type === 'stamp' && (stampSource
        ? await verifyStampAppearanceFingerprint(doc, stampSource, lib)
        : annotation.data.nativeStampAppearanceKind !== 'imported');
      const sourceHasStampBase = Boolean(stampSource?.get(lib.PDFName.of('PDFHubBaseAP')));
      const trustedStampRotation = Boolean(annotation.type === 'stamp' && !trustedStamp && stampSource && sourceHasStampBase
        && await verifyStampRotationFingerprint(doc, stampSource, lib));
      if (annotation.type === 'stamp' && stampSource) {
        if (!trustedStamp && sourceHasStampBase && !trustedStampRotation) {
          const originalValue = doc.context.lookup(stampSource.get(lib.PDFName.of('PDFHubRotation')));
          const originalAngle = originalValue instanceof lib.PDFNumber ? originalValue.asNumber() : undefined;
          const requestedAngle = annotation.data.rotation ?? 0;
          if (copyOrigin || originalAngle === undefined || !Number.isFinite(originalAngle) || !Number.isFinite(requestedAngle)
            || Math.abs((((requestedAngle - originalAngle) % 360) + 360) % 360) > 1e-7) {
            throw new Error('Cannot safely copy or change the rotation of this stamp: its saved base appearance is not verified.');
          }
        }
        annotation = { ...annotation, data: { ...annotation.data,
          nativeStampAppearanceKind: trustedStamp ? 'generated' : 'imported',
          hasCustomAppearance: Boolean(stampSource.get(lib.PDFName.of('AP'))),
          // This is part of the fingerprint-bound source metadata. Never use
          // a stale recovery-sidecar basis to regenerate trusted artwork.
          ...(trustedStamp ? { nativeStampBasisRotation: (copyOrigin?.model ?? sourceModel)?.data.nativeStampBasisRotation ?? 0 } : {}),
        } };
      } else if (annotation.type === 'stamp' && trustedStamp) {
        let basis = annotation.data.nativeStampBasisRotation;
        const originPage = annotation.data.nativeCopySource?.pageNumber;
        if (originPage && originPage >= 1 && originPage <= doc.getPageCount()) {
          const sourceBasis = annotation.data.nativeStampCopySourceBasisRotation ?? basis;
          if (sourceBasis !== undefined) {
            basis = ((sourceBasis + page.getRotation().angle - doc.getPage(originPage - 1).getRotation().angle) % 360 + 360) % 360;
          }
        }
        annotation = { ...annotation, data: { ...annotation.data, nativeStampBasisRotation: basis ?? page.getRotation().angle } };
      }
      const replyGraph = collectExistingReplyGraph(annots, nativeName, lib, sourceRef);
      const stateGraph = collectReviewStateGraph(annots, nativeName, lib, sourceRef);
      const replies = annotation.data.review?.replies ?? [];
      const deletedReplyIds = new Set(annotation.data.nativeDeletedReplyIds ?? []);
      assertNativeRichTextRootMutationSupported(
        existingRoot,
        annotation,
        lib,
      );
      assertNativeRichTextReplyMutationsSupported(
        replyGraph,
        replies,
        lib,
        deletedReplyIds,
      );
      const representedReplyIds = new Set(replies.map((reply) => reply.id));
      removeManagedAnnotationFamily(
        annots,
        nativeName,
        replyGraph,
        representedReplyIds,
        lib,
        sourceRef,
        deletedReplyIds,
      );

      let rootRef: PDFRef;
      if (copyOrigin) {
        const adjustedCopy = copyWithNativeOrientation(doc, page, annotation, copyOrigin);
        const textChanged = annotation.data.text !== copyOrigin.model.data.text
          || annotation.data.content !== copyOrigin.model.data.content;
        const freeText = annotation.type === 'textbox' || annotation.type === 'callout';
        const boxStyleKeys = ['backgroundColor', 'borderColor', 'borderWidth', 'borderStyle', 'opacity'] as const;
        const generatedBoxCopy = isBox && trustedBox;
        const boxStyleChanged = generatedBoxCopy && boxStyleKeys.some((key) =>
          JSON.stringify(adjustedCopy.data[key]) !== JSON.stringify(copyOrigin.model.data[key]));
        const rewriteGeneratedBox = generatedBoxCopy && (textChanged || boxStyleChanged);
        let copyForClone = adjustedCopy;
        if (rewriteGeneratedBox) {
          const unsupported = COPY_APPEARANCE_FIELDS.filter((key) => !boxStyleKeys.includes(key as typeof boxStyleKeys[number]));
          if (unsupported.some((key) => JSON.stringify(adjustedCopy.data[key]) !== JSON.stringify(copyOrigin.model.data[key]))) {
            throw new Error('Cannot safely edit this copied shape: unsupported appearance changes.');
          }
          // First clone the verified native graph in its original style, then
          // apply this explicit edit to that independent copy. This preserves
          // popup/reply ownership and prevents styling the source artwork.
          const data = { ...adjustedCopy.data };
          for (const key of COPY_APPEARANCE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(copyOrigin.model.data, key)) Object.assign(data, { [key]: copyOrigin.model.data[key] });
            else delete data[key];
          }
          copyForClone = { ...adjustedCopy, data };
        }
        rootRef = registerCopiedNativeAnnotation(doc, page, annots, copyForClone, copyOrigin, lib);
        if (rewriteGeneratedBox) {
          const copiedDict = doc.context.lookup(rootRef, lib.PDFDict);
          const sourceRotation = doc.getPage(copyOrigin.model.pageNumber - 1).getRotation().angle;
          const copyQuarterTurns = (page.getRotation().angle - sourceRotation) / 90;
          const turns = boxShapePendingTurns(annotation);
          const orientation = ((sourceBoxOrientation + turns - copyQuarterTurns) % 4 + 4) % 4;
          const data = { ...adjustedCopy.data, nativeBoxShapeGenerated: true, nativeBoxShapeGeneratedOrientation: orientation };
          // The cloned source form already contains this individual rotation.
          delete data.nativeBoxShapeTurn;
          rootRef = await registerNativeAnnotation(doc, page, { ...adjustedCopy, data }, copiedDict, lib, copyOrigin.model);
        } else if (textChanged && (annotation.type === 'comment' || annotation.type === 'sticky-note')
          && !copyOrigin.dict.get(lib.PDFName.of('AP')) && !hasNativeRichText(copyOrigin.dict, lib)) {
          // A viewer-provided note icon has no artwork to regenerate. Update
          // only the new native copy; the source and its thread stay intact.
          const copiedDict = doc.context.lookup(rootRef, lib.PDFDict);
          copiedDict.set(lib.PDFName.of('Contents'), pdfText(lib, annotationText(adjustedCopy)));
        } else if (textChanged && markupOrMask(annotation.type) && !hasNativeRichText(copyOrigin.dict, lib)) {
          // For text markup and visual masks Contents is comment metadata;
          // keep the cloned appearance and change only the new copy's text.
          const copiedDict = doc.context.lookup(rootRef, lib.PDFDict);
          copiedDict.set(lib.PDFName.of('Contents'), pdfText(lib, annotationText(adjustedCopy)));
        } else if (textChanged || (freeText && annotation.data.rotation)) {
          if (annotation.type !== 'textbox' && annotation.type !== 'callout') {
            throw new Error('Cannot safely edit the appearance of this copied native annotation.');
          }
          const copiedDict = doc.context.lookup(rootRef, lib.PDFDict);
          const copyForWrite = textChanged ? {
            ...adjustedCopy,
            data: { ...adjustedCopy.data, nativeInterop: { fidelityClass: 'MUTATED_USER_EDIT' as const, reason: 'USER_EDITED' as const, richText: hasNativeRichText(copiedDict, lib) } },
          } : adjustedCopy;
          rootRef = await registerNativeAnnotation(doc, page, copyForWrite, copiedDict, lib, copyOrigin.model);
        }
      } else {
        rootRef = await registerNativeAnnotation(doc, page, annotation, existingRoot, lib, sourceModel);
      }
      // A reader-created default status is not a native review transition.
      // Keep original root state entries when its review status is unchanged;
      // stale root state must not contradict an explicit status change.
      const reviewSource = copyOrigin?.dict ?? existingRoot;
      const sourceReview = (copyOrigin?.model ?? sourceModel)?.data.review;
      if (reviewSource && annotation.data.review) {
        const outputRoot = doc.context.lookup(rootRef, lib.PDFDict);
        const unchanged = sourceReview?.status === annotation.data.review.status;
        for (const key of ['State', 'StateModel']) {
          const name = lib.PDFName.of(key);
          const original = reviewSource.get(name);
          if (unchanged && original) outputRoot.set(name, original);
          else outputRoot.delete(name);
        }
        if (unchanged && !reviewSource.get(lib.PDFName.of('PDFHubReviewStatus'))) {
          outputRoot.delete(lib.PDFName.of('PDFHubReviewStatus'));
        }
      }
      if (annotation.type === 'stamp' && trustedStamp) {
        const outputStamp = doc.context.lookup(rootRef, lib.PDFDict);
        if (!await sealStampAppearanceFingerprint(doc, outputStamp, lib)) {
          throw new Error('Cannot safely preserve editable stamp provenance for this appearance.');
        }
      } else if (annotation.type === 'stamp' && stampSource) {
        const outputStamp = doc.context.lookup(rootRef, lib.PDFDict);
        // Only sign a newly constructed wrapper from the current AP, or a
        // wrapper whose previous full current/base graph already verified.
        // This marker never grants generated-artwork editability.
        const hasOutputBase = Boolean(outputStamp.get(lib.PDFName.of('PDFHubBaseAP')));
        if (hasOutputBase && (trustedStampRotation || !sourceHasStampBase)) {
          // An unsupported graph can still be preserved, but without a valid
          // marker it remains read-only for later base-dependent operations.
          await sealStampRotationFingerprint(doc, outputStamp, lib);
        }
      }
      if (isBox && trustedBox) {
        const turns = boxShapePendingTurns(annotation);
        const sourcePageRotation = copyOrigin ? doc.getPage(copyOrigin.model.pageNumber - 1).getRotation().angle : page.getRotation().angle;
        const copyQuarterTurns = copyOrigin ? (page.getRotation().angle - sourcePageRotation) / 90 : 0;
        const orientation = ((sourceBoxOrientation + turns - copyQuarterTurns) % 4 + 4) % 4;
        const outputShape = doc.context.lookup(rootRef, lib.PDFDict);
        if (!await sealGeneratedBoxAppearanceFingerprint(doc, outputShape, orientation, lib)) {
          throw new Error('Cannot safely preserve editable shape provenance for this appearance.');
        }
      }
      if (copyOrigin && markupOrMask(annotation.type)
        && await verifyGeneratedMarkupAppearance(doc, copyOrigin.dict, lib)) {
        const outputMarkup = doc.context.lookup(rootRef, lib.PDFDict);
        if (outputMarkup.get(lib.PDFName.of('AP')) && !await sealGeneratedMarkupAppearance(doc, outputMarkup, lib)) {
          throw new Error('Cannot safely preserve editable markup appearance provenance.');
        }
      }
      annots.push(rootRef);
      annotationCount += 1;

      const replySource = copyOrigin ? remapCopiedReplyGraph(copyOrigin.replies, replies, lib) : replyGraph;
      const replyRefById = writeNativeReplies(
        doc,
        page,
        annots,
        annotation,
        rootRef,
        replies,
        replySource,
        lib,
        copyOrigin,
        existingRoot,
      );
      replyCount += replies.length;

      relinkPreservedReplyParents(
        replyGraph,
        representedReplyIds,
        rootRef,
        replyRefById,
        lib,
        deletedReplyIds,
      );

      relinkReviewStateParents(
        stateGraph,
        replyGraph,
        rootRef,
        replyRefById,
        lib,
        deletedReplyIds,
      );

      const outputStates = copyOrigin
        ? cloneCopiedReviewStates(doc, page, annots, annotation, rootRef, copyOrigin, replySource, replyRefById, lib)
        : stateGraph;
      if (annotation.data.review) {
        appendReviewStateTransitionIfNeeded(
          doc,
          page,
          annots,
          annotation,
          rootRef,
          outputStates,
          lib,
          (copyOrigin?.model ?? sourceModel)?.data.review?.status,
          Boolean(reviewSource),
          false,
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
  const annotationHasRichText =
    annotation.data.nativeInterop?.fidelityClass === 'NATIVE_PRESERVED_READ_ONLY'
    && annotation.data.nativeInterop.reason === 'RICH_TEXT'
    && annotation.data.nativeInterop.richText === true;
  const sourceHasRichText = hasNativeRichText(source, lib);

  if (annotationHasRichText && !sourceHasRichText) {
    throw nativeRichTextMutationError(
      annotation.id,
      'source /RC unavailable for preservation',
    );
  }
  if (!sourceHasRichText) return;

  if (annotation.data.nativeInterop?.fidelityClass === 'MUTATED_USER_EDIT') {
    return;
  }

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
  if (!optionalStringEqual(annotation.data.content, snapshot.content)) {
    throw nativeRichTextMutationError(annotation.id, 'content');
  }
  if (!optionalNumberEqual(annotation.data.fontSize, snapshot.fontSize)) {
    throw nativeRichTextMutationError(annotation.id, 'font size');
  }
  if (!optionalStringEqual(annotation.data.fontWeight, snapshot.fontWeight)) {
    throw nativeRichTextMutationError(annotation.id, 'font weight');
  }
  if (!optionalStringEqual(annotation.data.fontStyle, snapshot.fontStyle)) {
    throw nativeRichTextMutationError(annotation.id, 'font style');
  }
  if (!optionalStringEqual(annotation.data.fontFamily, snapshot.fontFamily)) {
    throw nativeRichTextMutationError(annotation.id, 'font family');
  }
  if (!optionalStringEqual(annotation.data.textColor, snapshot.textColor)) {
    throw nativeRichTextMutationError(annotation.id, 'text color');
  }
  if (!optionalStringEqual(annotation.data.textAlign, snapshot.textAlign)) {
    throw nativeRichTextMutationError(annotation.id, 'text alignment');
  }
  if (!optionalNumberEqual(annotation.data.lineHeight, snapshot.lineHeight)) {
    throw nativeRichTextMutationError(annotation.id, 'line height');
  }
  if (!optionalBooleanEqual(annotation.data.autoSize, snapshot.autoSize)) {
    throw nativeRichTextMutationError(annotation.id, 'auto size');
  }
}

function assertNativeRichTextReplyMutationsSupported(
  graph: ExistingReplyGraph,
  replies: ReviewReply[],
  lib: PdfLibModule,
  deletedReplyIds: Set<string>,
): void {
  const sourceById = new Map(
    graph.records.map((record) => [record.logicalId, record.dict]),
  );
  const replyById = new Map(replies.map((reply) => [reply.id, reply]));

  for (const [replyId, source] of sourceById) {
    if (hasNativeRichText(source, lib) && !replyById.has(replyId) && !deletedReplyIds.has(replyId)) {
      throw nativeRichTextMutationError(
        replyId,
        'rich-text reply removal',
      );
    }
  }

  for (const reply of replies) {
    const source = sourceById.get(reply.id);
    const sourceHasRichText = hasNativeRichText(source ?? null, lib);
    const replyHasRichText =
      reply.nativeInterop?.fidelityClass === 'NATIVE_PRESERVED_READ_ONLY'
      && reply.nativeInterop.reason === 'RICH_TEXT'
      && reply.nativeInterop.richText === true;

    if (replyHasRichText && !sourceHasRichText) {
      throw nativeRichTextMutationError(
        `${reply.id}`,
        'source /RC unavailable for reply preservation',
      );
    }
    if (!sourceHasRichText) continue;

    if (!replyHasRichText || !reply.nativeInterop) {
      throw nativeRichTextMutationError(
        `${reply.id}`,
        'missing reply protected import snapshot',
      );
    }
    const original = readTextObject(source!, 'Contents', lib);
    if (original === null || original.trim() !== reply.nativeInterop.protectedContent) {
      throw nativeRichTextMutationError(
        `${reply.id}`,
        'reply source changed',
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

function optionalBooleanEqual(
  left: unknown,
  right: boolean | undefined,
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
  sourceRef?: string,
): PDFDict | null {
  for (let index = 0; index < annots.size(); index += 1) {
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (dict && (readAnnotationName(dict, lib) === annotationId
      || Boolean(sourceRef && pdfObjectKey(annots.get(index), lib) === sourceRef))) {
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
  sourceRef?: string,
  deletedReplyIds: Set<string> = new Set(),
): void {
  const replyRefKeys = new Set(
    replyGraph.records
      .filter((record) => representedReplyIds.has(record.logicalId) || deletedReplyIds.has(record.logicalId))
      .map((record) => record.refKey),
  );
  const deletedRefs = new Set(replyGraph.records.filter((record) => deletedReplyIds.has(record.logicalId)).map((record) => record.refKey));
  const deletedPopups = new Set(replyGraph.records.filter((record) => deletedReplyIds.has(record.logicalId))
    .map((record) => record.dict.lookupMaybe(lib.PDFName.of('Popup'), lib.PDFDict)).filter((popup): popup is PDFDict => Boolean(popup)));

  for (let index = annots.size() - 1; index >= 0; index -= 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const name = readAnnotationName(dict, lib);
    const refKey = pdfObjectKey(raw, lib);

    if (
      name === annotationId
      || Boolean(sourceRef && refKey === sourceRef)
      || Boolean(refKey && replyRefKeys.has(refKey))
      || deletedPopups.has(dict)
      || (dict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() === 'Popup'
        && deletedRefs.has(pdfObjectKey(dict.get(lib.PDFName.of('Parent')), lib) ?? ''))
    ) {
      annots.remove(index);
    }
  }
}

/** Remove only the imported root and its native reply/state/popup family. */
function removeDeletedNativeFamily(
  annots: PDFArray,
  annotationId: string,
  rootRef: string,
  lib: PdfLibModule,
): void {
  const root = findManagedRootDict(annots, annotationId, lib, rootRef);
  if (!root) throw new Error('Cannot safely delete a native annotation: its source is unavailable.');
  const replies = collectExistingReplyGraph(annots, annotationId, lib, rootRef);
  const states = collectReviewStateGraph(annots, annotationId, lib, rootRef);
  const refs = new Set([rootRef, ...replies.records.map((item) => item.refKey), ...states.records.map((item) => item.refKey)]);
  const popups = new Set<PDFDict>();
  for (const item of [root, ...replies.records.map((record) => record.dict), ...states.records.map((record) => record.dict)]) {
    const popup = item.lookupMaybe(lib.PDFName.of('Popup'), lib.PDFDict);
    if (popup) popups.add(popup);
  }
  for (let index = annots.size() - 1; index >= 0; index -= 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;
    const key = pdfObjectKey(raw, lib);
    const parent = pdfObjectKey(dict.get(lib.PDFName.of('Parent')), lib);
    const subtype = dict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText();
    if ((key && refs.has(key)) || popups.has(dict) || (subtype === 'Popup' && parent && refs.has(parent))) {
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
  expectedRootRef?: string,
): ExistingReplyGraph {
  let rootRefKey: string | null = null;
  const candidates: ExistingReplyRecord[] = [];

  for (let index = 0; index < annots.size(); index += 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const refKey = pdfObjectKey(raw, lib);
    if (readAnnotationName(dict, lib) === annotationId || Boolean(expectedRootRef && refKey === expectedRootRef)) {
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
  expectedRootRef?: string,
): ReviewStateGraph {
  let rootRefKey: string | null = null;
  const candidates: ReviewStateRecord[] = [];
  const parentByRef = new Map<string, string | null>();

  for (let index = 0; index < annots.size(); index += 1) {
    const raw = annots.get(index);
    const dict = annots.lookupMaybe(index, lib.PDFDict);
    if (!dict) continue;

    const refKey = pdfObjectKey(raw, lib);
    if (readAnnotationName(dict, lib) === annotationId || Boolean(expectedRootRef && refKey === expectedRootRef)) {
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
  copyOrigin?: NativeCopyOrigin,
  existingRoot?: PDFDict | null,
): Map<string, PDFRef> {
  const replyRefById = new Map<string, PDFRef>();
  const replyDictById = new Map<string, PDFDict>();
  const sourceById = new Map(
    sourceGraph.records.map((record) => [record.logicalId, record]),
  );
  const copyTransform = copyOrigin ? nativeCopyTransform(doc, page, annotation, copyOrigin) : null;

  for (const reply of replies) {
    const sourceReply = sourceById.get(reply.id)?.dict ?? null;
    const sourceRoot = copyOrigin?.dict ?? existingRoot;
    const sourceRootRect = sourceRoot ? readPdfNumberArray(sourceRoot, 'Rect', lib) : null;
    const targetRoot = sourceRoot ? doc.context.lookup(rootRef, lib.PDFDict) : null;
    const targetRootRect = targetRoot ? readPdfNumberArray(targetRoot, 'Rect', lib) : null;
    const dx = sourceRootRect && targetRootRect ? targetRootRect[0] - sourceRootRect[0] : 0;
    const dy = sourceRootRect && targetRootRect ? targetRootRect[1] - sourceRootRect[1] : 0;
    const sourceReplyRect = sourceReply ? readPdfNumberArray(sourceReply, 'Rect', lib) : null;
    const replyDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: sourceReplyRect?.length === 4
        ? (copyTransform ? copyTransform.rect(sourceReplyRect) : translatePairs(sourceReplyRect, dx, dy)) : replyRect(annotation, page),
      P: page.ref,
      Contents: replyContentsValue(
        reply,
        sourceReply,
        lib,
      ),
      T: pdfText(lib, reply.author || 'Unknown'),
      NM: !copyOrigin && sourceReply?.get(lib.PDFName.of('NM'))
        ? sourceReply.get(lib.PDFName.of('NM'))! : lib.PDFString.of(replyAnnotationName(annotation.id, reply.id)),
      PDFHubReplyId: lib.PDFString.of(reply.id),
      M: lib.PDFString.of(pdfDate(reply.updatedAt ?? reply.createdAt)),
      CreationDate: lib.PDFString.of(pdfDate(reply.createdAt)),
      F: 4,
      Name: 'Comment',
      Open: false,
      IRT: rootRef,
      RT: 'R',
    }) as PDFDict;

    preservePassiveAnnotationEntries(
      sourceReply,
      replyDict,
      REPLY_OWNED_KEYS,
      REPLY_APPEARANCE_KEYS,
      lib,
    );

    if (sourceReply && hasNativeRichText(sourceReply, lib)
      && reply.content !== reply.nativeInterop?.protectedContent) {
      const rich = readTextObject(sourceReply, 'RC', lib);
      const original = readTextObject(sourceReply, 'Contents', lib);
      if (rich === null || original === null) throw new Error('Cannot safely edit native comment rich text: the original text is unavailable.');
      replyDict.set(lib.PDFName.of('RC'), pdfText(lib, editNativeRichText(rich, original, reply.content)));
    }
    if (sourceReply && sourceReply.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() === 'Text') {
      const iconAppearance = sourceReply.get(lib.PDFName.of('AP'));
      if (iconAppearance) {
        if ((readTextObject(sourceReply, 'Contents', lib) ?? '').trim() !== reply.content) {
          // Text can be drawn as vector outlines or image-like shapes even
          // without text operators; an opaque AP has no trusted provenance.
          throw new Error('Cannot safely edit native comment appearance: imported artwork may depict the original comment.');
        }
        const flags = sourceReply.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
        if (copyTransform?.rotation && (Math.trunc(flags) & 16)) {
          throw new Error('Cannot safely copy a NoRotate comment between differently rotated pages.');
        }
        const mappedAppearance = copyTransform && sourceReplyRect
          ? rotatedCopyAppearance(doc, iconAppearance, sourceReplyRect, copyTransform.rotation, lib) : iconAppearance;
        if (mappedAppearance) replyDict.set(lib.PDFName.of('AP'), mappedAppearance);
      }
    }

    if (copyOrigin) replyDict.delete(lib.PDFName.of('Popup'));
    const replyRef = doc.context.register(replyDict);
    if (copyOrigin && sourceReply) {
      clonePopup(doc, page, annots, sourceReply, replyDict, replyRef, copyTransform!.rect, `${annotation.id}:reply:${reply.id}:popup`, lib, copyTransform!.rotation);
    } else {
      relinkPopupParent(sourceReply, replyRef, lib);
    }
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

function replyContentsValue(
  reply: ReviewReply,
  source: PDFDict | null,
  lib: PdfLibModule,
): PdfLiteral {
  if (hasNativeRichText(source, lib) && reply.content === reply.nativeInterop?.protectedContent) {
    const sourceContents = source?.get(lib.PDFName.of('Contents'));
    if (sourceContents) return sourceContents;
  }
  return pdfText(lib, reply.content);
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
  deletedReplyIds: Set<string>,
): void {
  if (!graph.rootRefKey) return;

  const recordsByRef = new Map(graph.records.map((record) => [record.refKey, record]));

  for (const record of graph.records) {
    if (representedReplyIds.has(record.logicalId) || deletedReplyIds.has(record.logicalId)) continue;
    const newParentRef = survivingReplyParent(record.parentKey, graph.rootRefKey, recordsByRef, replyRefById, deletedReplyIds, newRootRef);
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
  deletedReplyIds: Set<string>,
): void {
  if (!graph.rootRefKey) return;

  const recordsByRef = new Map(replyGraph.records.map((record) => [record.refKey, record]));

  for (const record of graph.records) {
    const newParentReplyRef = survivingReplyParent(record.parentKey, graph.rootRefKey, recordsByRef, replyRefById, deletedReplyIds, newRootRef);

    if (newParentReplyRef) {
      record.dict.set(lib.PDFName.of('IRT'), newParentReplyRef);
    }
  }
}

function survivingReplyParent(
  parentKey: string | null,
  rootKey: string,
  records: Map<string, ExistingReplyRecord>,
  rewritten: Map<string, PDFRef>,
  deleted: Set<string>,
  newRoot: PDFRef,
): PDFRef | undefined {
  const visited = new Set<string>();
  while (parentKey && !visited.has(parentKey)) {
    if (parentKey === rootKey) return newRoot;
    visited.add(parentKey);
    const parent = records.get(parentKey);
    if (!parent) return undefined;
    if (!deleted.has(parent.logicalId)) return rewritten.get(parent.logicalId) ?? parent.ref;
    parentKey = parent.parentKey;
  }
  return undefined;
}

/** Clone the complete native state graph, including states attached to replies.
 * Allocate references first so state-to-state parent links remain intact. */
function cloneCopiedReviewStates(
  doc: PDFDocument,
  page: PDFPage,
  annots: PDFArray,
  annotation: PdfAnnotation,
  rootRef: PDFRef,
  origin: NativeCopyOrigin,
  remappedReplies: ExistingReplyGraph,
  replyRefById: Map<string, PDFRef>,
  lib: PdfLibModule,
): ReviewStateGraph {
  const graph = origin.states;
  if (!graph.rootRefKey) return { rootRefKey: rootRef.toString(), records: [], rootStateRecords: [] };
  const transform = nativeCopyTransform(doc, page, annotation, origin);
  const mapped = new Map<string, PDFRef>([[graph.rootRefKey, rootRef]]);
  for (const reply of remappedReplies.records) {
    const ref = replyRefById.get(reply.logicalId);
    if (ref) mapped.set(reply.refKey, ref);
  }
  const sourceNames = new Set<string>();
  for (let i = 0; i < annots.size(); i += 1) {
    const dict = annots.lookupMaybe(i, lib.PDFDict);
    const name = dict ? readAnnotationName(dict, lib) : null;
    if (name) sourceNames.add(name);
  }
  const copies: ReviewStateRecord[] = [];
  for (const record of graph.records) {
    const source = record.dict;
    const rect = readPdfNumberArray(source, 'Rect', lib);
    if (!rect || rect.length !== 4 || !rect.every(Number.isFinite)) {
      throw new Error('Cannot safely copy a review state with invalid geometry.');
    }
    const flags = source.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
    if (transform.rotation && (Math.trunc(flags) & 16)) {
      throw new Error('Cannot safely copy a NoRotate review state between differently rotated pages.');
    }
    if (transform.rotation && ['RD', 'CL', 'L', 'Vertices', 'InkList', 'QuadPoints', 'Measure', 'BE', 'Parent']
      .some((key) => source.get(lib.PDFName.of(key)))) {
      throw new Error('Cannot safely copy a review state with unsupported native geometry.');
    }
    const dict = doc.context.obj({}) as PDFDict;
    for (const key of source.keys()) {
      if (['P', 'NM', 'Rect', 'IRT', 'Popup', 'AP'].includes(key.decodeText())) continue;
      const value = source.get(key);
      if (value) dict.set(key, value);
    }
    dict.set(lib.PDFName.of('P'), page.ref);
    dict.set(lib.PDFName.of('Rect'), doc.context.obj(transform.rect(rect)));
    let suffix = copies.length + 1;
    let name = `${annotation.id}:state-copy:${suffix}`;
    while (sourceNames.has(name)) name = `${annotation.id}:state-copy:${++suffix}`;
    sourceNames.add(name);
    dict.set(lib.PDFName.of('NM'), lib.PDFString.of(name));
    const appearance = rotatedCopyAppearance(doc, source.get(lib.PDFName.of('AP')), rect, transform.rotation, lib);
    if (appearance) dict.set(lib.PDFName.of('AP'), appearance);
    const ref = doc.context.register(dict);
    mapped.set(record.refKey, ref);
    copies.push({ ...record, ref, refKey: ref.toString(), dict });
  }
  for (let i = 0; i < graph.records.length; i += 1) {
    const source = graph.records[i];
    const copy = copies[i];
    const parent = source.parentKey ? mapped.get(source.parentKey) : undefined;
    if (!parent) throw new Error('Cannot safely copy a review state with an unrepresented or cyclic parent.');
    copy.dict.set(lib.PDFName.of('IRT'), parent);
    copy.parentKey = parent.toString();
    clonePopup(doc, page, annots, source.dict, copy.dict, copy.ref, transform.rect,
      `${annotation.id}:state-copy:${i + 1}:popup`, lib, transform.rotation);
    annots.push(copy.ref);
  }
  const roots = new Set(graph.rootStateRecords.map((record) => record.refKey));
  return {
    rootRefKey: rootRef.toString(),
    records: copies,
    rootStateRecords: copies.filter((_, index) => roots.has(graph.records[index].refKey)),
  };
}

function appendReviewStateTransitionIfNeeded(
  doc: PDFDocument,
  page: PDFPage,
  annots: PDFArray,
  annotation: PdfAnnotation,
  rootRef: PDFRef,
  graph: ReviewStateGraph,
  lib: PdfLibModule,
  sourceStatus?: ReviewMetadata['status'],
  hasSource = false,
  copiedRootState = false,
): void {
  const review = annotation.data.review;
  if (!review) return;

  const desiredStatus = review.status;
  const latest = latestReviewStateRecord(graph.rootStateRecords);
  if (latest && reviewStatusFromState(latest.state) === desiredStatus) {
    return;
  }
  if (!latest && hasSource && !copiedRootState && sourceStatus === desiredStatus) {
    return;
  }

  const author = review.statusAuthor ?? review.author ?? 'Unknown';
  const transitionTime = hasSource || graph.records.length > 0
    ? review.updatedAt
    : review.createdAt;
  let parentRef = rootRef;
  // Check the actual complete state ordering, rather than comparing only the
  // latest record's timestamp: an old-clock child can be delayed by its
  // future-dated ancestor and otherwise silently supersede this new state.
  // Do not fabricate timestamps or chain changes across different authors.
  if (latest) {
    const virtual = { ...latest, refKey: '__pending_review_state__', parentKey: graph.rootRefKey,
      author, timestamp: Math.floor(transitionTime / 1000) * 1000, index: Number.MAX_SAFE_INTEGER };
    const comesLast = () => {
      const ordered = orderNativeReviewStates([...graph.rootStateRecords, virtual], (record) => ({
        key: record.refKey, parent: record.parentKey, author: record.author,
        time: record.timestamp, index: record.index,
      }));
      return ordered[ordered.length - 1] === virtual;
    };
    if (!comesLast()) {
      const priorAuthor = readTextOrName(latest.dict, 'T', lib)?.trim();
      const actualAuthor = author.trim();
      if (!priorAuthor || priorAuthor === 'Unknown' || !actualAuthor || actualAuthor === 'Unknown' || priorAuthor !== actualAuthor) {
        throw new Error('Cannot safely change review state: review history has a clock conflict with a different or unknown author.');
      }
      parentRef = latest.ref;
      virtual.parentKey = latest.refKey;
      if (!comesLast()) {
        throw new Error('Cannot safely change review state: another review branch remains later.');
      }
    }
  }

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
  const ordered = orderNativeReviewStates(records, (record) => ({
    key: record.refKey, parent: record.parentKey, author: record.author,
    time: record.timestamp, index: record.index,
  }));
  return ordered[ordered.length - 1];
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

function translatePairs(values: readonly number[], dx: number, dy: number): number[] {
  if (values.length % 2 !== 0 || !values.every(Number.isFinite)) {
    throw new Error('Cannot safely copy an annotation with invalid native coordinates.');
  }
  return values.map((value, index) => value + (index % 2 === 0 ? dx : dy));
}

interface NativeCopyTransform {
  pairs(values: readonly number[]): number[];
  rect(values: readonly number[]): PdfRect;
  rotation: number;
}

function copyWithNativeOrientation(doc: PDFDocument, target: PDFPage, annotation: PdfAnnotation, origin: NativeCopyOrigin): PdfAnnotation {
  if (annotation.type === 'stamp' && annotation.data.nativeStampAppearanceKind === 'generated') {
    const sourcePage = doc.getPage(origin.model.pageNumber - 1);
    const sourceBasis = origin.model.data.nativeStampBasisRotation ?? 0;
    const basis = ((sourceBasis + target.getRotation().angle - sourcePage.getRotation().angle) % 360 + 360) % 360;
    return { ...annotation, data: { ...annotation.data, nativeStampBasisRotation: basis } };
  }
  if (annotation.type !== 'textbox' && annotation.type !== 'callout') return annotation;
  const sourcePage = doc.getPage(origin.model.pageNumber - 1);
  const adjustment = ((origin.model.data.nativeOrientationAdjustment ?? 0)
    + sourcePage.getRotation().angle - target.getRotation().angle + 360) % 360;
  return { ...annotation, data: { ...annotation.data, nativeOrientationAdjustment: adjustment } };
}

function nativeCopyTransform(doc: PDFDocument, target: PDFPage, annotation: PdfAnnotation, origin: NativeCopyOrigin): NativeCopyTransform {
  const source = doc.getPage(origin.model.pageNumber - 1);
  const from = createMarkupSpace(source.getCropBox(), source.getRotation().angle);
  const to = createMarkupSpace(target.getCropBox(), target.getRotation().angle);
  const dx = annotation.rect.x - origin.model.rect.x;
  const dy = annotation.rect.y - origin.model.rect.y;
  const pairs = (values: readonly number[]): number[] => {
    if (values.length % 2 || !values.every(Number.isFinite)) throw new Error('Cannot safely copy invalid native coordinates.');
    const result: number[] = [];
    for (let i = 0; i < values.length; i += 2) {
      const view = pdfPointToView(values[i], values[i + 1], from);
      const point = viewPointToPdf(view.x + dx, view.y + dy, to);
      result.push(point.x, point.y);
    }
    return result;
  };
  const rect = (values: readonly number[]): PdfRect => {
    if (values.length !== 4) throw new Error('Cannot safely copy an invalid native rectangle.');
    const p = pairs([values[0], values[1], values[0], values[3], values[2], values[1], values[2], values[3]]);
    return [Math.min(p[0], p[2], p[4], p[6]), Math.min(p[1], p[3], p[5], p[7]), Math.max(p[0], p[2], p[4], p[6]), Math.max(p[1], p[3], p[5], p[7])];
  };
  return { pairs, rect, rotation: ((to.rotation - from.rotation) + 360) % 360 };
}

function rotatedCopyAppearance(doc: PDFDocument, appearance: PDFObject | undefined, sourceRect: readonly number[], angle: number, lib: PdfLibModule): PDFObject | undefined {
  if (!appearance) return undefined;
  if (angle === 0) return appearance;
  const ap = doc.context.lookup(appearance);
  if (!(ap instanceof lib.PDFDict)) throw new Error('Cannot safely copy unsupported native appearance states.');
  if (ap.keys().some((key) => key.decodeText() !== 'N')) throw new Error('Cannot safely copy native appearance states between differently rotated pages.');
  const normalRef = ap.get(lib.PDFName.of('N'));
  const normal = doc.context.lookup(normalRef);
  if (!(normal instanceof lib.PDFStream) || !normalRef) throw new Error('Cannot safely copy unsupported native appearance states between differently rotated pages.');
  const bbox = readPdfNumberArray(normal.dict, 'BBox', lib);
  const matrix = readPdfNumberArray(normal.dict, 'Matrix', lib) ?? [1, 0, 0, 1, 0, 0];
  if (!bbox || bbox.length !== 4 || matrix.length !== 6) throw new Error('Cannot safely copy native appearance with invalid geometry.');
  const [a, b, c, d, e, f] = matrix;
  const corners = [[bbox[0], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[1]], [bbox[2], bbox[3]]]
    .map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const minX = Math.min(...corners.map((point) => point[0])); const maxX = Math.max(...corners.map((point) => point[0]));
  const minY = Math.min(...corners.map((point) => point[1])); const maxY = Math.max(...corners.map((point) => point[1]));
  const width = sourceRect[2] - sourceRect[0]; const height = sourceRect[3] - sourceRect[1];
  if (!(width > 0 && height > 0 && maxX > minX && maxY > minY)) throw new Error('Cannot safely copy a degenerate native appearance.');
  const sx = width / (maxX - minX); const sy = height / (maxY - minY);
  const round = (n: number) => Math.abs(n) < 1e-9 ? 0 : Number(n.toFixed(8));
  const radians = angle * Math.PI / 180; const cosine = round(Math.cos(radians)); const sine = round(Math.sin(radians));
  const ref = normalRef instanceof lib.PDFRef ? normalRef : doc.context.register(normal);
  const content = `q ${round(sx)} 0 0 ${round(sy)} ${round(-minX * sx)} ${round(-minY * sy)} cm /OriginalAppearance Do Q\n`;
  const wrapper = doc.context.flateStream(content, { Type: 'XObject', Subtype: 'Form', FormType: 1,
    BBox: [0, 0, width, height], Matrix: [cosine, sine, -sine, cosine, 0, 0],
    PDFHubWrappedOriginal: ref, Resources: { XObject: { OriginalAppearance: ref } } });
  return doc.context.obj({ N: doc.context.register(wrapper) });
}

/** Returns the rigid quarter-turn taking one rectangle and its ordered vertices to the other. */
function polygonQuarterTurn(beforeRect: readonly number[], before: readonly number[], afterRect: readonly number[], after: readonly number[], angle: number, minimumCoordinates = 6): boolean {
  if (beforeRect.length !== 4 || afterRect.length !== 4 || before.length < minimumCoordinates || before.length % 2
    || before.length !== after.length || ![...beforeRect, ...afterRect, ...before, ...after].every(Number.isFinite)
    || ![90, 180, 270].includes(angle)) return false;
  const width = beforeRect[2] - beforeRect[0]; const height = beforeRect[3] - beforeRect[1];
  const targetWidth = afterRect[2] - afterRect[0]; const targetHeight = afterRect[3] - afterRect[1];
  if (!(width > 0 && height > 0 && targetWidth > 0 && targetHeight > 0)) return false;
    if (!nearlyEqual(targetWidth, angle === 180 ? width : height, 1e-4)
      || !nearlyEqual(targetHeight, angle === 180 ? height : width, 1e-4)) return false;
    const mapped: number[] = [];
    for (let i = 0; i < before.length; i += 2) {
      const u = (before[i] - beforeRect[0]) / width; const v = (before[i + 1] - beforeRect[1]) / height;
      const [x, y] = angle === 90 ? [1 - v, u] : angle === 180 ? [1 - u, 1 - v] : [v, 1 - u];
      mapped.push(afterRect[0] + x * targetWidth, afterRect[1] + y * targetHeight);
    }
    return numberArraysEquivalent(mapped, [...after], 1e-4);
}

function boxShapePendingTurns(annotation: PdfAnnotation): number {
  const turns = annotation.data.nativeBoxShapeTurn?.turns ?? 0;
  if (!Number.isInteger(turns) || turns < 0 || turns > 3) throw new Error('Cannot safely rotate this shape: invalid rotation state.');
  return turns;
}

function boxShapeDimensionsMatch(before: readonly number[], after: readonly number[], turns: number): boolean {
  if (before.length !== 4 || after.length !== 4 || ![...before, ...after].every(Number.isFinite)) return false;
  const width = before[2] - before[0]; const height = before[3] - before[1];
  const targetWidth = after[2] - after[0]; const targetHeight = after[3] - after[1];
  return width > 0 && height > 0 && targetWidth > 0 && targetHeight > 0
    && nearlyEqual(targetWidth, turns % 2 ? height : width, 1e-4)
    && nearlyEqual(targetHeight, turns % 2 ? width : height, 1e-4);
}

/** Only an explicit, source-bound turn may rotate arbitrary square/circle artwork. */
function rotatedBoxShapeAppearance(doc: PDFDocument, source: PDFDict, target: PDFDict, turns: number, lib: PdfLibModule, contentsIndependent = false): PDFObject | undefined {
  const before = readPdfNumberArray(source, 'Rect', lib); const after = readPdfNumberArray(target, 'Rect', lib);
  if (!before || !after || !boxShapeDimensionsMatch(before, after, turns)
    || !appearanceFieldsEquivalent(source, target, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect' && (!contentsIndependent || key !== 'Contents')), lib)) return undefined;
  if (['RD', 'BE', 'IT', 'Measure', 'Vertices', 'InkList', 'L', 'CL', 'QuadPoints', 'Rotate', 'PDFHubBaseAP']
    .some((key) => source.get(lib.PDFName.of(key)))
    || ((source.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0) & 16)) {
    throw new Error('Cannot safely rotate this shape with unsupported native geometry or flags.');
  }
  const appearance = source.get(lib.PDFName.of('AP'));
  if (!appearance) throw new Error('Cannot safely rotate this imported shape without a native appearance.');
  const ap = doc.context.lookup(appearance);
  if (!(ap instanceof lib.PDFDict) || ap.keys().some((key) => key.decodeText() !== 'N')) {
    throw new Error('Cannot safely rotate this shape with unsupported appearance states.');
  }
  let current = ap.lookupMaybe(lib.PDFName.of('N'), lib.PDFStream);
  const seen = new Set<PDFObject>();
  for (let depth = 0; current?.dict.get(lib.PDFName.of('PDFHubWrappedOriginal')); depth += 1) {
    const original = current.dict.get(lib.PDFName.of('PDFHubWrappedOriginal'))!;
    if (depth >= 16 || seen.has(original)) throw new Error('Cannot safely rotate this shape: appearance nesting is too deep.');
    seen.add(original);
    current = doc.context.lookupMaybe(original, lib.PDFStream);
    if (!current) throw new Error('Cannot safely rotate this shape: invalid appearance nesting.');
  }
  return rotatedCopyAppearance(doc, appearance, before, (360 - turns * 90) % 360, lib);
}

/** Transform source cloud artwork and its native inner rectangle together. */
function rotatedCloudAppearance(doc: PDFDocument, source: PDFDict, target: PDFDict, turns: number, lib: PdfLibModule): PDFObject | undefined {
  if (!supportsNativeCloudRotation(source, lib)) throw new Error('Cannot safely rotate this cloud with unsupported native geometry or appearance.');
  const before = readPdfNumberArray(source, 'Rect', lib); const after = readPdfNumberArray(target, 'Rect', lib);
  if (!before || !after || !boxShapeDimensionsMatch(before, after, turns)
    || !appearanceFieldsEquivalent(source, target, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect' && key !== 'RD'), lib)) return undefined;
  const rd = readPdfNumberArray(source, 'RD', lib);
  if (rd) target.set(lib.PDFName.of('RD'), doc.context.obj(rotateCloudInsets(rd, turns)));
  const appearance = source.get(lib.PDFName.of('AP'));
  const ap = doc.context.lookup(appearance) as PDFDict;
  let current = ap.lookupMaybe(lib.PDFName.of('N'), lib.PDFStream);
  const seen = new Set<PDFObject>();
  for (let depth = 0; current?.dict.get(lib.PDFName.of('PDFHubWrappedOriginal')); depth += 1) {
    const original = current.dict.get(lib.PDFName.of('PDFHubWrappedOriginal'))!;
    if (depth >= 16 || seen.has(original)) throw new Error('Cannot safely rotate this cloud: appearance nesting is too deep.');
    seen.add(original);
    current = doc.context.lookupMaybe(original, lib.PDFStream);
    if (!current) throw new Error('Cannot safely rotate this cloud: invalid appearance nesting.');
  }
  return rotatedCopyAppearance(doc, appearance, before, (360 - turns * 90) % 360, lib);
}

/** Portable normal appearance for a new rectangle or ellipse. */
function attachCreatedBoxShapeAppearance(doc: PDFDocument, dict: PDFDict, annotation: PdfAnnotation, lib: PdfLibModule, orientation = boxShapePendingTurns(annotation)): void {
  const rect = readPdfNumberArray(dict, 'Rect', lib);
  if (!rect || rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] <= rect[0] || rect[3] <= rect[1]) {
    throw new Error('Cannot safely render this shape: invalid geometry.');
  }
  const turns = orientation;
  const targetWidth = rect[2] - rect[0]; const targetHeight = rect[3] - rect[1];
  const width = turns % 2 ? targetHeight : targetWidth;
  const height = turns % 2 ? targetWidth : targetHeight;
  const style = annotation.data.borderStyle ?? 'solid';
  const lineWidth = annotation.data.borderWidth ?? 2;
  const opacity = annotation.data.opacity ?? 1;
  const border = annotation.data.borderColor; const background = annotation.data.backgroundColor;
  const validColor = (value: string | undefined) => value === undefined || value === 'transparent' || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
  if (!['solid', 'dashed', 'dotted', 'none'].includes(style) || !Number.isFinite(lineWidth) || lineWidth < 0
    || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 || !validColor(border) || !validColor(background)
    || (border === 'transparent' && style !== 'none' && lineWidth > 0)) {
    throw new Error('Cannot safely render this shape: unsupported color, border or opacity.');
  }
  const hasStroke = style !== 'none' && lineWidth > 0; const hasFill = Boolean(background && background !== 'transparent');
  if (hasStroke && (width <= lineWidth || height <= lineWidth)) throw new Error('Cannot safely render this shape: its border is too wide.');
  const rgb = (color: PdfColor) => colorArray(color).map(formatPdfNumber).join(' ');
  const f = formatPdfNumber;
  const inset = hasStroke ? lineWidth / 2 : 0;
  const left = inset; const right = width - inset; const bottom = inset; const top = height - inset;
  const commands = ['q', '/GS0 gs', `${rgb(readColor(border, readColor('#3b82f6', DEFAULT_STROKE)))} RG`,
    `${rgb(readColor(background, DEFAULT_FILL))} rg`, `${f(lineWidth)} w`, '1 j'];
  if (style === 'dashed') commands.push('[3 2] 0 d');
  if (style === 'dotted') commands.push('[1 1] 0 d');
  if (annotation.type === 'shape-rect') commands.push(`${f(left)} ${f(bottom)} ${f(right - left)} ${f(top - bottom)} re`);
  else {
    const cx = width / 2; const cy = height / 2; const rx = (right - left) / 2; const ry = (top - bottom) / 2; const k = 0.5522847498307936;
    commands.push(`${f(cx + rx)} ${f(cy)} m`,
      `${f(cx + rx)} ${f(cy + k * ry)} ${f(cx + k * rx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} c`,
      `${f(cx - k * rx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + k * ry)} ${f(cx - rx)} ${f(cy)} c`,
      `${f(cx - rx)} ${f(cy - k * ry)} ${f(cx - k * rx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} c`,
      `${f(cx + k * rx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - k * ry)} ${f(cx + rx)} ${f(cy)} c`, 'h');
  }
  commands.push(hasStroke && hasFill ? 'B' : hasFill ? 'f' : hasStroke ? 'S' : 'n', 'Q');
  const state = doc.context.register(doc.context.obj({ Type: 'ExtGState', CA: opacity, ca: opacity }));
  const angle = (4 - turns) % 4;
  const matrix = angle === 1 ? [0, 1, -1, 0, height, 0] : angle === 2 ? [-1, 0, 0, -1, width, height]
    : angle === 3 ? [0, -1, 1, 0, 0, width] : [1, 0, 0, 1, 0, 0];
  const form = doc.context.flateStream(`${commands.join('\n')}\n`, { Type: 'XObject', Subtype: 'Form', FormType: 1,
    BBox: [0, 0, width, height], Matrix: matrix, Resources: { ExtGState: { GS0: state } } });
  dict.set(lib.PDFName.of('AP'), doc.context.obj({ N: doc.context.register(form) }));
}

function inkPendingTurns(annotation: PdfAnnotation): number {
  const turns = (annotation.data as typeof annotation.data & { nativeInkQuarterTurns?: number }).nativeInkQuarterTurns ?? 0;
  if (!Number.isInteger(turns) || turns < 0 || turns > 3) throw new Error('Cannot safely rotate this ink: invalid rotation state.');
  return turns;
}

function linePendingTurns(annotation: PdfAnnotation): number {
  const turns = (annotation.data as typeof annotation.data & { nativeLineQuarterTurns?: number }).nativeLineQuarterTurns ?? 0;
  if (!Number.isInteger(turns) || turns < 0 || turns > 3) throw new Error('Cannot safely rotate this line: invalid rotation state.');
  return turns;
}

function lineModelTurn(before: PdfAnnotation, after: PdfAnnotation, turns: number): boolean {
  if (!['line', 'arrow'].includes(before.type) || after.type !== before.type || !turns) return false;
  const rect = (item: PdfAnnotation) => [item.rect.x, item.rect.y, item.rect.x + item.rect.width, item.rect.y + item.rect.height];
  const points = (item: PdfAnnotation) => (item.data.points ?? []).map((value, i) => value + (i % 2 ? item.rect.y : item.rect.x));
  return points(before).length === 4 && polygonQuarterTurn(rect(before), points(before), rect(after), points(after), turns * 90, 4);
}

function rotatedLineAppearance(doc: PDFDocument, source: PDFDict, target: PDFDict, turns: number, lib: PdfLibModule): PDFObject | undefined {
  const beforeRect = readPdfNumberArray(source, 'Rect', lib); const afterRect = readPdfNumberArray(target, 'Rect', lib);
  const before = readPdfNumberArray(source, 'L', lib); const after = readPdfNumberArray(target, 'L', lib);
  if (!beforeRect || !afterRect || !before || !after || before.length !== 4 || after.length !== 4
    || (before[0] === before[2] && before[1] === before[3])) return undefined;
  const angle = (360 - turns * 90) % 360;
  if (!polygonQuarterTurn(beforeRect, before, afterRect, after, angle, 4)
    || !appearanceFieldsEquivalent(source, target, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect' && key !== 'L'), lib)) return undefined;
  if (['RD', 'QuadPoints', 'Vertices', 'InkList', 'CL', 'CO', 'LL', 'LLE', 'LLO', 'Cap', 'CP', 'Measure']
    .some((key) => source.get(lib.PDFName.of(key))) || ((source.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0) & 16)
    || (source.get(lib.PDFName.of('IT')) && source.lookupMaybe(lib.PDFName.of('IT'), lib.PDFName)?.decodeText() !== 'LineArrow')) {
    throw new Error('Cannot safely rotate this line with unsupported native geometry, caption, leader, intent or flags.');
  }
  const endings = source.lookupMaybe(lib.PDFName.of('LE'), lib.PDFArray);
  const validEndings = ['None', 'Square', 'Circle', 'Diamond', 'OpenArrow', 'ClosedArrow', 'Butt', 'ROpenArrow', 'RClosedArrow', 'Slash'];
  if (source.get(lib.PDFName.of('LE')) && (!endings || endings.size() !== 2
    || ![0, 1].every((i) => validEndings.includes(endings.lookupMaybe(i, lib.PDFName)?.decodeText() ?? '')))) {
    throw new Error('Cannot safely rotate this line: unsupported endpoint styles.');
  }
  const appearance = source.get(lib.PDFName.of('AP'));
  if (!appearance) throw new Error('Cannot safely rotate this imported line without a native appearance.');
  const ap = doc.context.lookup(appearance, lib.PDFDict);
  let current = ap.lookupMaybe(lib.PDFName.of('N'), lib.PDFStream);
  const seen = new Set<PDFObject>();
  for (let depth = 0; current?.dict.get(lib.PDFName.of('PDFHubWrappedOriginal')); depth += 1) {
    const original = current.dict.get(lib.PDFName.of('PDFHubWrappedOriginal'))!;
    if (depth >= 16 || seen.has(original)) throw new Error('Cannot safely rotate this line: appearance nesting is too deep.');
    seen.add(original); current = doc.context.lookupMaybe(original, lib.PDFStream);
    if (!current) throw new Error('Cannot safely rotate this line: invalid appearance nesting.');
  }
  return rotatedCopyAppearance(doc, appearance, beforeRect, angle, lib);
}

/** Generate a portable appearance for an app-created line with native endings. */
function attachCreatedLineAppearance(doc: PDFDocument, dict: PDFDict, annotation: PdfAnnotation, lib: PdfLibModule): void {
  const rect = readPdfNumberArray(dict, 'Rect', lib); const line = readPdfNumberArray(dict, 'L', lib);
  const model = annotation.data.points;
  if (!rect || rect.length !== 4 || !line || line.length !== 4 || ![...rect, ...line].every(Number.isFinite)
    || rect[2] <= rect[0] || rect[3] <= rect[1] || (line[0] === line[2] && line[1] === line[3])
    || !model || model.length !== 4 || !model.every(Number.isFinite)) {
    throw new Error('Cannot safely render this line: invalid or zero-length geometry.');
  }
  const style = annotation.data.borderStyle ?? 'solid'; const width = annotation.data.borderWidth ?? 2;
  const opacity = annotation.data.opacity ?? 1; const color = annotation.data.borderColor;
  const validCap = (cap: unknown) => cap === undefined || ['none', 'arrow', 'circle', 'square'].includes(String(cap));
  if (!['solid', 'dashed', 'dotted'].includes(style) || !Number.isFinite(width) || width <= 0
    || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 || !validCap(annotation.data.lineStartCap) || !validCap(annotation.data.lineEndCap)
    || (color !== undefined && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color))) {
    throw new Error('Cannot safely render this line: unsupported color, border, opacity or ending.');
  }
  const endings = readPdfLineEndings(dict, lib) ?? ['None', 'None'];
  if (endings.some((ending) => !['None', 'ClosedArrow', 'Circle', 'Square'].includes(ending))) {
    throw new Error('Cannot safely render this line: unsupported endpoint style.');
  }
  const dx = line[2] - line[0]; const dy = line[3] - line[1]; const length = Math.hypot(dx, dy);
  const ux = dx / length; const uy = dy / length; const px = -uy; const py = ux;
  const capMargin = endings.some((ending) => ending !== 'None') ? width * 8.5 : width / 2;
  const expanded = [Math.min(rect[0], Math.min(line[0], line[2]) - capMargin), Math.min(rect[1], Math.min(line[1], line[3]) - capMargin),
    Math.max(rect[2], Math.max(line[0], line[2]) + capMargin), Math.max(rect[3], Math.max(line[1], line[3]) + capMargin)];
  dict.set(lib.PDFName.of('Rect'), doc.context.obj(expanded));
  const rgb = colorArray(readColor(color, readColor('#111827', DEFAULT_STROKE))).map(formatPdfNumber).join(' ');
  if (endings.some((ending) => ending !== 'None')) dict.set(lib.PDFName.of('IC'), doc.context.obj(colorArray(readColor(color, readColor('#111827', DEFAULT_STROKE)))));
  const f = formatPdfNumber; const local = (x: number, y: number) => `${f(x - expanded[0])} ${f(y - expanded[1])}`;
  const commands = ['q', '/GS0 gs', `${rgb} RG`, `${rgb} rg`, `${f(width)} w`, '1 J', '1 j'];
  if (style === 'dashed') commands.push('[3 2] 0 d');
  if (style === 'dotted') commands.push('[1 1] 0 d');
  commands.push(`${local(line[0], line[1])} m`, `${local(line[2], line[3])} l`, 'S', '[] 0 d');
  for (let i = 0; i < 2; i += 1) {
    const ending = endings[i]; if (ending === 'None') continue;
    const x = line[i * 2]; const y = line[i * 2 + 1]; const sign = i === 0 ? 1 : -1;
    if (ending === 'ClosedArrow') {
      const bx = x + sign * ux * width * 7; const by = y + sign * uy * width * 7; const half = width * 3.5;
      commands.push(`${local(x, y)} m`, `${local(bx + px * half, by + py * half)} l`, `${local(bx - px * half, by - py * half)} l`, 'h B');
    } else if (ending === 'Square') {
      const half = width * 2.5; const corners = [[-1,-1], [1,-1], [1,1], [-1,1]];
      corners.forEach(([a, b], index) => commands.push(`${local(x + (ux * a + px * b) * half, y + (uy * a + py * b) * half)} ${index ? 'l' : 'm'}`));
      commands.push('h B');
    } else {
      const r = width * 3; const k = r * 0.5522847498;
      commands.push(`${local(x + r, y)} m`, `${local(x + r, y + k)} ${local(x + k, y + r)} ${local(x, y + r)} c`,
        `${local(x - k, y + r)} ${local(x - r, y + k)} ${local(x - r, y)} c`,
        `${local(x - r, y - k)} ${local(x - k, y - r)} ${local(x, y - r)} c`,
        `${local(x + k, y - r)} ${local(x + r, y - k)} ${local(x + r, y)} c`, 'h B');
    }
  }
  commands.push('Q');
  const gs = doc.context.register(doc.context.obj({ Type: 'ExtGState', CA: opacity, ca: opacity }));
  const form = doc.context.flateStream(`${commands.join('\n')}\n`, { Type: 'XObject', Subtype: 'Form', FormType: 1,
    BBox: [0, 0, expanded[2] - expanded[0], expanded[3] - expanded[1]], Resources: { ExtGState: { GS0: gs } } });
  dict.set(lib.PDFName.of('AP'), doc.context.obj({ N: doc.context.register(form) }));
}

function inkPathsFromDict(dict: PDFDict, lib: PdfLibModule): number[][] | null {
  const ink = dict.lookupMaybe(lib.PDFName.of('InkList'), lib.PDFArray);
  if (!ink || !ink.size()) return null;
  const paths: number[][] = [];
  for (let i = 0; i < ink.size(); i += 1) {
    const path = ink.lookupMaybe(i, lib.PDFArray);
    if (!path) return null;
    const values = readPdfArrayValues(path, lib);
    if (values.length < 4 || values.length % 2 || values.length !== path.size() || !values.every(Number.isFinite)
      || !values.some((value, i) => i % 2 === 0 && (value !== values[0] || values[i + 1] !== values[1]))) return null;
    paths.push(values);
  }
  return paths;
}

function inkTurnMatches(beforeRect: readonly number[], before: readonly number[][], afterRect: readonly number[], after: readonly number[][], angle: number): boolean {
  return before.length > 0 && before.length === after.length
    && before.every((path, i) => polygonQuarterTurn(beforeRect, path, afterRect, after[i], angle, 4));
}

function inkModelTurn(before: PdfAnnotation, after: PdfAnnotation, turns: number): boolean {
  if (before.type !== 'ink' || after.type !== 'ink' || !turns) return false;
  const rect = (item: PdfAnnotation) => [item.rect.x, item.rect.y, item.rect.x + item.rect.width, item.rect.y + item.rect.height];
  return inkTurnMatches(rect(before), before.data.paths ?? [], rect(after), after.data.paths ?? [], turns * 90);
}

/** Rotate imported ink only after every native stroke proves the same rigid turn. */
function rotatedInkAppearance(doc: PDFDocument, source: PDFDict, target: PDFDict, turns: number, lib: PdfLibModule): PDFObject | undefined {
  const beforeRect = readPdfNumberArray(source, 'Rect', lib); const afterRect = readPdfNumberArray(target, 'Rect', lib);
  const before = inkPathsFromDict(source, lib); const after = inkPathsFromDict(target, lib);
  if (!beforeRect || !afterRect || !before || !after) return undefined;
  const angle = (360 - turns * 90) % 360;
  if (!inkTurnMatches(beforeRect, before, afterRect, after, angle)
    || !appearanceFieldsEquivalent(source, target, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect' && key !== 'InkList'), lib)) return undefined;
  if (['RD', 'QuadPoints', 'Vertices', 'L', 'CL'].some((key) => source.get(lib.PDFName.of(key)))
    || ((source.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0) & 16)) {
    throw new Error('Cannot safely rotate this ink with unsupported native geometry or flags.');
  }
  const appearance = source.get(lib.PDFName.of('AP'));
  if (!appearance) throw new Error('Cannot safely rotate this imported ink without a native appearance.');
  const ap = doc.context.lookup(appearance, lib.PDFDict);
  let current = ap.lookupMaybe(lib.PDFName.of('N'), lib.PDFStream);
  const seen = new Set<PDFObject>();
  for (let depth = 0; current?.dict.get(lib.PDFName.of('PDFHubWrappedOriginal')); depth += 1) {
    const original = current.dict.get(lib.PDFName.of('PDFHubWrappedOriginal'))!;
    if (depth >= 16 || seen.has(original)) throw new Error('Cannot safely rotate this ink: appearance nesting is too deep.');
    seen.add(original);
    current = doc.context.lookupMaybe(original, lib.PDFStream);
    if (!current) throw new Error('Cannot safely rotate this ink: invalid appearance nesting.');
  }
  return rotatedCopyAppearance(doc, appearance, beforeRect, angle, lib);
}

/** Supply a portable appearance for freshly drawn ink, including full round caps. */
function attachCreatedInkAppearance(doc: PDFDocument, dict: PDFDict, annotation: PdfAnnotation, lib: PdfLibModule): void {
  const paths = annotation.data.paths;
  const rect = readPdfNumberArray(dict, 'Rect', lib);
  const pdfPaths = inkPathsFromDict(dict, lib);
  if (!paths?.length || paths.some((path) => !Array.isArray(path) || path.length < 4 || path.length % 2 || !path.every(Number.isFinite)
    || !path.some((value, i) => i % 2 === 0 && (value !== path[0] || path[i + 1] !== path[1])))
    || !rect || rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] <= rect[0] || rect[3] <= rect[1]
    || !pdfPaths || pdfPaths.length !== paths.length || pdfPaths.some((path, i) => path.length !== paths[i].length)) {
    throw new Error('Cannot safely render this ink: invalid or single-point stroke geometry.');
  }
  const style = annotation.data.borderStyle ?? 'solid';
  const width = annotation.data.borderWidth ?? 2;
  const opacity = annotation.data.opacity ?? 1;
  const color = annotation.data.borderColor;
  if (!['solid', 'dashed', 'dotted', 'none'].includes(style) || !Number.isFinite(width) || width < 0
    || !Number.isFinite(opacity) || opacity < 0 || opacity > 1
    || (color !== undefined && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color))) {
    throw new Error('Cannot safely render this ink: unsupported color, border or opacity.');
  }
  const margin = style !== 'none' && width > 0 ? width / 2 : 0;
  const expanded = [...rect];
  for (const path of pdfPaths) {
    for (let i = 0; i < path.length; i += 2) {
      expanded[0] = Math.min(expanded[0], path[i] - margin); expanded[1] = Math.min(expanded[1], path[i + 1] - margin);
      expanded[2] = Math.max(expanded[2], path[i] + margin); expanded[3] = Math.max(expanded[3], path[i + 1] + margin);
    }
  }
  dict.set(lib.PDFName.of('Rect'), doc.context.obj(expanded));
  const rgb = colorArray(readColor(color, { r: 0, g: 0, b: 0 })).map(formatPdfNumber).join(' ');
  const commands = ['q', '/GS0 gs', `${rgb} RG`, `${formatPdfNumber(width)} w`, '1 J', '1 j'];
  if (style === 'dashed') commands.push('[3 2] 0 d');
  if (style === 'dotted') commands.push('[1 1] 0 d');
  for (const path of pdfPaths) {
    commands.push(`${formatPdfNumber(path[0] - expanded[0])} ${formatPdfNumber(path[1] - expanded[1])} m`);
    for (let i = 2; i < path.length; i += 2) commands.push(`${formatPdfNumber(path[i] - expanded[0])} ${formatPdfNumber(path[i + 1] - expanded[1])} l`);
    commands.push(style === 'none' || width === 0 ? 'n' : 'S');
  }
  commands.push('Q');
  const state = doc.context.register(doc.context.obj({ Type: 'ExtGState', CA: opacity, ca: opacity }));
  const form = doc.context.flateStream(`${commands.join('\n')}\n`, { Type: 'XObject', Subtype: 'Form', FormType: 1,
    BBox: [0, 0, expanded[2] - expanded[0], expanded[3] - expanded[1]], Resources: { ExtGState: { GS0: state } } });
  dict.set(lib.PDFName.of('AP'), doc.context.obj({ N: doc.context.register(form) }));
}

function polygonPendingTurns(annotation: PdfAnnotation): number {
  const turns = (annotation.data as typeof annotation.data & { nativePolygonQuarterTurns?: number }).nativePolygonQuarterTurns ?? 0;
  if (!Number.isInteger(turns) || turns < 0 || turns > 3) throw new Error('Cannot safely rotate this polygon: invalid rotation state.');
  return turns;
}

function polygonModelTurn(before: PdfAnnotation, after: PdfAnnotation, turns: number): boolean {
  if (before.type !== 'shape-polygon' || after.type !== 'shape-polygon' || !turns) return false;
  const rect = (item: PdfAnnotation) => [item.rect.x, item.rect.y, item.rect.x + item.rect.width, item.rect.y + item.rect.height];
  return polygonQuarterTurn(rect(before), before.data.points ?? [], rect(after), after.data.points ?? [], turns * 90);
}

/** Preserve source artwork only when the native vertices prove a pure rotation. */
function rotatedPolygonAppearance(doc: PDFDocument, source: PDFDict, target: PDFDict, turns: number, lib: PdfLibModule): PDFObject | undefined {
  const beforeRect = readPdfNumberArray(source, 'Rect', lib); const afterRect = readPdfNumberArray(target, 'Rect', lib);
  const before = readPdfNumberArray(source, 'Vertices', lib); const after = readPdfNumberArray(target, 'Vertices', lib);
  if (!beforeRect || !afterRect || !before || !after) return undefined;
  const angle = (360 - turns * 90) % 360;
  if (!polygonQuarterTurn(beforeRect, before, afterRect, after, angle)) return undefined;
  if (!appearanceFieldsEquivalent(source, target, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect' && key !== 'Vertices'), lib)) return undefined;
  if (source.get(lib.PDFName.of('RD')) || source.get(lib.PDFName.of('QuadPoints')) || source.get(lib.PDFName.of('InkList'))
    || ((source.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0) & 16)) {
    throw new Error('Cannot safely rotate this polygon with unsupported native geometry or flags.');
  }
  const appearance = source.get(lib.PDFName.of('AP'));
  if (!appearance) throw new Error('Cannot safely rotate this imported polygon without a native appearance.');
  const ap = doc.context.lookup(appearance, lib.PDFDict);
  let current = ap.lookupMaybe(lib.PDFName.of('N'), lib.PDFStream);
  const seen = new Set<PDFObject>();
  for (let depth = 0; current?.dict.get(lib.PDFName.of('PDFHubWrappedOriginal')); depth += 1) {
    const original = current.dict.get(lib.PDFName.of('PDFHubWrappedOriginal'))!;
    if (depth >= 16 || seen.has(original)) throw new Error('Cannot safely rotate this polygon: appearance nesting is too deep.');
    seen.add(original);
    current = doc.context.lookupMaybe(original, lib.PDFStream);
    if (!current) throw new Error('Cannot safely rotate this polygon: invalid appearance nesting.');
  }
  return rotatedCopyAppearance(doc, appearance, beforeRect, angle, lib);
}

/** Create a portable normal appearance for a newly drawn polygon. */
function attachCreatedPolygonAppearance(doc: PDFDocument, dict: PDFDict, annotation: PdfAnnotation, lib: PdfLibModule): void {
  const rect = readPdfNumberArray(dict, 'Rect', lib); const points = readPdfNumberArray(dict, 'Vertices', lib);
  if (!rect || rect.length !== 4 || !points || points.length < 6 || points.length % 2
    || ![...rect, ...points].every(Number.isFinite) || rect[2] <= rect[0] || rect[3] <= rect[1]) {
    throw new Error('Cannot safely render this polygon: invalid geometry.');
  }
  const style = annotation.data.borderStyle ?? 'solid';
  const width = annotation.data.borderWidth ?? 2;
  const opacity = annotation.data.opacity ?? 1;
  if (!['solid', 'dashed', 'dotted', 'none'].includes(style)
    || !Number.isFinite(width) || width < 0 || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('Cannot safely render this polygon: unsupported border or opacity.');
  }
  const border = annotation.data.borderColor; const background = annotation.data.backgroundColor;
  const validColor = (value: string | undefined) => value === undefined || value === 'transparent' || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
  if (!validColor(border) || !validColor(background) || (border === 'transparent' && style !== 'none' && width > 0)) {
    throw new Error('Cannot safely render this polygon: unsupported color.');
  }
  const hasStroke = style !== 'none' && width > 0;
  const hasFill = Boolean(background && background !== 'transparent');
  // Polygon vertices often lie on the model rectangle. Extend /Rect far
  // enough to contain the full round stroke instead of clipping its outer half.
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const margin = hasStroke ? width / 2 : 0;
  const expanded = [Math.min(rect[0], Math.min(...xs) - margin), Math.min(rect[1], Math.min(...ys) - margin),
    Math.max(rect[2], Math.max(...xs) + margin), Math.max(rect[3], Math.max(...ys) + margin)];
  dict.set(lib.PDFName.of('Rect'), doc.context.obj(expanded));
  const rgb = (color: PdfColor) => colorArray(color).map(formatPdfNumber).join(' ');
  const commands = ['q', '/GS0 gs', `${rgb(readColor(border, readColor('#3b82f6', DEFAULT_STROKE)))} RG`, `${rgb(readColor(background, DEFAULT_FILL))} rg`, `${formatPdfNumber(width)} w`, '1 j'];
  if (style === 'dashed') commands.push('[3 2] 0 d');
  if (style === 'dotted') commands.push('[1 1] 0 d');
  commands.push(`${formatPdfNumber(points[0] - expanded[0])} ${formatPdfNumber(points[1] - expanded[1])} m`);
  for (let index = 2; index < points.length; index += 2) {
    commands.push(`${formatPdfNumber(points[index] - expanded[0])} ${formatPdfNumber(points[index + 1] - expanded[1])} l`);
  }
  commands.push('h', hasStroke && hasFill ? 'B' : hasFill ? 'f' : hasStroke ? 'S' : 'n', 'Q');
  const state = doc.context.register(doc.context.obj({ Type: 'ExtGState', CA: opacity, ca: opacity }));
  const form = doc.context.flateStream(`${commands.join('\n')}\n`, {
    Type: 'XObject', Subtype: 'Form', FormType: 1,
    BBox: [0, 0, expanded[2] - expanded[0], expanded[3] - expanded[1]],
    Resources: { ExtGState: { GS0: state } },
  });
  dict.set(lib.PDFName.of('AP'), doc.context.obj({ N: doc.context.register(form) }));
}

function unrotatedFreeTextSource(doc: PDFDocument, source: PDFDict | null, lib: PdfLibModule): PDFDict | null {
  if (!source?.get(lib.PDFName.of('PDFHubBaseRect'))) return source;
  const base = doc.context.obj({}) as PDFDict;
  for (const key of source.keys()) {
    const value = source.get(key);
    if (value) base.set(key, value);
  }
  for (const [standard, stored] of [['Rect', 'PDFHubBaseRect'], ['AP', 'PDFHubBaseAP'], ['RD', 'PDFHubBaseRD'], ['CL', 'PDFHubBaseCL']] as const) {
    const value = source.get(lib.PDFName.of(stored));
    if (value) base.set(lib.PDFName.of(standard), value);
    else if (standard === 'RD' || standard === 'CL') base.delete(lib.PDFName.of(standard));
  }
  base.delete(lib.PDFName.of('Rotate'));
  return base;
}

function applyNativeFreeTextRotation(doc: PDFDocument, dict: PDFDict, annotation: PdfAnnotation, bodyRect: PdfRect, lib: PdfLibModule): void {
  if (annotation.type !== 'textbox' && annotation.type !== 'callout') return;
  const requested = annotation.data.rotation ?? 0;
  if (!Number.isFinite(requested)) throw new Error('Cannot safely rotate native text: invalid angle.');
  const angle = ((requested % 360) + 360) % 360;
  if (angle === 0) return;
  if (![90, 180, 270].includes(angle)) throw new Error('Cannot safely rotate native text: use 90 degree increments.');
  const originalRect = readPdfNumberArray(dict, 'Rect', lib);
  const rd = readPdfNumberArray(dict, 'RD', lib);
  const leader = readPdfNumberArray(dict, 'CL', lib);
  const appearance = dict.get(lib.PDFName.of('AP'));
  if (!originalRect || originalRect.length !== 4 || !appearance) throw new Error('Cannot safely rotate native text without its geometry and appearance.');
  const inner = calloutBodyRect(originalRect, rd, leader) ?? bodyRect;
  const pivot = annotation.type === 'callout' ? bodyRect : originalRect;
  const cx = (pivot[0] + pivot[2]) / 2; const cy = (pivot[1] + pivot[3]) / 2;
  const point = (x: number, y: number): [number, number] => {
    if (angle === 90) return [cx + y - cy, cy - x + cx];
    if (angle === 180) return [2 * cx - x, 2 * cy - y];
    return [cx - y + cy, cy + x - cx];
  };
  const mappedRect = (rect: readonly number[]): PdfRect => {
    const p = [point(rect[0], rect[1]), point(rect[0], rect[3]), point(rect[2], rect[1]), point(rect[2], rect[3])];
    return [Math.min(...p.map((v) => v[0])), Math.min(...p.map((v) => v[1])), Math.max(...p.map((v) => v[0])), Math.max(...p.map((v) => v[1]))];
  };
  const outer = mappedRect(originalRect); const rotatedInner = mappedRect(inner);
  const rotated = rotatedCopyAppearance(doc, appearance, originalRect, (360 - angle) % 360, lib);
  if (!rotated) throw new Error('Cannot safely rotate native text without its appearance.');
  dict.set(lib.PDFName.of('PDFHubBaseRect'), doc.context.obj(originalRect));
  dict.set(lib.PDFName.of('PDFHubBaseAP'), appearance);
  if (rd) dict.set(lib.PDFName.of('PDFHubBaseRD'), doc.context.obj(rd));
  if (leader) dict.set(lib.PDFName.of('PDFHubBaseCL'), doc.context.obj(leader));
  dict.set(lib.PDFName.of('PDFHubRotation'), lib.PDFNumber.of(angle));
  dict.set(lib.PDFName.of('Rotate'), lib.PDFNumber.of((360 - angle) % 360));
  dict.set(lib.PDFName.of('Rect'), doc.context.obj(outer));
  if (rd || annotation.type === 'callout') {
    dict.set(lib.PDFName.of('RD'), doc.context.obj([rotatedInner[0] - outer[0], outer[3] - rotatedInner[3], outer[2] - rotatedInner[2], rotatedInner[1] - outer[1]]));
  }
  if (leader) {
    const points: number[] = [];
    for (let i = 0; i + 1 < leader.length; i += 2) points.push(...point(leader[i], leader[i + 1]));
    dict.set(lib.PDFName.of('CL'), doc.context.obj(points));
  }
  dict.set(lib.PDFName.of('AP'), rotated);
}

function clonePopup(
  doc: PDFDocument,
  page: PDFPage,
  annots: PDFArray,
  source: PDFDict,
  target: PDFDict,
  parentRef: PDFRef,
  mapRect: (values: readonly number[]) => readonly number[],
  name: string,
  lib: PdfLibModule,
  rotation = 0,
): void {
  const popup = source.lookupMaybe(lib.PDFName.of('Popup'), lib.PDFDict);
  if (!popup) return;
  const copy = doc.context.obj({}) as PDFDict;
  for (const key of popup.keys()) {
    const field = key.decodeText();
    if (['Parent', 'P', 'NM', 'Rect'].includes(field)) continue;
    const value = popup.get(key);
    if (value) copy.set(key, value);
  }
  const rect = readPdfNumberArray(popup, 'Rect', lib);
  if (!rect || rect.length !== 4) throw new Error('Cannot safely copy an annotation with an invalid popup rectangle.');
  const flags = popup.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
  if (rotation && (Math.trunc(flags) & 16)) throw new Error('Cannot safely copy a NoRotate popup between differently rotated pages.');
  if (rotation && popup.get(lib.PDFName.of('AP'))) {
    const appearance = rotatedCopyAppearance(doc, popup.get(lib.PDFName.of('AP')), rect, rotation, lib);
    if (appearance) copy.set(lib.PDFName.of('AP'), appearance);
  }
  copy.set(lib.PDFName.of('Rect'), doc.context.obj(mapRect(rect)));
  copy.set(lib.PDFName.of('P'), page.ref);
  copy.set(lib.PDFName.of('Parent'), parentRef);
  if (popup.get(lib.PDFName.of('NM'))) copy.set(lib.PDFName.of('NM'), lib.PDFString.of(name));
  const popupRef = doc.context.register(copy);
  target.set(lib.PDFName.of('Popup'), popupRef);
  annots.push(popupRef);
}

const COPY_APPEARANCE_FIELDS = [
  'fontSize', 'fontWeight', 'fontStyle', 'fontFamily',
  'textAlign', 'textColor', 'lineHeight', 'backgroundColor', 'borderColor',
  'borderWidth', 'borderStyle', 'opacity', 'stampStyle', 'stampName',
  'stampImageDataUrl',
] as const;

function copiedGeometryMatchesSource(copy: PdfAnnotation, source: PdfAnnotation): boolean {
  const dx = copy.rect.x - source.rect.x;
  const dy = copy.rect.y - source.rect.y;
  const pairsMatch = (before: number[] | undefined, after: number[] | undefined, x: number, y: number) => {
    if (!before && !after) return true;
    return Boolean(before && after && before.length % 2 === 0 && before.every(Number.isFinite)
      && numberArraysEquivalent(translatePairs(before, x, y), after, 1e-4));
  };
  const pointMatches = (before: Point2D | undefined, after: Point2D | undefined) => {
    if (!before && !after) return true;
    return Boolean(before && after && nearlyEqual(before.x + dx, after.x, 1e-4) && nearlyEqual(before.y + dy, after.y, 1e-4));
  };
  if (copy.type === 'callout' && (!pointMatches(source.data.anchor, copy.data.anchor)
    || !pointMatches(source.data.knee, copy.data.knee))) return false;
  if ((copy.type === 'line' || copy.type === 'arrow') && !pairsMatch(source.data.points, copy.data.points, 0, 0)) return false;
  if (copy.type === 'shape-polygon' && !pairsMatch(source.data.points, copy.data.points, dx, dy)) return false;
  if (copy.type === 'ink') {
    const before = source.data.paths;
    const after = copy.data.paths;
    if (Boolean(before) !== Boolean(after) || (before && after
      && (before.length !== after.length || before.some((path, index) => !pairsMatch(path, after[index], dx, dy))))) return false;
  }
  if (!pairsMatch(source.data.textMarkupQuads, copy.data.textMarkupQuads, 0, 0)) return false;
  return true;
}

function registerCopiedNativeAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  annots: PDFArray,
  annotation: PdfAnnotation,
  origin: NativeCopyOrigin,
  lib: PdfLibModule,
): PDFRef {
  const polygonTurns = annotation.type === 'shape-polygon' ? polygonPendingTurns(annotation) : 0;
  const inkTurns = annotation.type === 'ink' ? inkPendingTurns(annotation) : 0;
  const lineTurns = annotation.type === 'line' || annotation.type === 'arrow' ? linePendingTurns(annotation) : 0;
  const boxTurns = annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse' || annotation.type === 'shape-cloud' ? boxShapePendingTurns(annotation) : 0;
  const shapeTurns = polygonTurns || inkTurns || lineTurns || boxTurns;
  const modelRect = (item: PdfAnnotation) => [item.rect.x, item.rect.y, item.rect.x + item.rect.width, item.rect.y + item.rect.height];
  const geometryMatches = polygonTurns ? polygonModelTurn(origin.model, annotation, polygonTurns)
    : inkTurns ? inkModelTurn(origin.model, annotation, inkTurns) : lineTurns ? lineModelTurn(origin.model, annotation, lineTurns)
      : boxTurns ? boxShapeDimensionsMatch(modelRect(origin.model), modelRect(annotation), boxTurns)
      : copiedGeometryMatchesSource(annotation, origin.model);
  if (!geometryMatches
    || (!['stamp', 'textbox', 'callout'].includes(annotation.type) && annotation.data.rotation !== origin.model.data.rotation)
    || annotation.type !== origin.model.type || COPY_APPEARANCE_FIELDS.some((key) =>
    JSON.stringify(annotation.data[key]) !== JSON.stringify(origin.model.data[key]))) {
    throw new Error('Cannot safely copy this modified native appearance; save and reopen the original before copying.');
  }
  const sourceDict = annotation.type === 'textbox' || annotation.type === 'callout'
    ? unrotatedFreeTextSource(doc, origin.dict, lib)! : origin.dict;
  const sourceRect = readPdfNumberArray(sourceDict, 'Rect', lib);
  if (!sourceRect || sourceRect.length !== 4) throw new Error('Cannot safely copy an annotation with an invalid rectangle.');
  const sourceBody = annotation.type === 'callout'
    ? calloutBodyRect(sourceRect, readPdfNumberArray(sourceDict, 'RD', lib), readPdfNumberArray(sourceDict, 'CL', lib))
    : annotation.type === 'stamp' ? readPdfNumberArray(sourceDict, 'PDFHubBaseRect', lib) ?? sourceRect : sourceRect;
  if (!sourceBody) throw new Error('Cannot safely copy an annotation with an invalid text rectangle.');
  const targetBody = toPdfGeometry(annotation, page).rect;
  if (!shapeTurns && (Math.abs(origin.model.rect.width - annotation.rect.width) > 1e-4
    || Math.abs(origin.model.rect.height - annotation.rect.height) > 1e-4)) {
    throw new Error('Cannot safely copy a resized native appearance; save and reopen the original before copying.');
  }
  // First map the unrotated source into the target page at the rotated copy's
  // center. Then validate and rotate the mapped appearance and vertices.
  const copyBasis = shapeTurns ? {
    ...annotation,
    rect: {
      x: annotation.rect.x + (annotation.rect.width - origin.model.rect.width) / 2,
      y: annotation.rect.y + (annotation.rect.height - origin.model.rect.height) / 2,
      width: origin.model.rect.width, height: origin.model.rect.height,
    },
  } : annotation;
  const transform = nativeCopyTransform(doc, page, copyBasis, origin);
  const flags = sourceDict.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
  if (transform.rotation && (Math.trunc(flags) & 16)) {
    throw new Error('Cannot safely copy a NoRotate annotation between differently rotated pages.');
  }
  const dict = doc.context.obj({}) as PDFDict;
  for (const key of sourceDict.keys()) {
    const name = key.decodeText();
    if (['P', 'NM', 'Rect', 'Popup', 'Parent', 'IRT', 'RT', 'State', 'StateModel', 'PDFHubData', 'PDFHubType', 'PDFHubVersion', 'AP', STAMP_AP_FINGERPRINT_KEY, STAMP_ROTATION_FINGERPRINT_KEY, BOX_GENERATED_AP_FINGERPRINT_KEY, BOX_GENERATED_AP_ORIENTATION_KEY, MARKUP_GENERATED_AP_KEY].includes(name)
      || (['stamp', 'textbox', 'callout'].includes(annotation.type) && ['PDFHubBaseAP', 'PDFHubBaseRect', 'PDFHubBaseRD', 'PDFHubBaseCL', 'PDFHubRotation'].includes(name))) continue;
    const value = sourceDict.get(key);
    if (value) dict.set(key, value);
  }
  const mappedRect = transform.rect(sourceRect);
  dict.set(lib.PDFName.of('Rect'), doc.context.obj(annotation.type === 'stamp' ? targetBody : mappedRect));
  if (annotation.type === 'callout' && sourceDict.get(lib.PDFName.of('RD'))) {
    const body = transform.rect(sourceBody);
    dict.set(lib.PDFName.of('RD'), doc.context.obj([body[0] - mappedRect[0], mappedRect[3] - body[3], mappedRect[2] - body[2], body[1] - mappedRect[1]]));
  }
  if (['shape-cloud', 'shape-rect', 'shape-ellipse'].includes(annotation.type) && sourceDict.get(lib.PDFName.of('RD'))) {
    const rd = readPdfNumberArray(sourceDict, 'RD', lib);
    if (!rd || rd.length !== 4 || !rd.every((value) => Number.isFinite(value) && value >= 0)
      || sourceRect[0] + rd[0] >= sourceRect[2] - rd[2]
      || sourceRect[1] + rd[3] >= sourceRect[3] - rd[1]) {
      throw new Error('Cannot safely copy a shape with invalid native rectangle differences.');
    }
    const inner = transform.rect([sourceRect[0] + rd[0], sourceRect[1] + rd[3], sourceRect[2] - rd[2], sourceRect[3] - rd[1]]);
    dict.set(lib.PDFName.of('RD'), doc.context.obj([
      inner[0] - mappedRect[0], mappedRect[3] - inner[3], mappedRect[2] - inner[2], inner[1] - mappedRect[1],
    ]));
  }
  const appearance = annotation.type === 'stamp'
    ? sourceDict.get(lib.PDFName.of('PDFHubBaseAP')) ?? sourceDict.get(lib.PDFName.of('AP'))
    : sourceDict.get(lib.PDFName.of('AP'));
  const copiedAppearance = rotatedCopyAppearance(doc, appearance, annotation.type === 'stamp' ? sourceBody : sourceRect, transform.rotation, lib);
  if (copiedAppearance) dict.set(lib.PDFName.of('AP'), copiedAppearance);
  for (const field of ['CL', 'L', 'Vertices', 'QuadPoints']) {
    if (!sourceDict.get(lib.PDFName.of(field))) continue;
    const values = readPdfNumberArray(sourceDict, field, lib);
    if (!values) throw new Error(`Cannot safely copy invalid native ${field} geometry.`);
    dict.set(lib.PDFName.of(field), doc.context.obj(transform.pairs(values)));
  }
  const ink = sourceDict.lookupMaybe(lib.PDFName.of('InkList'), lib.PDFArray);
  if (ink) {
    const paths: number[][] = [];
    for (let i = 0; i < ink.size(); i += 1) {
      const path = ink.lookupMaybe(i, lib.PDFArray);
      if (!path) throw new Error('Cannot safely copy invalid native ink geometry.');
      paths.push(transform.pairs(readPdfArrayValues(path, lib)));
    }
    dict.set(lib.PDFName.of('InkList'), doc.context.obj(paths));
  }
  if (shapeTurns) {
    const candidate = doc.context.obj({}) as PDFDict;
    for (const key of dict.keys()) {
      const value = dict.get(key);
      if (value) candidate.set(key, value);
    }
    candidate.set(lib.PDFName.of('Rect'), doc.context.obj(targetBody));
    const geometryKey = polygonTurns ? 'Vertices' : inkTurns ? 'InkList' : lineTurns ? 'L' : null;
    if (geometryKey) {
      const geometry = toPdfGeometry(annotation, page);
      candidate.set(lib.PDFName.of(geometryKey), doc.context.obj(polygonTurns ? polygonVertices(annotation, geometry)
        : inkTurns ? inkLists(annotation, geometry) : lineCoordinates(annotation, geometry, null, lib) as number[]));
    }
    const rotated = polygonTurns ? rotatedPolygonAppearance(doc, dict, candidate, polygonTurns, lib)
      : inkTurns ? rotatedInkAppearance(doc, dict, candidate, inkTurns, lib)
        : lineTurns ? rotatedLineAppearance(doc, dict, candidate, lineTurns, lib)
          : annotation.type === 'shape-cloud' ? rotatedCloudAppearance(doc, dict, candidate, boxTurns, lib) : rotatedBoxShapeAppearance(doc, dict, candidate, boxTurns, lib);
    if (!rotated) throw new Error('Cannot safely rotate this copied annotation: its geometry or appearance also changed.');
    dict.set(lib.PDFName.of('Rect'), candidate.get(lib.PDFName.of('Rect'))!);
    if (annotation.type === 'shape-cloud' && candidate.get(lib.PDFName.of('RD'))) dict.set(lib.PDFName.of('RD'), candidate.get(lib.PDFName.of('RD'))!);
    if (geometryKey) dict.set(lib.PDFName.of(geometryKey), candidate.get(lib.PDFName.of(geometryKey))!);
    dict.set(lib.PDFName.of('AP'), rotated);
  }
  dict.set(lib.PDFName.of('P'), page.ref);
  dict.set(lib.PDFName.of('NM'), lib.PDFString.of(annotation.id));
  dict.set(lib.PDFName.of('PDFHubVersion'), lib.PDFNumber.of(1));
  dict.set(lib.PDFName.of('PDFHubType'), lib.PDFString.of(annotation.type));
  dict.set(lib.PDFName.of('PDFHubData'), pdfText(lib, JSON.stringify(serializableAnnotationData(annotation))));
  if (annotation.type === 'stamp') applyNativeStampRotation(doc, dict, null, annotation, targetBody, lib);
  const ref = doc.context.register(dict);
  clonePopup(doc, page, annots, origin.dict, dict, ref, transform.rect, `${annotation.id}:popup`, lib, transform.rotation);
  return ref;
}

function remapCopiedReplyGraph(
  source: ExistingReplyGraph,
  replies: ReviewReply[],
  lib: PdfLibModule,
): ExistingReplyGraph {
  const mapping = new Map(replies.filter((reply) => reply.nativeCopySourceId)
    .map((reply) => [reply.nativeCopySourceId!, reply]));
  const records = source.records.map((record) => {
    const reply = mapping.get(record.logicalId);
    if (!reply || readTextObject(record.dict, 'Contents', lib) !== reply.content) {
      throw new Error('Cannot safely copy a changed or unsupported native comment thread.');
    }
    return { ...record, logicalId: reply.id };
  });
  return { rootRefKey: source.rootRefKey, records };
}

function preservePassiveAnnotationEntries(
  source: PDFDict | null,
  target: PDFDict,
  ownedKeys: Set<string>,
  appearanceKeys: readonly string[],
  lib: PdfLibModule,
): void {
  if (!source) return;

  const contentsChanged = !pdfObjectsEquivalent(
    source.get(lib.PDFName.of('Contents')),
    target.get(lib.PDFName.of('Contents')),
    lib,
  );

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
    if (name === 'RC' && contentsChanged) continue;

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

export function appearanceFieldsEquivalent(
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
  return semanticValuesEquivalent(pdfSemanticValue(left, lib), pdfSemanticValue(right, lib));
}

function semanticValuesEquivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a === 'number' && typeof b === 'number') {
    return nearlyEqual(a, b, 1e-4);
  }
  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => semanticValuesEquivalent(item, b[i]));
  }
  if (Array.isArray(b)) return false;
  const left = a as { type?: unknown; value?: unknown };
  const right = b as { type?: unknown; value?: unknown };
  if (left.type !== right.type) return false;
  if (left.type === 'number' && typeof left.value === 'number' && typeof right.value === 'number') {
    return nearlyEqual(left.value, right.value, 1e-4);
  }
  if (left.type === 'string' || left.type === 'name' || left.type === 'boolean' || left.type === 'other') {
    return left.value === right.value;
  }
  return false;
}

function pdfSemanticValue(
  value: unknown,
  lib: PdfLibModule,
): unknown {
  if (value === undefined || value === null) return null;

  if (typeof value === 'number') {
    return { type: 'number', value };
  }
  if (typeof value === 'string') {
    return { type: 'string', value };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  }
  if (Array.isArray(value)) {
    return value.map((item) => pdfSemanticValue(item, lib));
  }
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

async function registerNativeAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  annotation: PdfAnnotation,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
  sourceModel?: PdfAnnotation,
): Promise<PDFRef> {
  const originalSource = sourceDict;
  const trustedGeneratedMarkup = Boolean(markupOrMask(annotation.type) && sourceDict
    && await verifyGeneratedMarkupAppearance(doc, sourceDict, lib));
  if (annotation.type === 'textbox' || annotation.type === 'callout') {
    const foreignRotation = sourceDict?.lookupMaybe(lib.PDFName.of('Rotate'), lib.PDFNumber)?.asNumber() ?? 0;
    if (annotation.data.rotation && foreignRotation && !sourceDict?.get(lib.PDFName.of('PDFHubBaseRect'))) {
      throw new Error('Cannot safely rotate native text with an existing external rotation.');
    }
    sourceDict = unrotatedFreeTextSource(doc, sourceDict, lib);
  }
  const geometry = toPdfGeometry(annotation, page);
  const stroke = readColor(annotation.data.borderColor, annotation.type === 'shape-polygon' ? readColor('#3b82f6', DEFAULT_STROKE)
    : annotation.type === 'ink' ? { r: 0, g: 0, b: 0 }
      : annotation.type === 'line' || annotation.type === 'arrow' ? readColor('#111827', DEFAULT_STROKE) : DEFAULT_STROKE);
  const fill = readColor(annotation.data.backgroundColor, DEFAULT_FILL);
  const opacity =
    annotation.type === 'redaction' ? 1
      : typeof annotation.data.opacity === 'number'
        ? clamp(annotation.data.opacity, 0, 1)
        : annotation.type === 'highlight' ? 0.35 : 1;
  const borderWidth =
    typeof annotation.data.borderWidth === 'number'
      ? Math.max(0, annotation.data.borderWidth)
      : ['shape-polygon', 'ink', 'line', 'arrow'].includes(annotation.type) ? 2 : 1;

  const contents = annotationText(annotation);
  const author =
    annotation.data.review?.author
    ?? (typeof annotation.data.author === 'string' ? annotation.data.author : 'PDF Hub');
  const modifiedAt = annotation.data.review?.updatedAt ?? annotation.updatedAt;
  const createdAt = annotation.data.review?.createdAt ?? annotation.createdAt;

  const sourceRect = sourceDict ? readPdfNumberArray(sourceDict, 'Rect', lib) : null;
  const sourceRd = sourceDict ? readPdfNumberArray(sourceDict, 'RD', lib) : null;
  const sourceBody = annotation.type === 'callout' && sourceRect
    ? calloutBodyRect(sourceRect, sourceRd, readPdfNumberArray(sourceDict!, 'CL', lib))
    : annotation.type === 'stamp' && sourceDict
      ? readPdfNumberArray(sourceDict, 'PDFHubBaseRect', lib) ?? sourceRect
      : sourceRect;
  const rectMatchesSource = Boolean(sourceBody && numberArraysEquivalent(sourceBody, geometry.rect, 1e-4));
  const expanded = annotation.type === 'callout' && !rectMatchesSource
    ? enclosingCalloutRect(geometry.rect, calloutCoordinates(annotation, geometry) ?? null)
    : null;
  let appearanceRect: PdfRect = expanded?.rect ?? (rectMatchesSource && sourceRect
    ? sourceRect as PdfRect : geometry.rect);
  const preservedRect = (sourceDict && rectMatchesSource)
    ? sourceDict.get(lib.PDFName.of('Rect'))
    : appearanceRect;

  const base: PdfLiteralDict = {
    Type: 'Annot',
    Subtype: subtypeFor(annotation.type),
    Rect: preservedRect,
    P: page.ref,
    NM: lib.PDFString.of(annotation.data.nativeOriginalName ?? annotation.id),
    M: lib.PDFString.of(pdfDate(modifiedAt)),
    CreationDate: lib.PDFString.of(pdfDate(createdAt)),
    T: pdfText(lib, author),
    PDFHubVersion: 1,
    PDFHubType: lib.PDFString.of(annotation.type),
    PDFHubData: pdfText(lib, JSON.stringify(serializableAnnotationData(annotation))),
  };
  if (expanded) {
    base.RD = expanded.rd;
  } else if (sourceDict?.get(lib.PDFName.of('RD'))) {
    base.RD = sourceDict.get(lib.PDFName.of('RD'));
  }

  const flags = annotationFlagsValue(annotation, sourceDict, lib);
  if (flags !== undefined) {
    base.F = flags;
  }

  const isUserEdited =
    annotation.data.nativeInterop?.fidelityClass === 'MUTATED_USER_EDIT';

  const sourceContents =
    !isUserEdited && hasNativeRichText(sourceDict, lib)
      ? sourceDict?.get(lib.PDFName.of('Contents'))
      : undefined;
  if (sourceContents) {
    base.Contents = sourceContents;
  } else if (contents || annotation.type === 'textbox' || annotation.type === 'callout') {
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
    sourceModel,
  );

  const dict = doc.context.obj(base) as PDFDict;
  preservePassiveAnnotationEntries(
    sourceDict,
    dict,
    annotation.type === 'stamp' ? STAMP_ROOT_OWNED_KEYS
      : annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse' ? BOX_ROOT_OWNED_KEYS : ROOT_OWNED_KEYS,
    ROOT_APPEARANCE_KEYS,
    lib,
  );
  const boxType = annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse';
  const generatedBoxSource = Boolean(boxType && sourceDict && annotation.data.nativeBoxShapeGenerated);
  const boxStyleKeys = ['C', 'IC', 'CA', 'Border', 'BS'];
  const regenerateBox = Boolean(generatedBoxSource && sourceDict
    && !appearanceFieldsEquivalent(sourceDict, dict, boxStyleKeys, lib));
  if (generatedBoxSource && sourceDict) {
    const allowed = ['Rect', ...boxStyleKeys, 'Contents'];
    if (!appearanceFieldsEquivalent(sourceDict, dict, ROOT_APPEARANCE_KEYS.filter((key) => !allowed.includes(key)), lib)) {
      throw new Error('Cannot safely edit this shape: its native semantics also changed.');
    }
    if (regenerateBox) dict.delete(lib.PDFName.of('AP'));
  }
  const polygonTurns = annotation.type === 'shape-polygon' ? polygonPendingTurns(annotation) : 0;
  if (polygonTurns && sourceDict) {
    const rotated = rotatedPolygonAppearance(doc, sourceDict, dict, polygonTurns, lib);
    if (!rotated) throw new Error('Cannot safely rotate this polygon: its geometry or appearance also changed.');
    dict.set(lib.PDFName.of('AP'), rotated);
  }
  const inkTurns = annotation.type === 'ink' ? inkPendingTurns(annotation) : 0;
  if (inkTurns && sourceDict) {
    const rotated = rotatedInkAppearance(doc, sourceDict, dict, inkTurns, lib);
    if (!rotated) throw new Error('Cannot safely rotate this ink: its geometry or appearance also changed.');
    dict.set(lib.PDFName.of('AP'), rotated);
  }
  const lineTurns = annotation.type === 'line' || annotation.type === 'arrow' ? linePendingTurns(annotation) : 0;
  if (lineTurns && sourceDict) {
    const rotated = rotatedLineAppearance(doc, sourceDict, dict, lineTurns, lib);
    if (!rotated) throw new Error('Cannot safely rotate this line: its geometry or appearance also changed.');
    dict.set(lib.PDFName.of('AP'), rotated);
  }
  const boxTurns = annotation.type === 'shape-rect' || annotation.type === 'shape-ellipse' || annotation.type === 'shape-cloud' ? boxShapePendingTurns(annotation) : 0;
  if (boxTurns && sourceDict && !regenerateBox) {
    const rotated = annotation.type === 'shape-cloud' ? rotatedCloudAppearance(doc, sourceDict, dict, boxTurns, lib)
      : rotatedBoxShapeAppearance(doc, sourceDict, dict, boxTurns, lib, generatedBoxSource);
    if (!rotated) throw new Error('Cannot safely rotate this shape: its geometry or appearance also changed.');
    dict.set(lib.PDFName.of('AP'), rotated);
  }
  if (sourceDict && !dict.get(lib.PDFName.of('AP')) && isPureAppearanceRectTransform(sourceDict, dict, lib)) {
    const originalAppearance = sourceDict.get(lib.PDFName.of('AP'));
    if (originalAppearance) dict.set(lib.PDFName.of('AP'), originalAppearance);
  }
  if (markupOrMask(annotation.type) && sourceDict?.get(lib.PDFName.of('AP')) && !dict.get(lib.PDFName.of('AP'))) {
    // Contents is comment metadata for text markups and visual masks. Its
    // update alone must not replace arbitrary imported artwork. A simultaneous
    // ordinary move/resize can carry that same artwork without regeneration.
    if (appearanceFieldsEquivalent(sourceDict, dict, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Contents'), lib)
      || isPureAppearanceRectTransform(sourceDict, dict, lib, true)) {
      dict.set(lib.PDFName.of('AP'), sourceDict.get(lib.PDFName.of('AP'))!);
    } else {
      const editable = ['Contents', 'Rect', 'QuadPoints', 'C', 'CA', 'IC', 'Border', 'BS'];
      if (!trustedGeneratedMarkup
        || !appearanceFieldsEquivalent(sourceDict, dict, ROOT_APPEARANCE_KEYS.filter((key) => !editable.includes(key)), lib)) {
        throw new Error('Cannot safely replace this imported markup appearance after changing its geometry or style.');
      }
    }
  }
  if (generatedBoxSource && sourceDict && !regenerateBox && !boxTurns && !dict.get(lib.PDFName.of('AP'))) {
    // Verified app-created box artwork does not depend on /Contents. Keep it
    // even when external style metadata and the visible AP disagree; only an
    // explicit appearance edit may regenerate the form.
    const appearance = sourceDict.get(lib.PDFName.of('AP'));
    if (appearance) dict.set(lib.PDFName.of('AP'), appearance);
  }
  if ((boxType || annotation.type === 'shape-cloud') && sourceDict && !generatedBoxSource && !boxTurns && !dict.get(lib.PDFName.of('AP'))
    && appearanceFieldsEquivalent(sourceDict, dict, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Contents'), lib)) {
    // /Contents on a square or circle is comment metadata. An imported AP may
    // contain arbitrary artwork, so preserve it verbatim: editing the comment
    // must neither regenerate that artwork nor claim to edit any text in it.
    const appearance = sourceDict.get(lib.PDFName.of('AP'));
    if (appearance) dict.set(lib.PDFName.of('AP'), appearance);
  }
  if (annotation.type === 'stamp' && sourceDict && !dict.get(lib.PDFName.of('AP'))
    && appearanceFieldsEquivalent(sourceDict, dict, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect'), lib)) {
    const originalAppearance = sourceDict.get(lib.PDFName.of('AP'));
    if (originalAppearance) dict.set(lib.PDFName.of('AP'), originalAppearance);
  }
  if ((annotation.type === 'comment' || annotation.type === 'sticky-note')
    && sourceDict?.get(lib.PDFName.of('AP')) && !dict.get(lib.PDFName.of('AP'))) {
    const unchangedIcon = appearanceFieldsEquivalent(sourceDict, dict,
      ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect' && key !== 'Open' && key !== 'Contents'), lib);
    if (!unchangedIcon) {
      throw new Error('Cannot safely replace this imported note appearance after changing its style or native semantics.');
    }
    if (!pdfObjectsEquivalent(sourceDict.get(lib.PDFName.of('Contents')), dict.get(lib.PDFName.of('Contents')), lib)) {
      // Arbitrary PDF appearance streams may depict the old message using
      // glyph outlines or image-like vector shapes, even without text operators.
      // No provenance currently proves this imported artwork is textless.
      throw new Error('Cannot safely edit this note: its imported appearance may depict the original comment.');
    }
    dict.set(lib.PDFName.of('AP'), sourceDict.get(lib.PDFName.of('AP'))!);
  }
  if (annotation.type === 'stamp' && sourceDict?.get(lib.PDFName.of('AP'))
    && !dict.get(lib.PDFName.of('AP')) && annotation.data.nativeStampAppearanceKind !== 'generated') {
    throw new Error('Cannot safely replace an imported custom stamp appearance after changing its contents or style.');
  }
  if (sourceDict?.get(lib.PDFName.of('AP')) && !dict.get(lib.PDFName.of('AP'))
    && !regenerateBox && ['shape-rect', 'shape-ellipse', 'shape-polygon', 'shape-cloud', 'line', 'arrow', 'ink'].includes(annotation.type)) {
    throw new Error('Cannot safely replace this imported annotation appearance after changing its geometry or style.');
  }
  if (isUserEdited && sourceDict && hasNativeRichText(sourceDict, lib)) {
    const originalRichText = readTextObject(sourceDict, 'RC', lib);
    const originalContents = readTextObject(sourceDict, 'Contents', lib);
    if (originalRichText === null || originalContents === null) {
      throw new Error('Cannot safely edit native rich text: the original text is unavailable.');
    }
    const updatedRichText = editNativeRichText(originalRichText, originalContents, contents);
    dict.set(lib.PDFName.of('RC'), pdfText(lib, updatedRichText));
  }
  if ((annotation.type === 'textbox' || annotation.type === 'callout')
    && !dict.get(lib.PDFName.of('AP'))
    && (!sourceDict
      || Boolean(sourceDict.get(lib.PDFName.of('AP')))
      || Boolean(annotation.data.rotation)
      || !appearanceFieldsEquivalent(sourceDict, dict, ROOT_APPEARANCE_KEYS, lib))) {
    const sourceHasAppearance = Boolean(sourceDict?.get(lib.PDFName.of('AP')));
    const onlyTextChanged = sourceDict && sourceHasAppearance
      && appearanceFieldsEquivalent(sourceDict, dict, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Contents'), lib);
    if (sourceHasAppearance && !onlyTextChanged && hasNativeRichText(sourceDict, lib)) {
      throw new Error('Cannot safely edit native appearance: its geometry or style changed together with the rich text.');
    }
    if (annotation.type === 'callout') {
      const leader = readPdfNumberArray(dict, 'CL', lib);
      if (leader && leader.some((value, index) => index % 2 === 0
        ? value < appearanceRect[0] || value > appearanceRect[2]
        : value < appearanceRect[1] || value > appearanceRect[3])) {
        const normalized = enclosingCalloutRect(geometry.rect, leader);
        appearanceRect = normalized.rect;
        dict.set(lib.PDFName.of('Rect'), doc.context.obj(normalized.rect));
        dict.set(lib.PDFName.of('RD'), doc.context.obj(normalized.rd));
      }
    }
    await attachNativeFreeTextAppearance(doc, dict, annotation, appearanceRect, stroke, fill, opacity, borderWidth, lib, onlyTextChanged ? sourceDict! : undefined);
  }
  if (markupOrMask(annotation.type)) {
    const nativeQuads = annotation.type === 'redaction'
      ? []
      : readPdfNumberArray(dict, 'QuadPoints', lib) ?? [];
    const hasSourceAppearance = Boolean(sourceDict?.get(lib.PDFName.of('AP')));
    const importedNoApSource = Boolean(sourceDict && !hasSourceAppearance);
    if (importedNoApSource) {
      // Source point order does not prove text direction: even a convex paired
      // quadrilateral may start at the bottom edge. Also preserve viewer
      // authority for an existing visual mask with no appearance.
      if (!appearanceFieldsEquivalent(sourceDict!, dict, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Contents'), lib)
        && !isPureAppearanceRectTransform(sourceDict!, dict, lib, true, true)) {
        throw new Error('Cannot safely change imported markup without a native appearance.');
      }
    } else {
      if (!dict.get(lib.PDFName.of('AP')) && annotation.type !== 'redaction'
        && !supportsMarkupAppearanceQuads(nativeQuads)) {
        throw new Error('Cannot safely generate markup appearance with unsupported quadrilateral ordering.');
      }
      attachNativeMarkupAppearance(
        doc, dict, annotation, geometry.rect, nativeQuads,
        annotation.type === 'highlight' ? fill : stroke, opacity, borderWidth, lib,
      );
      // Never bless an imported AP as app-generated. Only seal a form that was
      // just constructed by this writer or was verified against the actual PDF.
      if ((!hasSourceAppearance || trustedGeneratedMarkup)
        && !await sealGeneratedMarkupAppearance(doc, dict, lib)) {
        throw new Error('Cannot safely preserve editable markup appearance provenance.');
      }
    }
  }
  if (annotation.type === 'shape-polygon' && !sourceDict && !dict.get(lib.PDFName.of('AP'))) {
    attachCreatedPolygonAppearance(doc, dict, annotation, lib);
  }
  if (boxType && (!sourceDict || regenerateBox) && !dict.get(lib.PDFName.of('AP'))) {
    const orientation = ((annotation.data.nativeBoxShapeGeneratedOrientation ?? 0) + boxTurns) % 4;
    attachCreatedBoxShapeAppearance(doc, dict, annotation, lib, orientation);
  }
  if (annotation.type === 'ink' && !sourceDict && !dict.get(lib.PDFName.of('AP'))) {
    attachCreatedInkAppearance(doc, dict, annotation, lib);
  }
  if ((annotation.type === 'line' || annotation.type === 'arrow') && !sourceDict && !dict.get(lib.PDFName.of('AP'))) {
    attachCreatedLineAppearance(doc, dict, annotation, lib);
  }
  if (annotation.type === 'stamp') {
    const viewerStamp = sourceDict && !sourceDict.get(lib.PDFName.of('AP'));
    if (viewerStamp && sourceDict && !appearanceFieldsEquivalent(sourceDict, dict, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect'), lib)) {
      throw new Error('Cannot safely edit this imported stamp without a native appearance.');
    }
    if (!viewerStamp) await attachNativeStampAppearance(
      doc,
      dict,
      annotation,
      geometry,
      stroke,
      fill,
      readColor(annotation.data.textColor, stroke),
      opacity,
      lib,
    );
    applyNativeStampRotation(doc, dict, sourceDict, annotation, geometry.rect, lib);
  }
  if (annotation.type === 'textbox' || annotation.type === 'callout') {
    applyNativeFreeTextRotation(doc, dict, annotation, geometry.rect, lib);
  }
  const ref = doc.context.register(dict);
  relinkPopupParent(originalSource, ref, lib);
  return ref;
}

function isPureAppearanceRectTransform(source: PDFDict, target: PDFDict, lib: PdfLibModule, ignoreContents = false, translationWithoutAppearance = false): boolean {
  if (!source.get(lib.PDFName.of('AP')) && !translationWithoutAppearance) return false;
  const before = readPdfNumberArray(source, 'Rect', lib);
  const after = readPdfNumberArray(target, 'Rect', lib);
  if (!before || !after || before.length !== 4 || after.length !== 4) return false;
  const width = before[2] - before[0]; const height = before[3] - before[1];
  if (width <= 0 || height <= 0) return false;
  const sx = (after[2] - after[0]) / width; const sy = (after[3] - after[1]) / height;
  if (sx <= 0 || sy <= 0) return false;
  if (translationWithoutAppearance && (!nearlyEqual(sx, 1, 1e-4) || !nearlyEqual(sy, 1, 1e-4))) return false;
  if ((!nearlyEqual(sx, 1, 1e-4) || !nearlyEqual(sy, 1, 1e-4)) && source.get(lib.PDFName.of('RD'))) return false;
  const transform = (values: number[]) => values.map((value, index) => index % 2
    ? after[1] + (value - before[1]) * sy : after[0] + (value - before[0]) * sx);
  const coordinates = ['CL', 'L', 'Vertices', 'QuadPoints'];
  if (!appearanceFieldsEquivalent(source, target, ROOT_APPEARANCE_KEYS.filter((key) => key !== 'Rect' && key !== 'InkList'
    && (!ignoreContents || key !== 'Contents') && !coordinates.includes(key)), lib)) return false;
  for (const key of coordinates) {
    const oldValue = readPdfNumberArray(source, key, lib);
    const newValue = readPdfNumberArray(target, key, lib);
    if (!oldValue && !newValue) continue;
    if (!oldValue || !newValue || !oldValue.length || oldValue.length % 2
      || !numberArraysEquivalent(transform(oldValue), newValue, 1e-4)) return false;
  }
  const oldInk = source.lookupMaybe(lib.PDFName.of('InkList'), lib.PDFArray);
  const newInk = target.lookupMaybe(lib.PDFName.of('InkList'), lib.PDFArray);
  if (!oldInk && !newInk) return true;
  if (!oldInk || !newInk || oldInk.size() !== newInk.size()) return false;
  for (let index = 0; index < oldInk.size(); index += 1) {
    const oldPath = oldInk.lookupMaybe(index, lib.PDFArray);
    const newPath = newInk.lookupMaybe(index, lib.PDFArray);
    if (!oldPath || !newPath) return false;
    const oldValues = readPdfArrayValues(oldPath, lib);
    const newValues = readPdfArrayValues(newPath, lib);
    if (!oldValues.length || oldValues.length % 2
      || !numberArraysEquivalent(transform(oldValues), newValues, 1e-4)) return false;
  }
  return true;
}

function addSubtypeFields(
  target: PdfLiteralDict,
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
  stroke: PdfColor,
  fill: PdfColor,
  opacity: number,
  borderWidth: number,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
  sourceModel?: PdfAnnotation,
): void {
  const colorField = (key: 'C' | 'IC', requested: unknown, fallback: PdfColor): void => {
    const source = sourceDict?.get(lib.PDFName.of(key));
    if (sourceDict && requested === undefined) {
      if (source) target[key] = source;
      return;
    }
    const original = sourceDict ? readPdfNumberArray(sourceDict, key, lib) : null;
    const hex = original && original.length >= 3
      ? `#${original.slice(0, 3).map((value) => Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0')).join('')}`
      : null;
    target[key] = source && typeof requested === 'string' && requested.toLowerCase() === hex
      ? source : colorArray(fallback);
  };
  const opacityField = (): void => {
    if (!sourceDict || annotation.data.opacity !== undefined || sourceDict.get(lib.PDFName.of('CA'))) target.CA = opacity;
  };
  switch (annotation.type) {
    case 'comment':
    case 'sticky-note': {
      if (!sourceDict) {
        target.Name = textAnnotationNameValue(null, lib);
        target.Open = annotation.data.isCollapsed === false;
        target.C = colorArray(fill);
        return;
      }
      if (!sourceModel) throw new Error('Cannot safely preserve this imported note without its native source model.');
      const name = sourceDict.get(lib.PDFName.of('Name'));
      if (name) target.Name = name;
      const originalOpen = sourceDict.get(lib.PDFName.of('Open'));
      if (annotation.data.isCollapsed === sourceModel.data.isCollapsed) {
        if (originalOpen) target.Open = originalOpen;
      } else if (annotation.data.isCollapsed !== undefined) {
        target.Open = annotation.data.isCollapsed === false;
      }
      const originalColor = sourceDict.get(lib.PDFName.of('C'));
      if (annotation.data.backgroundColor === sourceModel.data.backgroundColor) {
        if (originalColor) target.C = originalColor;
      } else {
        target.C = colorArray(fill);
      }
      return;
    }

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
      if (sourceDict && sourceModel && (annotation.type === 'highlight'
        ? annotation.data.backgroundColor === sourceModel.data.backgroundColor
        : annotation.data.borderColor === sourceModel.data.borderColor)) {
        const original = sourceDict.get(lib.PDFName.of('C'));
        if (original) target.C = original;
      } else target.C = colorArray(annotation.type === 'highlight' ? fill : stroke);
      if (sourceDict && sourceModel && annotation.data.opacity === sourceModel.data.opacity) {
        const original = sourceDict.get(lib.PDFName.of('CA'));
        if (original) target.CA = original;
      } else target.CA = opacity;
      return;

    case 'textbox':
    case 'callout': {
      const fontSize =
        typeof annotation.data.fontSize === 'number'
          ? clamp(annotation.data.fontSize, 6, 144)
          : 12;
      const da = defaultAppearanceValue(
        annotation,
        fontSize,
        sourceDict,
        lib,
      );
      if (da !== undefined) {
        target.DA = da;
      }
      const alignment = freeTextAlignmentValue(
        annotation,
        sourceDict,
        lib,
      );
      if (alignment !== undefined) {
        target.Q = alignment;
      }
      if (sourceDict) {
        const sourceC = sourceDict.get(lib.PDFName.of('C'));
        if (annotation.data.borderColor) {
          colorField('C', annotation.data.borderColor, stroke);
        } else if (sourceC) {
          target.C = sourceC;
        }
        const sourceIc = sourceDict.get(lib.PDFName.of('IC'));
        if (annotation.data.backgroundColor) {
          target.IC = colorArray(fill);
        } else if (sourceIc) {
          target.IC = sourceIc;
        }
      } else {
        target.C = colorArray(stroke);
        if (annotation.data.backgroundColor) {
          target.IC = colorArray(fill);
        }
      }
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      opacityField();

      if (annotation.type === 'callout') {
        target.IT = 'FreeTextCallout';
        const sourceCl = sourceDict?.get(lib.PDFName.of('CL'));
        const sourceRect = sourceDict?.get(lib.PDFName.of('Rect'));
        const rectMatches = pdfObjectsEquivalent(sourceRect, target.Rect, lib);
        if (sourceCl && rectMatches) {
          target.CL = sourceCl;
        } else {
          const calloutLine = calloutCoordinates(annotation, geometry);
          if (calloutLine) target.CL = calloutLine;
        }
        const sourceLe = sourceDict?.get(lib.PDFName.of('LE'));
        if (sourceLe) {
          target.LE = sourceLe;
        } else if (!sourceDict) {
          target.LE = lib.PDFName.of('OpenArrow');
        }
      } else {
        const sourceIntent = sourceDict?.get(lib.PDFName.of('IT'));
        if (sourceIntent) target.IT = sourceIntent;
      }
      return;
    }

    case 'shape-rect':
    case 'shape-cloud':
    case 'redaction':
      colorField('C', annotation.data.borderColor, annotation.type === 'redaction' ? { r: 0, g: 0, b: 0 } : stroke);
      if (annotation.type !== 'shape-rect' || (annotation.data.backgroundColor !== 'transparent'
        && (sourceDict || annotation.data.backgroundColor !== undefined))) {
        colorField('IC', annotation.data.backgroundColor, annotation.type === 'redaction' ? { r: 0, g: 0, b: 0 } : fill);
      }
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      opacityField();
      if (annotation.type === 'shape-cloud') {
        target.BE = cloudBorderEffectValue(sourceDict, lib);
      }
      return;

    case 'shape-ellipse':
      colorField('C', annotation.data.borderColor, stroke);
      if (annotation.data.backgroundColor !== 'transparent' && (sourceDict || annotation.data.backgroundColor !== undefined)) {
        colorField('IC', annotation.data.backgroundColor, fill);
      }
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      opacityField();
      return;

    case 'shape-polygon':
      target.Vertices = polygonVertices(annotation, geometry);
      colorField('C', annotation.data.borderColor, stroke);
      if (annotation.data.backgroundColor !== 'transparent'
        && (sourceDict || annotation.data.backgroundColor !== undefined)) {
        colorField('IC', annotation.data.backgroundColor, fill);
      }
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      opacityField();
      return;

    case 'line':
    case 'arrow': {
      target.L = lineCoordinates(annotation, geometry, sourceDict, lib);
      if (sourceDict?.get(lib.PDFName.of('IC'))) target.IC = sourceDict.get(lib.PDFName.of('IC'))!;
      if (sourceDict?.get(lib.PDFName.of('IT'))) target.IT = sourceDict.get(lib.PDFName.of('IT'))!;
      const endings = lineEndingsValue(
        annotation,
        sourceDict,
        lib,
      );
      if (endings !== undefined) {
        target.LE = endings;
      }
      colorField('C', annotation.data.borderColor, stroke);
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      if (sourceDict?.get(lib.PDFName.of('CA')) !== undefined || annotation.data.opacity !== undefined) {
        target.CA = opacity;
      }
      return;
    }

    case 'ink':
      target.InkList = inkLists(annotation, geometry);
      colorField('C', annotation.data.borderColor, stroke);
      applyAnnotationBorderFields(
        target,
        annotation,
        borderWidth,
        sourceDict,
        lib,
      );
      opacityField();
      return;

    case 'stamp': {
      const name = stampNameValue(annotation, sourceDict, lib);
      if (name !== undefined) target.Name = name;
      if (sourceDict) {
        const sourceC = sourceDict.get(lib.PDFName.of('C'));
        if (annotation.data.borderColor) {
          target.C = colorArray(stroke);
        } else if (sourceC) {
          target.C = sourceC;
        }
        const sourceCa = sourceDict.get(lib.PDFName.of('CA'));
        if (typeof annotation.data.opacity === 'number') {
          target.CA = opacity;
        } else if (sourceCa) {
          target.CA = sourceCa;
        }
      } else {
        if (annotation.data.borderColor || annotation.data.color) {
          target.C = colorArray(stroke);
        }
        if (typeof annotation.data.opacity === 'number') {
          target.CA = opacity;
        }
      }
      return;
    }
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
  const space = createMarkupSpace(page.getCropBox(), page.getRotation().angle);
  const rect = viewRectToPdfRect(annotation.rect, space);
  return {
    x: rect[0], y: rect[1], width: rect[2] - rect[0],
    height: rect[3] - rect[1], pageHeight, rect, space,
  };
}

function annotationPointToPdf(x: number, y: number, geometry: AnnotationGeometry): Point2D {
  return geometry.space ? viewPointToPdf(x, y, geometry.space) : { x, y: geometry.pageHeight - y };
}

function textMarkupQuadPoints(
  annotation: PdfAnnotation,
  geometry: AnnotationGeometry,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): PdfLiteral {
  const normalized = readFiniteNumberArray(annotation.data.textMarkupQuads);
  const validNormalized = Boolean(
    normalized && normalized.length >= 8 && normalized.length % 8 === 0,
  );
  const sourceQuadObject = sourceDict?.get(lib.PDFName.of('QuadPoints'));
  const sourceQuadArray = sourceDict
    ? sourceDict.lookupMaybe(lib.PDFName.of('QuadPoints'), lib.PDFArray)
    : undefined;
  const sourceRect = sourceDict
    ? readPdfNumberArray(sourceDict, 'Rect', lib)
    : null;

  if (validNormalized && sourceQuadObject && sourceQuadArray && sourceRect
    && numberArraysEquivalent(sourceRect, geometry.rect)) {
    const sourceValues = readPdfArrayValues(sourceQuadArray, lib);
    const sourceNormalized = normalizePdfQuadPoints(sourceValues, geometry, annotation.rect);
    if (sourceNormalized && numberArraysEquivalent(sourceNormalized, normalized!)) {
      return sourceQuadObject;
    }
  }

  const transform = (x: number, y: number) => geometry.space
    ? viewPointToPdf(x, y, geometry.space)
    : { x, y: geometry.pageHeight - y };

  if (validNormalized) {
    const values: number[] = [];
    for (let index = 0; index + 1 < normalized!.length; index += 2) {
      const appX = annotation.rect.x + normalized![index] * annotation.rect.width;
      const appY = annotation.rect.y + normalized![index + 1] * annotation.rect.height;
      const native = transform(appX, appY);
      values.push(native.x, native.y);
    }
    return values;
  }
  const { x, y, width, height } = annotation.rect;
  // Native /QuadPoints follow the text direction: TL TR BL BR in displayed
  // coordinates. These remain ordered even for /Rotate 90/180/270.
  const corners = [
    transform(x, y), transform(x + width, y),
    transform(x, y + height), transform(x + width, y + height),
  ];
  return corners.flatMap((point) => [point.x, point.y]);
}

function normalizePdfQuadPoints(
  values: number[],
  geometry: AnnotationGeometry,
  rect: PdfAnnotation['rect'],
): number[] | null {
  if (values.length < 8 || values.length % 8 !== 0
    || rect.width <= 0 || rect.height <= 0) return null;
  const normalized: number[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    const app = geometry.space
      ? pdfPointToView(values[index], values[index + 1], geometry.space)
      : { x: values[index], y: geometry.pageHeight - values[index + 1] };
    const nx = (app.x - rect.x) / rect.width;
    const ny = (app.y - rect.y) / rect.height;
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
): PdfLiteral | undefined {
  const sourceObject = sourceDict?.get(lib.PDFName.of('DA'));
  const sourceText = sourceDict
    ? readTextObject(sourceDict, 'DA', lib)
    : null;
  const desiredColor = readColor(annotation.data.textColor, { r: 0, g: 0, b: 0 });
  const hasExplicitTextColor =
    typeof annotation.data.textColor === 'string'
    && annotation.data.textColor !== 'transparent';

  if (sourceDict && !sourceObject && !hasExplicitTextColor && annotation.data.fontSize === undefined) {
    return undefined;
  }

  if (
    sourceObject
    && sourceText
    && hasNativeRichText(sourceDict, lib)
    && annotation.data.nativeInterop?.fidelityClass !== 'MUTATED_USER_EDIT'
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
      const point = annotationPointToPdf(px, py, geometry);
      result.push(point.x, point.y);
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
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): PdfLiteral {
  const points =
    Array.isArray(annotation.data.points) && annotation.data.points.length >= 4
      ? annotation.data.points
      : [0, annotation.rect.height / 2, annotation.rect.width, annotation.rect.height / 2];
  const first = annotationPointToPdf(annotation.rect.x + finite(points[0], 0), annotation.rect.y + finite(points[1], annotation.rect.height / 2), geometry);
  const second = annotationPointToPdf(annotation.rect.x + finite(points[2], annotation.rect.width), annotation.rect.y + finite(points[3], annotation.rect.height / 2), geometry);
  const coordinates = [first.x, first.y, second.x, second.y];
  const sourceObject = sourceDict?.get(lib.PDFName.of('L'));
  const sourceLine = sourceDict ? readPdfNumberArray(sourceDict, 'L', lib) : null;
  return sourceObject && sourceLine && numberArraysEquivalent(sourceLine, coordinates, 1e-4) ? sourceObject : coordinates;
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
      const point = annotationPointToPdf(finite(path[index], 0), finite(path[index + 1], 0), geometry);
      converted.push(point.x, point.y);
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

  const first = annotationPointToPdf(anchor.x, anchor.y, geometry);
  const coordinates = [first.x, first.y];

  if (knee) {
    const point = annotationPointToPdf(knee.x, knee.y, geometry);
    coordinates.push(point.x, point.y);
  }

  const last = annotationPointToPdf(end.x, end.y, geometry);
  coordinates.push(last.x, last.y);
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
  if (typeof annotation.data.text === 'string') {
    return annotation.data.text;
  }
  if (typeof annotation.data.content === 'string') {
    return annotation.data.content;
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
): number | undefined {
  const sourceF = sourceDict?.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber);
  if (sourceDict && !sourceF && typeof annotation.data.locked !== 'boolean') {
    return undefined;
  }
  const sourceFlags = sourceF?.asNumber() ?? 4;
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
): PdfLiteral {
  return sourceDict?.get(lib.PDFName.of('Name')) ?? 'Comment';
}

function applyAnnotationBorderFields(
  target: PdfLiteralDict,
  annotation: PdfAnnotation,
  fallbackWidth: number,
  sourceDict: PDFDict | null,
  lib: PdfLibModule,
): void {
  const borderValue = annotationBorderValue(
    annotation,
    fallbackWidth,
    sourceDict,
    lib,
  );
  if (borderValue !== null) {
    target.Border = borderValue;
  }
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
): PdfLiteral | null {
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

  if (sourceDict && !sourceObject) {
    const original = readBorderSemantics(sourceDict, lib, true);
    const widthUnchanged = annotation.data.borderWidth === undefined
      || Boolean(original && nearlyEqual(original.width, desiredWidth));
    const styleUnchanged = annotation.data.borderStyle === undefined
      || Boolean(original && (original.style ?? 'solid') === desiredStyle);
    if (widthUnchanged && styleUnchanged) return null;
  }

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
): PdfLiteral {
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
): PdfLiteral {
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
): PdfLiteral | undefined {
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

  if (
    !sourceObject
    && desiredStart === undefined
    && desiredEnd === undefined
    && annotation.type !== 'arrow'
  ) {
    return undefined;
  }

  return [
    lineEnding(desiredStart, 'None', sourceDict ? 'OpenArrow' : 'ClosedArrow'),
    lineEnding(
      desiredEnd,
      annotation.type === 'arrow' ? (sourceDict ? 'OpenArrow' : 'ClosedArrow') : 'None',
      sourceDict ? 'OpenArrow' : 'ClosedArrow',
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
): PdfLiteral | undefined {
  const sourceObject = sourceDict?.get(lib.PDFName.of('Name'));
  if (sourceDict && !sourceObject && !annotation.data.stampStyle) return undefined;
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
): PdfLiteral | undefined {
  if (
    hasNativeRichText(sourceDict, lib)
    && annotation.data.nativeInterop?.fidelityClass !== 'MUTATED_USER_EDIT'
  ) {
    const sourceQ = sourceDict?.get(lib.PDFName.of('Q'));
    if (sourceQ) return sourceQ;
  }
  if (annotation.data.textAlign !== undefined) {
    return textAlignment(annotation.data.textAlign);
  }
  const sourceQ = sourceDict?.get(lib.PDFName.of('Q'));
  if (sourceQ) return sourceQ;
  return sourceDict ? undefined : 0;
}

function textAlignment(value: unknown): number {
  if (value === 'center') return 1;
  if (value === 'right') return 2;
  return 0;
}

function lineEnding(value: unknown, fallback: string, arrowName = 'OpenArrow'): string {
  switch (value) {
    case 'arrow':
      return arrowName;
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
  if (annotation.type === 'stamp' && !data.nativeStampAppearanceKind && !data.hasCustomAppearance) {
    data.nativeStampAppearanceKind = 'generated';
  }

  if (data.review) {
    data.review = {
      ...data.review,
      replies: [],
    };
  }

  // Large binary payloads should remain in dedicated asset storage rather than
  // being copied into a custom PDF string.
  delete data.stampImageDataUrl;
  delete data.nativeSourceRef;
  delete data.nativeDeletedReplyIds;
  // A saved copy has its own native object graph. Its former source location
  // is session-only and must not redirect a reopened copy to the old page.
  delete data.nativeCopySource;
  delete data.nativeAppearanceRef;
  delete data.nativeAppearanceRotation;
  delete data.nativeAppearancePageRotation;
  delete data.nativeStampRotationReadOnly;
  delete data.nativeStampCopySourceBasisRotation;
  delete data.nativeBoxShapeImported;
  delete data.nativeBoxShapeHasAppearance;
  delete data.nativeBoxShapeSourceHash;
  delete data.nativeBoxShapeTurn;
  delete data.nativeBoxShapeGenerated;
  delete data.nativeBoxShapeGeneratedOrientation;
  delete (data as typeof data & { nativePolygonQuarterTurns?: number }).nativePolygonQuarterTurns;
  delete (data as typeof data & { nativeInkQuarterTurns?: number }).nativeInkQuarterTurns;
  delete (data as typeof data & { nativeLineQuarterTurns?: number }).nativeLineQuarterTurns;

  return data;
}

function pdfText(lib: PdfLibModule, value: string) {
  return lib.PDFHexString.fromText(value);
}
