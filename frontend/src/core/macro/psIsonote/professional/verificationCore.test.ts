import { describe, expect, it } from 'vitest';
import {
  buildPsIsonoteVerificationExpectations,
  computePsIsonoteLayoutHash,
  createPsIsonoteProfessionalAuditManifest,
  parseProfessionalPsIsonoteMarkers,
  professionalMarkerForOccurrence,
  verifyProfessionalPsIsonoteEvidence,
} from './verificationCore';
import {
  DEFAULT_PS_ISONOTE_PROFESSIONAL_STYLE,
  type PsIsonotePlannedCallout,
} from './model';
import {
  createPsIsonoteReviewState,
  reducePsIsonoteReviewState,
} from './reviewState';

function callout(overrides: Partial<PsIsonotePlannedCallout> = {}): PsIsonotePlannedCallout {
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
    ...overrides,
  };
}

describe('professional PS ISONOTE verification core', () => {
  it('produces deterministic layout hashes and changes them when geometry changes', async () => {
    const base = callout();
    const same = callout();
    const moved = callout({ box: { ...base.box, x: base.box.x + 10 } });

    expect(await computePsIsonoteLayoutHash(base)).toBe(await computePsIsonoteLayoutHash(same));
    expect(await computePsIsonoteLayoutHash(base)).not.toBe(await computePsIsonoteLayoutHash(moved));
  });

  it('round-trips a v3 marker with mapping, occurrence, layout, and style identity', () => {
    const marker = professionalMarkerForOccurrence({
      psNo: 'PS-11167.4',
      mappingHash: `sha256:${'a'.repeat(64)}`,
      occurrenceId: `sha256:${'b'.repeat(64)}`,
      layoutHash: `sha256:${'c'.repeat(64)}`,
      styleVersion: 'professional-v1',
    });
    const parsed = parseProfessionalPsIsonoteMarkers(`prefix ${marker} suffix`);

    expect(parsed).toEqual([{
      raw: marker.toUpperCase(),
      psNo: 'PS-11167.4',
      mappingHash: `sha256:${'a'.repeat(64)}`,
      occurrenceId: `sha256:${'b'.repeat(64)}`,
      layoutHash: `sha256:${'c'.repeat(64)}`,
      styleVersion: 'professional-v1',
    }]);
  });

  it('verifies one exact marker and the expected visible text', async () => {
    const expectations = await buildPsIsonoteVerificationExpectations([callout()]);
    const report = verifyProfessionalPsIsonoteEvidence({
      expectations,
      pages: [{
        pageNumber: 1,
        searchableText: `PS-11167.4 R+G REST, GUIDE ${expectations[0].marker}`,
      }],
    });

    expect(report.verified).toBe(true);
    expect(report.verifiedCount).toBe(1);
    expect(report.results[0].status).toBe('verified');
  });

  it('detects duplicate exact markers', async () => {
    const expectations = await buildPsIsonoteVerificationExpectations([callout()]);
    const marker = expectations[0].marker;
    const report = verifyProfessionalPsIsonoteEvidence({
      expectations,
      pages: [{
        pageNumber: 1,
        searchableText: `PS-11167.4 R+G REST, GUIDE ${marker} ${marker}`,
      }],
    });

    expect(report.verified).toBe(false);
    expect(report.results[0].status).toBe('duplicate-marker');
    expect(report.results[0].exactMarkerCount).toBe(2);
  });

  it('detects a layout mismatch for the same mapped occurrence', async () => {
    const expectations = await buildPsIsonoteVerificationExpectations([callout()]);
    const wrongLayoutMarker = professionalMarkerForOccurrence({
      ...expectations[0],
      layoutHash: `sha256:${'d'.repeat(64)}`,
    });
    const report = verifyProfessionalPsIsonoteEvidence({
      expectations,
      pages: [{
        pageNumber: 1,
        searchableText: `PS-11167.4 R+G REST, GUIDE ${wrongLayoutMarker}`,
      }],
    });

    expect(report.results[0].status).toBe('layout-mismatch');
  });

  it('detects marker success with missing visible callout text', async () => {
    const expectations = await buildPsIsonoteVerificationExpectations([callout()]);
    const report = verifyProfessionalPsIsonoteEvidence({
      expectations,
      pages: [{
        pageNumber: 1,
        searchableText: `PS-11167.4 ${expectations[0].marker}`,
      }],
    });

    expect(report.results[0].status).toBe('visible-text-missing');
    expect(report.results[0].missingVisibleText).toContain('REST, GUIDE');
  });

  it('binds the approved callout plan and review trail into an audit manifest', async () => {
    const planned = callout({ quality: 'review', diagnostics: ['REVIEW_TEXT_OVERLAP'] });
    let reviewState = createPsIsonoteReviewState([planned]);
    reviewState = reducePsIsonoteReviewState(reviewState, {
      type: 'move',
      occurrenceId: planned.occurrenceId,
      box: { ...planned.box, x: 390 },
      leader: planned.leader,
    });
    reviewState = reducePsIsonoteReviewState(reviewState, {
      type: 'approve',
      occurrenceId: planned.occurrenceId,
    });
    const approved = reviewState.itemsByOccurrenceId[planned.occurrenceId].current;
    const manifest = await createPsIsonoteProfessionalAuditManifest({
      callouts: [approved],
      reviewState,
      requireCommitReady: true,
    });

    expect(manifest.reviewGate.allowed).toBe(true);
    expect(manifest.calloutCount).toBe(1);
    expect(manifest.reviewAuditTrailHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.calloutPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.expectations[0].layoutHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('fails closed when a commit-ready manifest is requested for incomplete review', async () => {
    const planned = callout({ quality: 'review', diagnostics: ['REVIEW_TEXT_OVERLAP'] });
    const reviewState = createPsIsonoteReviewState([planned]);

    await expect(createPsIsonoteProfessionalAuditManifest({
      callouts: [planned],
      reviewState,
      requireCommitReady: true,
    })).rejects.toThrow(/incomplete review/);
  });
});
