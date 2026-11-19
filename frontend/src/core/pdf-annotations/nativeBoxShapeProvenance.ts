import type { PDFDict, PDFDocument } from 'pdf-lib';
import { fingerprintStampAppearance, type StampFingerprintLimits } from './nativeStampProvenance';

type Lib = typeof import('pdf-lib');

/** Integrity marker, not authentication: a PDF writer can recompute it. */
export const BOX_GENERATED_AP_FINGERPRINT_KEY = 'PDFHubGeneratedBoxAPFingerprint';
export const BOX_GENERATED_AP_ORIENTATION_KEY = 'PDFHubGeneratedBoxOrientation';
const STAMP_VERSION = 'pdfhub-stamp-ap-v1:';
const BOX_VERSION = 'pdfhub-generated-box-ap-v1:';

/**
 * Fingerprint only the actual normal Form graph, its shape subtype, and the
 * immutable generated-appearance orientation. Mutable native style, contents,
 * rectangle and PDFHubData are deliberately excluded: external changes to
 * those fields alone must not make an untouched generated appearance unknown.
 *
 * The existing bounded canonicalizer validates the entire reachable AP graph,
 * including decoded stream content, Matrix/BBox and recursive resources. A
 * synthetic root supplies a constant Rect so its stamp-oriented root validation
 * can be reused without binding the source annotation's mutable geometry.
 */
export async function fingerprintGeneratedBoxAppearance(
  doc: PDFDocument,
  shape: PDFDict,
  lib: Lib,
  overrides: StampFingerprintLimits = {},
): Promise<string | null> {
  try {
    const subtype = shape.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName);
    if (!subtype || !['Square', 'Circle'].includes(subtype.decodeText())) return null;
    // These fields can carry semantics beyond a plain generated box. Never
    // classify such an annotation as safely regenerable on style change.
    if (['RD', 'BE', 'IT', 'Measure', 'Vertices', 'InkList', 'L', 'CL', 'QuadPoints', 'Rotate', 'PDFHubBaseAP']
      .some((key) => shape.get(lib.PDFName.of(key)))) return null;
    const flags = shape.lookupMaybe(lib.PDFName.of('F'), lib.PDFNumber)?.asNumber() ?? 0;
    if (!Number.isFinite(flags) || (Math.trunc(flags) & 16) !== 0) return null;
    const orientation = shape.lookupMaybe(lib.PDFName.of(BOX_GENERATED_AP_ORIENTATION_KEY), lib.PDFNumber)?.asNumber();
    if (orientation === undefined || !Number.isInteger(orientation) || orientation < 0 || orientation > 3) return null;
    const appearance = shape.get(lib.PDFName.of('AP'));
    if (!appearance) return null;
    const root = doc.context.obj({}) as PDFDict;
    root.set(lib.PDFName.of('Subtype'), subtype);
    root.set(lib.PDFName.of('Rect'), doc.context.obj([0, 0, 1, 1]));
    root.set(lib.PDFName.of('AP'), appearance);
    root.set(lib.PDFName.of('PDFHubData'), lib.PDFString.of(`generated-box-v1:${orientation}`));
    const digest = await fingerprintStampAppearance(doc, root, lib, overrides);
    return digest?.startsWith(STAMP_VERSION) ? BOX_VERSION + digest.slice(STAMP_VERSION.length) : null;
  } catch {
    return null;
  }
}

/** A missing, stale or unsupported marker must be treated as imported artwork. */
export async function verifyGeneratedBoxAppearanceFingerprint(doc: PDFDocument, shape: PDFDict, lib: Lib): Promise<boolean> {
  try {
    const stored = shape.lookupMaybe(lib.PDFName.of(BOX_GENERATED_AP_FINGERPRINT_KEY), lib.PDFString, lib.PDFHexString)?.decodeText();
    if (!stored || !/^pdfhub-generated-box-ap-v1:[0-9a-f]{64}$/.test(stored)) return false;
    return stored === await fingerprintGeneratedBoxAppearance(doc, shape, lib);
  } catch {
    return false;
  }
}

/** Seal only after app-owned appearance and orientation are fully constructed. */
export async function sealGeneratedBoxAppearanceFingerprint(
  doc: PDFDocument,
  shape: PDFDict,
  orientation: number,
  lib: Lib,
): Promise<boolean> {
  if (!Number.isInteger(orientation) || orientation < 0 || orientation > 3) {
    shape.delete(lib.PDFName.of(BOX_GENERATED_AP_FINGERPRINT_KEY));
    shape.delete(lib.PDFName.of(BOX_GENERATED_AP_ORIENTATION_KEY));
    return false;
  }
  shape.set(lib.PDFName.of(BOX_GENERATED_AP_ORIENTATION_KEY), lib.PDFNumber.of(orientation));
  const digest = await fingerprintGeneratedBoxAppearance(doc, shape, lib);
  if (!digest) {
    shape.delete(lib.PDFName.of(BOX_GENERATED_AP_FINGERPRINT_KEY));
    shape.delete(lib.PDFName.of(BOX_GENERATED_AP_ORIENTATION_KEY));
    return false;
  }
  shape.set(lib.PDFName.of(BOX_GENERATED_AP_FINGERPRINT_KEY), lib.PDFString.of(digest));
  return true;
}
