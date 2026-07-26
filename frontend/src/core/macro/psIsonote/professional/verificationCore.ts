import { hashCanonical } from '../psIsonoteIdentity';
import type { PsIsonotePlannedCallout } from './model';
import {
  evaluatePsIsonoteCommitGate,
  type PsIsonoteCommitGate,
  type PsIsonoteReviewState,
} from './reviewState';

export const PS_ISONOTE_PROFESSIONAL_MARKER_VERSION = 'v3';
export const PS_ISONOTE_PROFESSIONAL_AUDIT_SCHEMA_VERSION = 'professional-audit-v1';

export interface PsIsonoteProfessionalMarkerIdentity {
  psNo: string;
  mappingHash: string;
  occurrenceId: string;
  layoutHash: string;
  styleVersion: string;
}

export interface ParsedPsIsonoteProfessionalMarker extends PsIsonoteProfessionalMarkerIdentity {
  raw: string;
}

export interface PsIsonoteVerificationExpectation extends PsIsonoteProfessionalMarkerIdentity {
  pageNumber: number;
  marker: string;
  visibleText: string[];
}

export interface PsIsonoteObservedPageEvidence {
  pageNumber: number;
  searchableText: string;
}

export type PsIsonoteOccurrenceVerificationStatus =
  | 'verified'
  | 'missing-marker'
  | 'duplicate-marker'
  | 'mapping-mismatch'
  | 'layout-mismatch'
  | 'style-mismatch'
  | 'visible-text-missing';

export interface PsIsonoteOccurrenceVerificationResult {
  occurrenceId: string;
  psNo: string;
  pageNumber: number;
  status: PsIsonoteOccurrenceVerificationStatus;
  exactMarkerCount: number;
  relatedMarkerCount: number;
  missingVisibleText: string[];
  message: string;
}

export interface PsIsonoteProfessionalVerificationReport {
  verified: boolean;
  expectedCount: number;
  verifiedCount: number;
  results: PsIsonoteOccurrenceVerificationResult[];
}

export interface PsIsonoteProfessionalAuditManifest {
  schemaVersion: string;
  markerVersion: string;
  styleVersions: string[];
  calloutCount: number;
  reviewGate: PsIsonoteCommitGate;
  reviewAuditTrailHash: string;
  calloutPlanHash: string;
  expectations: PsIsonoteVerificationExpectation[];
}

function normalizeHash(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeVisibleText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '');
}

