import { hashCanonical } from '../psIsonoteIdentity';
import type { PsIsonotePlannedCallout } from './model';
import {
  evaluatePsIsonoteCommitGate,
  reviewedPsIsonoteCallouts,
  type PsIsonoteReviewState,
} from './reviewState';
import {
  canonicalPsIsonoteLayoutPayload,
  createPsIsonoteProfessionalAuditManifest,
  type PsIsonoteProfessionalAuditManifest,
} from './verificationCore';

function canonicalCalloutSet(callouts: PsIsonotePlannedCallout[]): unknown[] {
  return [...callouts]
    .sort((left, right) =>
      left.pageNumber - right.pageNumber ||
      left.occurrenceId.localeCompare(right.occurrenceId),
    )
    .map(canonicalPsIsonoteLayoutPayload);
}

/**
 * Commit-path manifest builder.
 *
 * The lower-level manifest function also supports preview evidence while review
 * is incomplete. This wrapper is the fail-closed commit boundary: the provided
 * callouts must be exactly the approved callouts held by the review state.
 */
export async function createReviewBoundPsIsonoteAuditManifest(options: {
  callouts: PsIsonotePlannedCallout[];
  reviewState: PsIsonoteReviewState;
}): Promise<PsIsonoteProfessionalAuditManifest> {
  const gate = evaluatePsIsonoteCommitGate(options.reviewState);
  if (!gate.allowed) {
    throw new Error(`Cannot create commit manifest: ${gate.reasons.join(' ')}`);
  }

  const approvedCallouts = reviewedPsIsonoteCallouts(options.reviewState);
  const [providedHash, approvedHash] = await Promise.all([
    hashCanonical(canonicalCalloutSet(options.callouts)),
    hashCanonical(canonicalCalloutSet(approvedCallouts)),
  ]);

  if (providedHash !== approvedHash) {
    throw new Error(
      'Cannot create commit manifest: provided callouts do not match the approved review selection.',
    );
  }

  return createPsIsonoteProfessionalAuditManifest({
    callouts: options.callouts,
    reviewState: options.reviewState,
    requireCommitReady: true,
  });
}
