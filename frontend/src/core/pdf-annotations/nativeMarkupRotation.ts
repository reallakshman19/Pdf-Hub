import { fingerprintStampAppearance } from './nativeStampProvenance';

type Lib = typeof import('pdf-lib');
type PDFDict = import('pdf-lib').PDFDict;
type PDFDocument = import('pdf-lib').PDFDocument;

const OFFSET = 'PDFHubMarkupPreviewOffset';
const FINGERPRINT = 'PDFHubMarkupPreviewFingerprint';

/** Source-bound capability, not authentication; unknown PDF semantics fail closed. */
async function calculateFingerprint(doc: PDFDocument, source: PDFDict, lib: Lib): Promise<string | null> {
  try {
    const key = lib.PDFName.of;
    const subtype = source.lookupMaybe(key('Subtype'), lib.PDFName)?.decodeText();
    if (!subtype || !['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Square'].includes(subtype)) return null;
    if (subtype === 'Square') {
      const type = source.lookupMaybe(key('PDFHubType'), lib.PDFString, lib.PDFHexString)?.decodeText();
      if (type !== 'redaction' || source.get(key('QuadPoints'))) return null;
    }
    if (['IT', 'Measure', 'Vertices', 'InkList', 'L', 'CL', 'RD', 'BE', 'Rotate', 'PDFHubBaseAP', 'MK', 'AS', 'OC']
      .some((name) => source.get(key(name)))) return null;
    const flags = source.get(key('F')) ? source.lookup(key('F'), lib.PDFNumber).asNumber() : 0;
    if (!Number.isInteger(flags) || (flags & 24)) return null; // NoZoom or NoRotate needs distinct viewer semantics.
    const offset = source.get(key(OFFSET)) ? source.lookup(key(OFFSET), lib.PDFNumber).asNumber() : 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > 3) return null;
    const rect = source.lookup(key('Rect'), lib.PDFArray);
    if (rect.size() !== 4) return null;
    const bounds = Array.from({ length: 4 }, (_, index) => rect.lookup(index, lib.PDFNumber).asNumber());
    if (!bounds.every(Number.isFinite) || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) return null;
    const quads = subtype === 'Square' ? [] : source.lookup(key('QuadPoints'), lib.PDFArray);
    const points = Array.isArray(quads) ? [] : Array.from({ length: quads.size() }, (_, index) => quads.lookup(index, lib.PDFNumber).asNumber());
    if (subtype !== 'Square' && (points.length < 8 || points.length > 2048 || points.length % 8 || !points.every(Number.isFinite))) return null;
    const synthetic = doc.context.obj({}) as PDFDict;
    for (const name of ['Subtype', 'Rect', 'AP', 'F', 'C', 'CA', 'IC', 'Border', 'BS']) {
      const value = source.get(key(name));
      if (value) synthetic.set(key(name), value);
    }
    // The reused fingerprint binds PDFHubData but does not itself bind QuadPoints.
    synthetic.set(key('PDFHubData'), lib.PDFString.of(JSON.stringify({ points, offset })));
    const hash = await fingerprintStampAppearance(doc, synthetic, lib);
    return hash?.startsWith('pdfhub-stamp-ap-v1:') ? hash.replace('pdfhub-stamp-ap-v1:', 'pdfhub-markup-turn-v1:') : null;
  } catch { return null; }
}

export async function fingerprintNativeMarkupRotation(doc: PDFDocument, source: PDFDict, lib: Lib): Promise<string | null> {
  const hash = await calculateFingerprint(doc, source, lib);
  const key = lib.PDFName.of;
  const hasOffset = Boolean(source.get(key(OFFSET)));
  const hasFingerprint = Boolean(source.get(key(FINGERPRINT)));
  if (hasOffset !== hasFingerprint) return null;
  if (hasOffset) {
    try {
      const stored = source.lookup(key(FINGERPRINT), lib.PDFString, lib.PDFHexString).decodeText();
      if (!hash || stored !== hash) return null;
    } catch { return null; }
  }
  return hash;
}

/** Seal preview orientation only after a validated rotation or edit. */
export async function sealNativeMarkupPreview(doc: PDFDocument, target: PDFDict, offset: number, lib: Lib): Promise<boolean> {
  target.set(lib.PDFName.of(OFFSET), lib.PDFNumber.of(offset));
  const hash = await calculateFingerprint(doc, target, lib);
  if (!hash) return false;
  target.set(lib.PDFName.of(FINGERPRINT), lib.PDFString.of(hash));
  return true;
}

export function readNativeMarkupPreviewOffset(source: PDFDict, lib: Lib): number {
  return source.lookupMaybe(lib.PDFName.of(OFFSET), lib.PDFNumber)?.asNumber() ?? 0;
}
