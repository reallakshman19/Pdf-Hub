import type { PDFDict, PDFDocument, PDFObject, PDFRawStream } from 'pdf-lib';
import { Unzlib } from 'fflate';
import { computeFileHash } from '@/core/document/fileHash';

type Lib = typeof import('pdf-lib');

/**
 * This is an integrity check for accidental outside edits, not authentication.
 * Anyone who can modify a PDF can also recompute an unkeyed digest.
 */
export const STAMP_AP_FINGERPRINT_KEY = 'PDFHubStampAPFingerprint';
export const STAMP_ROTATION_FINGERPRINT_KEY = 'PDFHubStampRotationFingerprint';
const VERSION = 'pdfhub-stamp-ap-v1:';
const ROTATION_VERSION = 'pdfhub-stamp-rotation-v1:';
const DEFAULT_LIMITS = { maxDepth: 32, maxObjects: 10_000, maxBytes: 4_000_000 };
export type StampFingerprintLimits = Partial<typeof DEFAULT_LIMITS>;

// Bind the AP to editable stamp inputs and to the native rotation representation.
// Page references, replies, timestamps and the fingerprint itself are excluded.
const STAMP_FIELDS = [
  'NM', 'Subtype', 'Rect', 'Contents', 'Name', 'C', 'IC', 'CA', 'F', 'BS', 'Border',
  'Rotate', 'RD', 'BE', 'MK', 'OC', 'AS',
  'PDFHubType', 'PDFHubVersion', 'PDFHubData', 'PDFHubBaseRect', 'PDFHubRotation',
] as const;

class FingerprintFailure extends Error {}
const utf8 = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function limitsFrom(overrides: StampFingerprintLimits) {
  const result = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(result) as Array<keyof typeof result>) {
    const value = overrides[key];
    if (value !== undefined) {
      if (!Number.isInteger(value) || value < 1 || value > DEFAULT_LIMITS[key]) throw new FingerprintFailure();
      result[key] = value;
    }
  }
  return result;
}

class CanonicalWriter {
  private readonly parts: Uint8Array[] = [];
  private size = 0;
  private readonly maxBytes: number;
  constructor(maxBytes: number) { this.maxBytes = maxBytes; }
  add(bytes: Uint8Array) {
    this.size += bytes.length;
    if (this.size > this.maxBytes) throw new FingerprintFailure();
    this.parts.push(bytes);
  }
  token(tag: string, bytes: Uint8Array = new Uint8Array()) {
    this.add(utf8.encode(`${tag}${bytes.length}:`));
    this.add(bytes);
  }
  finish(): Uint8Array {
    const out = new Uint8Array(this.size);
    let offset = 0;
    for (const part of this.parts) { out.set(part, offset); offset += part.length; }
    return out;
  }
}

function arrayNumbers(dict: PDFDict, key: string, count: number, lib: Lib): number[] | null {
  const value = dict.lookupMaybe(lib.PDFName.of(key), lib.PDFArray);
  if (!value || value.size() !== count) return null;
  const numbers: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const n = value.lookupMaybe(i, lib.PDFNumber)?.asNumber();
    if (n === undefined || !Number.isFinite(n)) return null;
    numbers.push(n);
  }
  return numbers;
}

function validRect(values: number[] | null): values is number[] {
  return Boolean(values && values[2] > values[0] && values[3] > values[1]);
}

/** The supported appearance is a single, finite normal Form, with no states. */
function normalForm(doc: PDFDocument, object: PDFObject | undefined, lib: Lib): PDFRawStream {
  const ap = doc.context.lookup(object);
  if (!(ap instanceof lib.PDFDict) || ap.keys().length !== 1 || !ap.has(lib.PDFName.of('N'))) throw new FingerprintFailure();
  const form = doc.context.lookup(ap.get(lib.PDFName.of('N')));
  if (!(form instanceof lib.PDFRawStream)
    || form.dict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() !== 'Form'
    || !validRect(arrayNumbers(form.dict, 'BBox', 4, lib))) throw new FingerprintFailure();
  if (form.dict.has(lib.PDFName.of('Matrix')) && !arrayNumbers(form.dict, 'Matrix', 6, lib)) throw new FingerprintFailure();
  return form;
}

