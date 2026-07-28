import { type ProfessionalCalloutModel } from './model';
import type { GeneratedAnnotationIdentity } from '../../../annotation-core/annotation-identity';

export interface V3MarkerData {
  version: 'v3';
  psSuffix: string;
  mappingHash: string;
  occurrenceId: string;
  layoutHash: string;
  styleVersion: string;
}

export interface VerificationReport {
  passed: boolean;
  verifiedCount: number;
  missingMarkerErrors: string[];
  duplicateErrors: string[];
  mismatchErrors: string[];
  missingTextErrors: string[];
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

export function computeSha256(str: string): string {
  function rotr(n: number, x: number): number { return (x >>> n) | (x << (32 - n)); }
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const utf8 = new TextEncoder().encode(str);
  const len = utf8.length;
  const bitLen = len * 8;
  const padLen = (len % 64 < 56) ? (56 - len % 64) : (120 - len % 64);
  const padded = new Uint8Array(len + padLen + 8);
  padded.set(utf8, 0);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);

  const W = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t += 1) {
      W[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr(7, W[t - 15]!) ^ rotr(18, W[t - 15]!) ^ (W[t - 15]! >>> 3);
      const s1 = rotr(17, W[t - 2]!) ^ rotr(19, W[t - 2]!) ^ (W[t - 2]! >>> 1);
      W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t += 1) {
      const s1 = rotr(6, e!) ^ rotr(11, e!) ^ rotr(25, e!);
      const ch = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + s1 + ch + SHA256_K[t]! + W[t]!) >>> 0;
      const s0 = rotr(2, a!) ^ rotr(13, a!) ^ rotr(22, a!);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0]! + a!) >>> 0;
    H[1] = (H[1]! + b!) >>> 0;
    H[2] = (H[2]! + c!) >>> 0;
    H[3] = (H[3]! + d!) >>> 0;
    H[4] = (H[4]! + e!) >>> 0;
    H[5] = (H[5]! + f!) >>> 0;
    H[6] = (H[6]! + g!) >>> 0;
    H[7] = (H[7]! + h!) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * Computes a simple deterministic 32-bit hex hash (FNV-1a) over a string.
 */
