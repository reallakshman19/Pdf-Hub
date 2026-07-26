import { describe, expect, it } from 'vitest';
import { createReviewBoundPsIsonoteAuditManifest } from './auditManifestBinding';
import {
  DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE,
  type PsIsonotePlannedCallout,
} from './model';
import { createPsIsonoteReviewState } from './reviewState';

function cleanCallout(): PsIsonotePlannedCallout {
  return {
    psNo: 'PS-11167.4',
    pageNumber: 1,
    mappingHash: `sha256:${'a'.repeat(64)}`,
    occurrenceId: `sha256:${'b'.repeat(64)}`,
    content: {
      psNo: 'PS-11167.4',
      family: 'R+G',
      isonote: 'REST, GUIDE',
    },
    box: { x: 300, y: 120, width: 180, height: 48 },
    anchor: { x: 250, y: 180 },
    leader: {
      points: [
        { x: 300, y: 144 },
        { x: 275, y: 144 },
        { x: 275, y: 180 },
        { x: 250, y: 180 },
      ],
      anchorRadius: 2.5,
    },
    quality: 'clean',
    diagnostics: [],
    score: 10,
    styleVersion: DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE.styleVersion,
  };
}

describe('review-bound professional audit manifest', () => {
  it('accepts the exact approved review selection', async () => {
    const approved = cleanCallout();
    const reviewState = createPsIsonoteReviewState([approved]);
    const manifest = await createReviewBoundPsIsonoteAuditManifest({
      callouts: [approved],
      reviewState,
    });

    expect(manifest.reviewGate.allowed).toBe(true);
    expect(manifest.calloutCount).toBe(1);
  });

  it('rejects a callout plan that differs from the approved review selection', async () => {
    const approved = cleanCallout();
    const reviewState = createPsIsonoteReviewState([approved]);
    const substituted = {
      ...approved,
      box: { ...approved.box, x: approved.box.x + 20 },
    };

    await expect(createReviewBoundPsIsonoteAuditManifest({
      callouts: [substituted],
      reviewState,
    })).rejects.toThrow(/do not match the approved review selection/);
  });
});