function validateAppearanceRoots(doc: PDFDocument, stamp: PDFDict, lib: Lib) {
  normalForm(doc, stamp.get(lib.PDFName.of('AP')), lib);
  const rect = arrayNumbers(stamp, 'Rect', 4, lib);
  if (!validRect(rect)) throw new FingerprintFailure();
  const hasBase = stamp.has(lib.PDFName.of('PDFHubBaseAP'));
  const hasRect = stamp.has(lib.PDFName.of('PDFHubBaseRect'));
  const hasAngle = stamp.has(lib.PDFName.of('PDFHubRotation'));
  if (hasBase !== hasRect || hasBase !== hasAngle) throw new FingerprintFailure();
  if (!hasBase) return;
  normalForm(doc, stamp.get(lib.PDFName.of('PDFHubBaseAP')), lib);
  const base = arrayNumbers(stamp, 'PDFHubBaseRect', 4, lib);
  const angle = stamp.lookupMaybe(lib.PDFName.of('PDFHubRotation'), lib.PDFNumber)?.asNumber();
  if (!validRect(base) || angle === undefined || !Number.isFinite(angle) || angle < 0 || angle >= 360) throw new FingerprintFailure();
  const radians = angle * Math.PI / 180;
  const width = base[2] - base[0]; const height = base[3] - base[1];
  const rotatedWidth = Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height;
  const rotatedHeight = Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height;
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a), Math.abs(b));
  if (!close(rect[0] + rect[2], base[0] + base[2]) || !close(rect[1] + rect[3], base[1] + base[3])
    || !close(rect[2] - rect[0], rotatedWidth) || !close(rect[3] - rect[1], rotatedHeight)) throw new FingerprintFailure();
}

