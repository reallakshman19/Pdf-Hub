import { type ProfessionalCalloutModel } from './model';
import { type ReviewState, verifyCommitGate, commitReviewState, type AuditEvent } from './reviewState';
import { type VerificationReport, generateV3Marker, hashString32 } from './verificationCore';

export interface ReviewAuditManifest {
  manifestId: string;
  timestamp: number;
  pageNumber: number;
  commitHash: string;
  calloutCount: number;
  unplaceableCount: number;
  styleVersion: string;
  markers: string[];
  auditLog: readonly AuditEvent[];
  verificationReport: VerificationReport;
}

/**
 * Creates an immutable review-bound audit manifest tying approved user review state to verified layout output.
 */
export function buildReviewAuditManifest(
  state: ReviewState,
  committedCallouts: ProfessionalCalloutModel[],
  verificationReport: VerificationReport,
  mappingHash = `sha256:${'0'.repeat(64)}`,
  now = Date.now(),
): ReviewAuditManifest {
  const commitCheck = verifyCommitGate(state);
  if (!commitCheck.allowed) {
    throw new Error('Cannot bind audit manifest: review commit gate requirements unsatisfied.');
  }
  if (
    !verificationReport.passed ||
    verificationReport.verifiedCount !== committedCallouts.length ||
    verificationReport.missingMarkerErrors.length > 0 ||
    verificationReport.duplicateErrors.length > 0 ||
    verificationReport.mismatchErrors.length > 0 ||
    verificationReport.missingTextErrors.length > 0
  ) {
    throw new Error('Cannot bind audit manifest: verification core reported errors or inconsistent verification report.');
  }

  const actualCommitted = commitReviewState(state);
  const actualMap = new Map(actualCommitted.map((c) => [c.id, JSON.stringify(c)]));
  if (actualMap.size !== committedCallouts.length) {
    throw new Error('Cannot bind audit manifest: committed callout count does not match review state.');
  }
  for (const callout of committedCallouts) {
    const expectedJson = actualMap.get(callout.id);
    if (!expectedJson || expectedJson !== JSON.stringify(callout)) {
      throw new Error(`Cannot bind audit manifest: committed callout ${callout.id} differs from approved review state.`);
    }
  }

  const markers: string[] = [];
  const hashes: string[] = [];
  let styleVersion = 'v1';

  for (const callout of committedCallouts) {
    const marker = generateV3Marker(callout, mappingHash);
    markers.push(marker);
    hashes.push(marker);
    styleVersion = callout.style.version;
  }

  let unplaceableCount = 0;
  state.items.forEach((item) => {
    if (item.status === 'unplaceable' || item.originalResult.status === 'unplaceable') {
      if (item.isSuppressed) {
        unplaceableCount += 1;
      }
    }
  });

  const commitPayload = hashes.join('||') + `||page:${state.pageNumber}`;
  const commitHash = hashString32(commitPayload);
  const manifestId = `MF-${commitHash}-${now.toString(36).toUpperCase()}`;

  return {
    manifestId,
    timestamp: now,
    pageNumber: state.pageNumber,
    commitHash,
    calloutCount: committedCallouts.length,
    unplaceableCount,
    styleVersion,
    markers,
    auditLog: state.auditLog,
    verificationReport,
  };
}