function normalizedContent(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundedRect(rect: PsIsonotePlannedCallout['box']): Record<string, number> {
  return {
    x: rounded(rect.x),
    y: rounded(rect.y),
    width: rounded(rect.width),
    height: rounded(rect.height),
  };
}

function psSuffix(psNo: string): string {
  return psNo.replace(/^PS-/i, '');
}

function validateHash(value: string, label: string): void {
  if (!/^sha256:[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${label} must be a SHA-256 identity.`);
  }
}

function validateStyleVersion(value: string): void {
  if (!/^[a-z0-9._-]+$/i.test(value)) {
    throw new Error('Style version may contain only letters, numbers, dot, underscore, and hyphen.');
  }
}

export function canonicalPsIsonoteLayoutPayload(
  callout: PsIsonotePlannedCallout,
): unknown {
  return {
    pageNumber: callout.pageNumber,
    psNo: callout.psNo,
    mappingHash: normalizeHash(callout.mappingHash),
    occurrenceId: normalizeHash(callout.occurrenceId),
    box: roundedRect(callout.box),
    anchor: {
      x: rounded(callout.anchor.x),
      y: rounded(callout.anchor.y),
    },
    leader: {
      anchorRadius: rounded(callout.leader.anchorRadius),
      points: callout.leader.points.map((point) => ({
        x: rounded(point.x),
        y: rounded(point.y),
      })),
    },
    content: {
      psNo: normalizedContent(callout.content.psNo),
      family: normalizedContent(callout.content.family ?? ''),
      isonote: normalizedContent(callout.content.isonote),
      statusLabel: normalizedContent(callout.content.statusLabel ?? ''),
    },
    quality: callout.quality,
    styleVersion: callout.styleVersion,
  };
}

export async function computePsIsonoteLayoutHash(
  callout: PsIsonotePlannedCallout,
): Promise<string> {
  return hashCanonical(canonicalPsIsonoteLayoutPayload(callout));
}

export function professionalMarkerForOccurrence(
  identity: PsIsonoteProfessionalMarkerIdentity,
): string {
  validateHash(identity.mappingHash, 'Mapping hash');
  validateHash(identity.occurrenceId, 'Occurrence ID');
  validateHash(identity.layoutHash, 'Layout hash');
  validateStyleVersion(identity.styleVersion);

  return [
    'PDFHUBISONOTE[',
    PS_ISONOTE_PROFESSIONAL_MARKER_VERSION,
    '|',
    psSuffix(identity.psNo),
    '|',
    normalizeHash(identity.mappingHash),
    '|',
    normalizeHash(identity.occurrenceId),
    '|',
    normalizeHash(identity.layoutHash),
    '|',
    identity.styleVersion.toLowerCase(),
    ']',
  ].join('');
}

const PROFESSIONAL_MARKER_PATTERN =
  /PDFHUBISONOTE\[V3\|([A-Z0-9./-]+)\|(SHA256:[A-F0-9]{64})\|(SHA256:[A-F0-9]{64})\|(SHA256:[A-F0-9]{64})\|([A-Z0-9._-]+)\]/g;

export function parseProfessionalPsIsonoteMarkers(
  pageText: string,
): ParsedPsIsonoteProfessionalMarker[] {
  const normalized = normalizeVisibleText(pageText);
  const markers: ParsedPsIsonoteProfessionalMarker[] = [];
  PROFESSIONAL_MARKER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PROFESSIONAL_MARKER_PATTERN.exec(normalized)) !== null) {
    markers.push({
      raw: match[0],
      psNo: `PS-${match[1]}`,
      mappingHash: match[2].toLowerCase(),
      occurrenceId: match[3].toLowerCase(),
      layoutHash: match[4].toLowerCase(),
      styleVersion: match[5].toLowerCase(),
    });
  }

  return markers;
}

function expectedVisibleText(callout: PsIsonotePlannedCallout): string[] {
  return [
    callout.content.psNo,
    ...(callout.content.family ? [callout.content.family] : []),
    callout.content.isonote,
    ...(callout.content.statusLabel ? [callout.content.statusLabel] : []),
  ]
    .map(normalizedContent)
    .filter(Boolean);
}

export async function buildPsIsonoteVerificationExpectations(
  callouts: PsIsonotePlannedCallout[],
): Promise<PsIsonoteVerificationExpectation[]> {
  const expectations = await Promise.all(callouts.map(async (callout) => {
    const layoutHash = await computePsIsonoteLayoutHash(callout);
    const identity: PsIsonoteProfessionalMarkerIdentity = {
      psNo: callout.psNo,
      mappingHash: callout.mappingHash,
      occurrenceId: callout.occurrenceId,
      layoutHash,
      styleVersion: callout.styleVersion,
    };
    return {
      ...identity,
      pageNumber: callout.pageNumber,
      marker: professionalMarkerForOccurrence(identity),
      visibleText: expectedVisibleText(callout),
    };
  }));

  return expectations.sort((left, right) =>
    left.pageNumber - right.pageNumber ||
    left.psNo.localeCompare(right.psNo) ||
    left.occurrenceId.localeCompare(right.occurrenceId),
  );
}

function verificationFailure(options: {
  expectation: PsIsonoteVerificationExpectation;
  status: PsIsonoteOccurrenceVerificationStatus;
  exactMarkerCount: number;
  relatedMarkerCount: number;
  missingVisibleText?: string[];
  message: string;
}): PsIsonoteOccurrenceVerificationResult {
  return {
    occurrenceId: options.expectation.occurrenceId,
    psNo: options.expectation.psNo,
    pageNumber: options.expectation.pageNumber,
    status: options.status,
    exactMarkerCount: options.exactMarkerCount,
    relatedMarkerCount: options.relatedMarkerCount,
    missingVisibleText: options.missingVisibleText ?? [],
    message: options.message,
  };
}

function verifyExpectation(
  expectation: PsIsonoteVerificationExpectation,
  evidence: PsIsonoteObservedPageEvidence | undefined,
): PsIsonoteOccurrenceVerificationResult {
  const pageText = evidence?.searchableText ?? '';
  const markers = parseProfessionalPsIsonoteMarkers(pageText);
  const related = markers.filter((marker) =>
    marker.psNo === expectation.psNo && marker.occurrenceId === expectation.occurrenceId,
  );
  const exact = related.filter((marker) =>
    marker.mappingHash === normalizeHash(expectation.mappingHash) &&
    marker.layoutHash === normalizeHash(expectation.layoutHash) &&
    marker.styleVersion === expectation.styleVersion.toLowerCase(),
  );

  if (exact.length > 1) {
    return verificationFailure({
      expectation,
      status: 'duplicate-marker',
      exactMarkerCount: exact.length,
      relatedMarkerCount: related.length,
      message: `Expected one professional marker but found ${exact.length}.`,
    });
  }

  if (exact.length === 0) {
    const mappingMismatch = related.find((marker) =>
      marker.mappingHash !== normalizeHash(expectation.mappingHash),
    );
    if (mappingMismatch) {
      return verificationFailure({
        expectation,
        status: 'mapping-mismatch',
        exactMarkerCount: 0,
        relatedMarkerCount: related.length,
        message: 'Occurrence marker exists with a different mapping hash.',
      });
    }

    const layoutMismatch = related.find((marker) =>
      marker.layoutHash !== normalizeHash(expectation.layoutHash),
    );
    if (layoutMismatch) {
      return verificationFailure({
        expectation,
        status: 'layout-mismatch',
        exactMarkerCount: 0,
        relatedMarkerCount: related.length,
        message: 'Occurrence marker exists with a different layout hash.',
      });
    }

    const styleMismatch = related.find((marker) =>
      marker.styleVersion !== expectation.styleVersion.toLowerCase(),
    );
    if (styleMismatch) {
      return verificationFailure({
        expectation,
        status: 'style-mismatch',
        exactMarkerCount: 0,
        relatedMarkerCount: related.length,
        message: 'Occurrence marker exists with a different style version.',
      });
    }

    return verificationFailure({
      expectation,
      status: 'missing-marker',
      exactMarkerCount: 0,
      relatedMarkerCount: related.length,
      message: evidence ? 'Expected professional marker is missing.' : 'Expected page evidence is missing.',
    });
  }

  const normalizedPageText = normalizeVisibleText(pageText);
  const missingVisibleText = expectation.visibleText.filter((value) =>
    !normalizedPageText.includes(normalizeVisibleText(value)),
  );
  if (missingVisibleText.length > 0) {
    return verificationFailure({
      expectation,
      status: 'visible-text-missing',
      exactMarkerCount: 1,
      relatedMarkerCount: related.length,
      missingVisibleText,
      message: `Marker verified, but ${missingVisibleText.length} visible text fragment(s) are missing.`,
    });
  }

  return {
    occurrenceId: expectation.occurrenceId,
    psNo: expectation.psNo,
    pageNumber: expectation.pageNumber,
    status: 'verified',
    exactMarkerCount: 1,
    relatedMarkerCount: related.length,
    missingVisibleText: [],
    message: 'Marker identity, layout hash, style version, and visible text were verified.',
  };
}

export function verifyProfessionalPsIsonoteEvidence(options: {
  expectations: PsIsonoteVerificationExpectation[];
  pages: PsIsonoteObservedPageEvidence[];
}): PsIsonoteProfessionalVerificationReport {
  const pagesByNumber = new Map(options.pages.map((page) => [page.pageNumber, page] as const));
  const results = options.expectations.map((expectation) =>
    verifyExpectation(expectation, pagesByNumber.get(expectation.pageNumber)),
  );
  const verifiedCount = results.filter((result) => result.status === 'verified').length;

  return {
    verified: verifiedCount === options.expectations.length,
    expectedCount: options.expectations.length,
    verifiedCount,
    results,
  };
}

export async function createPsIsonoteProfessionalAuditManifest(options: {
  callouts: PsIsonotePlannedCallout[];
  reviewState: PsIsonoteReviewState;
  requireCommitReady?: boolean;
}): Promise<PsIsonoteProfessionalAuditManifest> {
  const reviewGate = evaluatePsIsonoteCommitGate(options.reviewState);
  if (options.requireCommitReady && !reviewGate.allowed) {
    throw new Error(`Cannot bind audit manifest to an incomplete review: ${reviewGate.reasons.join(' ')}`);
  }

  const expectations = await buildPsIsonoteVerificationExpectations(options.callouts);
  const [reviewAuditTrailHash, calloutPlanHash] = await Promise.all([
    hashCanonical(options.reviewState.auditTrail),
    hashCanonical(expectations.map((expectation) => ({
      pageNumber: expectation.pageNumber,
      psNo: expectation.psNo,
      mappingHash: expectation.mappingHash,
      occurrenceId: expectation.occurrenceId,
      layoutHash: expectation.layoutHash,
      styleVersion: expectation.styleVersion,
      visibleText: expectation.visibleText,
    }))),
  ]);

  return {
    schemaVersion: PS_ISONOTE_PROFESSIONAL_AUDIT_SCHEMA_VERSION,
    markerVersion: PS_ISONOTE_PROFESSIONAL_MARKER_VERSION,
    styleVersions: Array.from(new Set(expectations.map((item) => item.styleVersion))).sort(),
    calloutCount: expectations.length,
    reviewGate,
    reviewAuditTrailHash,
    calloutPlanHash,
    expectations,
  };
}