export function hashString32(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Computes the collision-resistant layout hash over geometry, text, quality (confidence), and style contract.
 */
export function computeLayoutHash(callout: ProfessionalCalloutModel): string {
  const payload = JSON.stringify({
    box: callout.box,
    target: callout.targetPoint,
    tag: callout.tag,
    note: callout.note,
    confidence: callout.confidence,
    style: callout.style,
  });
  return `sha256:${computeSha256(payload)}`;
}

/**
 * Generates the auditable v3 marker identity for a professional callout.
 * Format: PDFHUBISONOTE[v3|<PS suffix>|<mapping hash>|<occurrence ID>|<layout hash>|<style version>]
 */
export function generateV3Marker(callout: ProfessionalCalloutModel, mappingHash = `sha256:${'0'.repeat(64)}`): string {
  if (!/^sha256:[a-f0-9]{64}$/i.test(mappingHash)) {
    throw new Error(`Invalid mapping hash format: ${mappingHash}. Expected sha256:<64 hex chars>.`);
  }
  const psSuffix = callout.psNo.includes('-') ? callout.psNo.split('-').slice(1).join('-') : callout.psNo;
  const layoutHash = computeLayoutHash(callout);
  return `PDFHUBISONOTE[v3|${psSuffix}|${mappingHash}|${callout.id}|${layoutHash}|${callout.style.version}]`;
}

/**
 * Parses a v3 marker string back into its structured components.
 */
export function parseV3Marker(markerStr: string): V3MarkerData | null {
  const cleaned = markerStr.replace(/\s+/g, '');
  const match = /^PDFHUBISONOTE\[v3\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]$/.exec(cleaned);
  if (!match) {
    return null;
  }
  return {
    version: 'v3',
    psSuffix: match[1],
    mappingHash: match[2],
    occurrenceId: match[3],
    layoutHash: match[4],
    styleVersion: match[5],
  };
}

/**
 * Strictly verifies written page state against expected callout models.
 * Guarantees:
 * - Exactly one matching marker is required per callout (detects duplicates and omissions).
 * - Marker success alone is insufficient when expected visible searchable text is absent.
 */
export function verifyWrittenPage(
  expectedCallouts: ProfessionalCalloutModel[],
  foundMarkers: string[],
  visibleTextItems: string[],
  mappingHash = `sha256:${'0'.repeat(64)}`,
): VerificationReport {
  const missingMarkerErrors: string[] = [];
  const duplicateErrors: string[] = [];
  const mismatchErrors: string[] = [];
  const missingTextErrors: string[] = [];
  let verifiedCount = 0;

  const joinedVisibleText = visibleTextItems.join(' ');

  for (const expected of expectedCallouts) {
    const targetMarker = generateV3Marker(expected, mappingHash);
    const expectedData = parseV3Marker(targetMarker);

    // 1. Check markers for exact occurrence ID match and duplicates
    const matchingMarkers = foundMarkers.filter((m) => {
      const parsed = parseV3Marker(m);
      return parsed && parsed.occurrenceId === expected.id;
    });

    if (matchingMarkers.length === 0) {
      missingMarkerErrors.push(`Missing v3 marker for occurrence ${expected.id} (${expected.psNo}).`);
      continue;
    } else if (matchingMarkers.length > 1) {
      duplicateErrors.push(`Duplicate markers found for occurrence ${expected.id} (${matchingMarkers.length} occurrences found).`);
      continue;
    }

    const foundData = parseV3Marker(matchingMarkers[0]);
    if (
      !foundData ||
      foundData.layoutHash !== expectedData?.layoutHash ||
      foundData.mappingHash !== expectedData?.mappingHash ||
      foundData.styleVersion !== expectedData?.styleVersion
    ) {
      mismatchErrors.push(`Marker attribute mismatch for occurrence ${expected.id}: expected layout=${expectedData?.layoutHash}, mapping=${expectedData?.mappingHash}, style=${expectedData?.styleVersion}, got layout=${foundData?.layoutHash}, mapping=${foundData?.mappingHash}, style=${foundData?.styleVersion}.`);
      continue;
    }

    // 2. Visible text verification: marker success alone is insufficient!
    const tagHeader = /^Tag(\s*No\.|:|\s)/i.test(expected.tag) ? expected.tag : `Tag: ${expected.tag}`;
    const notePrefix = expected.note.startsWith('ISO Note: ') ? expected.note : `ISO Note: ${expected.note}`;
    if (!joinedVisibleText.includes(tagHeader) || !joinedVisibleText.includes(notePrefix)) {
      missingTextErrors.push(
        `Marker verified for ${expected.id}, but expected visible searchable text (${tagHeader} / ${notePrefix}) is absent from document content.`,
      );
      continue;
    }

    verifiedCount += 1;
  }

  const passed =
    missingMarkerErrors.length === 0 &&
    duplicateErrors.length === 0 &&
    mismatchErrors.length === 0 &&
    missingTextErrors.length === 0 &&
    verifiedCount === expectedCallouts.length;

  return {
    passed,
    verifiedCount,
    missingMarkerErrors,
    duplicateErrors,
    mismatchErrors,
    missingTextErrors,
  };
}

export function buildAnnotationIdentity(
  callout: ProfessionalCalloutModel,
  sourceDocumentSha256: string,
  mappingSha256: string,
  renderedTextLines: string[],
): GeneratedAnnotationIdentity {
  const contentSha256 = `sha256:${computeSha256(renderedTextLines.join('\n'))}`;
  const geometryPayload = JSON.stringify({
    box: callout.box,
    targetPoint: callout.targetPoint,
  });
  const geometrySha256 = `sha256:${computeSha256(geometryPayload)}`;

  return {
    schemaVersion: 1,
    objectType: 'ps-isonote-callout',
    sourceDocumentSha256,
    mappingSha256,
    occurrenceId: callout.id,
    contentSha256,
    geometrySha256,
    styleVersion: callout.style.version,
    placementProfileVersion: 'piping-iso-v1',
  };
}
