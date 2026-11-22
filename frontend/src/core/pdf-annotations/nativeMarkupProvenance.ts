import { fingerprintStampAppearance } from './nativeStampProvenance';

type PDFArray = import('pdf-lib').PDFArray;
type PDFDict = import('pdf-lib').PDFDict;
type PDFDocument = import('pdf-lib').PDFDocument;
type PdfLibModule = typeof import('pdf-lib');

export const MARKUP_GENERATED_AP_KEY = 'PDFHubGeneratedMarkupAPFingerprint';
const MARKUP_GENERATED_AP_VERSION = 'pdfhub-generated-markup-ap-v1:';

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

export async function verifyGeneratedMarkupAppearance(doc: PDFDocument, source: PDFDict, lib: PdfLibModule): Promise<boolean> {
  try {
    const stored = source.lookupMaybe(lib.PDFName.of(MARKUP_GENERATED_AP_KEY), lib.PDFString, lib.PDFHexString)?.decodeText();
    return Boolean(stored && /^pdfhub-generated-markup-ap-v1:[0-9a-f]{64}$/.test(stored)
      && stored === await fingerprintGeneratedMarkupAppearance(doc, source, lib));
  } catch { return false; }
}

export async function sealGeneratedMarkupAppearance(doc: PDFDocument, target: PDFDict, lib: PdfLibModule): Promise<boolean> {
  const digest = await fingerprintGeneratedMarkupAppearance(doc, target, lib);
  if (!digest) { target.delete(lib.PDFName.of(MARKUP_GENERATED_AP_KEY)); return false; }
  target.set(lib.PDFName.of(MARKUP_GENERATED_AP_KEY), lib.PDFString.of(digest));
  return true;
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

