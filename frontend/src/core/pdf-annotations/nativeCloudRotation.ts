type Lib = typeof import('pdf-lib');
type PDFDict = import('pdf-lib').PDFDict;
type PDFDocument = import('pdf-lib').PDFDocument;
import { fingerprintStampAppearance } from './nativeStampProvenance';

/** Only source-backed cloud Forms with understood geometry can be turned. */
export function supportsNativeCloudRotation(source: PDFDict, lib: Lib): boolean {
  try {
    const key = lib.PDFName.of;
    if (source.lookupMaybe(key('Subtype'), lib.PDFName)?.decodeText() !== 'Square') return false;
    const be = source.lookupMaybe(key('BE'), lib.PDFDict);
    if (!be || be.lookupMaybe(key('S'), lib.PDFName)?.decodeText() !== 'C') return false;
    const intensity = be.get(key('I')) ? be.lookup(key('I'), lib.PDFNumber).asNumber() : 0;
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 2) return false;
    if (['IT', 'Measure', 'Vertices', 'InkList', 'L', 'CL', 'QuadPoints', 'Rotate', 'PDFHubBaseAP']
      .some((name) => source.get(key(name)))) return false;
    const flags = source.get(key('F')) ? source.lookup(key('F'), lib.PDFNumber).asNumber() : 0;
    if (!Number.isInteger(flags) || (flags & 16)) return false;
    const ap = source.lookupMaybe(key('AP'), lib.PDFDict);
    if (!ap || ap.keys().some((name) => name.decodeText() !== 'N') || !ap.lookupMaybe(key('N'), lib.PDFStream)) return false;
    const rect = source.lookup(key('Rect'), lib.PDFArray);
    if (rect.size() !== 4) return false;
    const r = Array.from({length: 4}, (_, i) => rect.lookup(i, lib.PDFNumber).asNumber());
    if (!r.every(Number.isFinite) || r[2] <= r[0] || r[3] <= r[1]) return false;
    if (source.get(key('RD'))) {
      const rd = source.lookup(key('RD'), lib.PDFArray);
      if (rd.size() !== 4) return false;
      const d = Array.from({length: 4}, (_, i) => rd.lookup(i, lib.PDFNumber).asNumber());
      if (!d.every((n) => Number.isFinite(n) && n >= 0) || d[0] + d[2] >= r[2] - r[0] || d[1] + d[3] >= r[3] - r[1]) return false;
    }
    return true;
  } catch { return false; }
}

/** Bind native artwork and geometry, but not the app's mutable recovery cache. */
export async function fingerprintNativeCloudRotation(doc: PDFDocument, source: PDFDict, lib: Lib): Promise<string | null> {
  if (!supportsNativeCloudRotation(source, lib)) return null;
  const root = doc.context.obj({}) as PDFDict;
  for (const key of source.keys()) {
    if (key.decodeText() === 'PDFHubData') continue;
    const value = source.get(key);
    if (value) root.set(key, value);
  }
  return fingerprintStampAppearance(doc, root, lib);
}

/** Clockwise turns in the page's displayed coordinate system. */
export function rotateCloudInsets(insets: number[], turns: number): number[] {
  let result = [...insets];
  for (let i = 0; i < turns; i++) result = [result[3], result[0], result[1], result[2]];
  return result;
}
