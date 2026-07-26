import { type ProfessionalCalloutModel } from './model';

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
 * Computes the layout hash over geometry, text, quality (confidence), and style contract.
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
  return hashString32(payload);
}

/**
 * Generates the auditable v3 marker identity for a professional callout.
 * Format: PDFHUBISONOTE[v3|<PS suffix>|<mapping hash>|<occurrence ID>|<layout hash>|<style version>]
 */
export function generateV3Marker(callout: ProfessionalCalloutModel, mappingHash = 'e0000000'): string {
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
  mappingHash = 'e0000000',
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
    if (!foundData || foundData.layoutHash !== expectedData?.layoutHash) {
      mismatchErrors.push(`Layout hash mismatch for occurrence ${expected.id}: expected ${expectedData?.layoutHash}, got ${foundData?.layoutHash}.`);
      continue;
    }

    // 2. Visible text verification: marker success alone is insufficient!
    const tagHeader = `Tag: ${expected.tag}`;
    const notePrefix = `ISO Note: ${expected.note}`;
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