/** Decode only unfiltered or single Flate streams, with bounded incremental output. */
function decodedStream(stream: PDFRawStream, doc: PDFDocument, lib: Lib, maxBytes: number): Uint8Array {
  const filter = doc.context.lookup(stream.dict.get(lib.PDFName.of('Filter')));
  const params = doc.context.lookup(stream.dict.get(lib.PDFName.of('DecodeParms')));
  if (stream.contents.length > maxBytes) throw new FingerprintFailure();
  if (params && params !== lib.PDFNull && (!(params instanceof lib.PDFDict) || params.keys().length)) throw new FingerprintFailure();
  if (!filter || filter === lib.PDFNull) return Uint8Array.from(stream.contents);
  let name: PDFObject | undefined = filter;
  if (filter instanceof lib.PDFArray) {
    if (filter.size() !== 1) throw new FingerprintFailure();
    name = doc.context.lookup(filter.get(0));
  }
  if (!(name instanceof lib.PDFName) || name.decodeText() !== 'FlateDecode' || !stream.contents.length) throw new FingerprintFailure();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const inflate = new Unzlib((chunk) => {
    length += chunk.length;
    if (length > maxBytes) throw new FingerprintFailure();
    chunks.push(Uint8Array.from(chunk));
  });
  // Small compressed chunks bound the largest transient decompression allocation.
  for (let offset = 0; offset < stream.contents.length; offset += 256) {
    const end = Math.min(offset + 256, stream.contents.length);
    inflate.push(stream.contents.subarray(offset, end), end === stream.contents.length);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

/**
 * Canonicalize the full reachable object graph. References are dereferenced so
 * object-number changes do not change the digest; cycles and unknown objects
 * fail closed. Dict keys are sorted by raw PDF-name bytes, arrays stay ordered.
 */
function canonicalize(doc: PDFDocument, roots: Array<PDFObject | undefined>, lib: Lib, limits: ReturnType<typeof limitsFrom>): Uint8Array {
  const writer = new CanonicalWriter(limits.maxBytes);
  const active = new Set<PDFObject>();
  let count = 0;
  const visit = (input: PDFObject | undefined, depth: number): void => {
    if (++count > limits.maxObjects || depth > limits.maxDepth) throw new FingerprintFailure();
    if (!input) { writer.token('missing'); return; }
    const value = input instanceof lib.PDFRef ? doc.context.lookup(input) : input;
    if (!value || value instanceof lib.PDFRef) throw new FingerprintFailure();
    if (value === lib.PDFNull) { writer.token('null'); return; }
    if (value instanceof lib.PDFName) { writer.token('name', value.asBytes()); return; }
    if (value instanceof lib.PDFString || value instanceof lib.PDFHexString) { writer.token('string', value.asBytes()); return; }
    if (value instanceof lib.PDFBool) { writer.token(value.asBoolean() ? 'true' : 'false'); return; }
    if (value instanceof lib.PDFNumber) {
      const number = value.asNumber();
      if (!Number.isFinite(number)) throw new FingerprintFailure();
      writer.token('number', utf8.encode(Object.is(number, -0) ? '0' : String(number))); return;
    }
    if (active.has(value)) throw new FingerprintFailure();
    active.add(value);
    try {
      if (value instanceof lib.PDFRawStream) {
        if (value.contents.length > limits.maxBytes) throw new FingerprintFailure();
        if (value.dict.lookupMaybe(lib.PDFName.of('Subtype'), lib.PDFName)?.decodeText() === 'Form'
          && (!validRect(arrayNumbers(value.dict, 'BBox', 4, lib))
            || (value.dict.has(lib.PDFName.of('Matrix')) && !arrayNumbers(value.dict, 'Matrix', 6, lib)))) {
          throw new FingerprintFailure();
        }
        writer.token('stream');
        // Include both decoded and compressed bytes as well as filter parameters;
        // benign re-encoding can downgrade to read-only, never silently trust it.
        writer.token('raw', Uint8Array.from(value.contents));
        writer.token('decoded', decodedStream(value, doc, lib, limits.maxBytes));
        visitDict(value.dict, depth + 1, true);
      } else if (value instanceof lib.PDFArray) {
        if (value.size() > limits.maxObjects - count) throw new FingerprintFailure();
        writer.token('array', utf8.encode(String(value.size())));
        for (let i = 0; i < value.size(); i += 1) visit(value.get(i), depth + 1);
      } else if (value instanceof lib.PDFDict) {
        visitDict(value, depth + 1, false);
      } else {
        throw new FingerprintFailure();
      }
    } finally { active.delete(value); }
  };
  const visitDict = (dict: PDFDict, depth: number, isStreamDict: boolean) => {
    if (depth > limits.maxDepth) throw new FingerprintFailure();
    if (dict.keys().length > limits.maxObjects - count + (isStreamDict ? 1 : 0)) throw new FingerprintFailure();
    const entries = dict.entries().filter(([key]) => !(isStreamDict && key.decodeText() === 'Length'))
      .map(([key, value]) => ({ key: key.asBytes(), sortKey: hex(key.asBytes()), value }))
      .sort((a, b) => a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0);
    writer.token('dict', utf8.encode(String(entries.length)));
    for (const { key, value } of entries) { writer.token('key', key); visit(value, depth + 1); }
  };
  writer.token('version', utf8.encode(VERSION));
  for (const root of roots) visit(root, 0);
  return writer.finish();
}

/** Returns null for malformed, unsupported or over-budget graphs. */
export async function fingerprintStampAppearance(
  doc: PDFDocument,
  stamp: PDFDict,
  lib: Lib,
  overrides: StampFingerprintLimits = {},
): Promise<string | null> {
  try {
    const limits = limitsFrom(overrides);
    validateAppearanceRoots(doc, stamp, lib);
    const roots = [stamp.get(lib.PDFName.of('AP')), stamp.get(lib.PDFName.of('PDFHubBaseAP')),
      ...STAMP_FIELDS.map((field) => stamp.get(lib.PDFName.of(field)))];
    const canonical = canonicalize(doc, roots, lib, limits);
    // computeFileHash currently hashes an entire backing buffer, not a view.
    return VERSION + await computeFileHash(Uint8Array.from(canonical));
  } catch {
    return null;
  }
}

/** Verify on both import and immediately before replacing a source appearance. */
export async function verifyStampAppearanceFingerprint(doc: PDFDocument, stamp: PDFDict, lib: Lib): Promise<boolean> {
  try {
    const stored = stamp.lookupMaybe(lib.PDFName.of(STAMP_AP_FINGERPRINT_KEY), lib.PDFString, lib.PDFHexString)?.decodeText();
    if (!stored || !/^pdfhub-stamp-ap-v1:[0-9a-f]{64}$/.test(stored)) return false;
    return stored === await fingerprintStampAppearance(doc, stamp, lib);
  } catch { return false; }
}

/** Seal only after the appearance, base appearance and all bound fields are final. */
export async function sealStampAppearanceFingerprint(doc: PDFDocument, stamp: PDFDict, lib: Lib): Promise<boolean> {
  const digest = await fingerprintStampAppearance(doc, stamp, lib);
  if (!digest) { stamp.delete(lib.PDFName.of(STAMP_AP_FINGERPRINT_KEY)); return false; }
  stamp.set(lib.PDFName.of(STAMP_AP_FINGERPRINT_KEY), lib.PDFString.of(digest));
  return true;
}

/**
 * Rotation provenance proves only that our saved wrapper and base still
 * match the last safe transform. It does not make imported artwork editable.
 */
export async function verifyStampRotationFingerprint(doc: PDFDocument, stamp: PDFDict, lib: Lib): Promise<boolean> {
  try {
    if (!stamp.get(lib.PDFName.of('PDFHubBaseAP'))) return false;
    const stored = stamp.lookupMaybe(lib.PDFName.of(STAMP_ROTATION_FINGERPRINT_KEY), lib.PDFString, lib.PDFHexString)?.decodeText();
    if (!stored || !/^pdfhub-stamp-rotation-v1:[0-9a-f]{64}$/.test(stored)) return false;
    const digest = await fingerprintStampAppearance(doc, stamp, lib);
    return Boolean(digest && stored === ROTATION_VERSION + digest.slice(VERSION.length));
  } catch { return false; }
}

/** Call only for a newly constructed wrapper or an already verified wrapper. */
export async function sealStampRotationFingerprint(doc: PDFDocument, stamp: PDFDict, lib: Lib): Promise<boolean> {
  if (!stamp.get(lib.PDFName.of('PDFHubBaseAP'))) {
    stamp.delete(lib.PDFName.of(STAMP_ROTATION_FINGERPRINT_KEY));
    return false;
  }
  const digest = await fingerprintStampAppearance(doc, stamp, lib);
  if (!digest) { stamp.delete(lib.PDFName.of(STAMP_ROTATION_FINGERPRINT_KEY)); return false; }
  stamp.set(lib.PDFName.of(STAMP_ROTATION_FINGERPRINT_KEY), lib.PDFString.of(ROTATION_VERSION + digest.slice(VERSION.length)));
  return true;
}
