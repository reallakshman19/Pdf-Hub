import { describe, expect, it } from 'vitest';
import { buildReviewAuditManifest } from './auditManifestBinding';
import { initReviewState, suppressReviewItem, commitReviewState } from './reviewState';
import { verifyWrittenPage, generateV3Marker } from './verificationCore';
import { buildVectorCalloutPlan } from './vectorCalloutPlan';
import { type LayoutResultItem } from './layoutTypes';

const validCallout = buildVectorCalloutPlan(
  'occ-100',
  'PS-11168.8',
  'Remove Guide',
  ':/PS-11168.8 Remove Guide',
  'HIGH',
  { x: 100, y: 100 },
  { x: 150, y: 80, width: 200 },
);

const mockResults: LayoutResultItem[] = [
  { 
    occurrenceId: 'occ-100', 
    status: 'placed', 
    placementClass: 'right', 
    callout: validCallout, 
    occurrence: { id: 'occ-100', pageNumber: 1, psNo: 'PS-11168.8', tag: 'Remove Guide', note: ':/PS-11168.8 Remove Guide', confidence: 'HIGH', targetPoint: { x: 100, y: 100 } } as any,
  },
  { 
    occurrenceId: 'occ-200', 
    status: 'unplaceable', 
    diagnostics: [],
    occurrence: { id: 'occ-200', pageNumber: 1, psNo: 'PS-11168.9', tag: 'Add Guide', note: ':/PS-11168.9 Add Guide', confidence: 'MEDIUM', targetPoint: { x: 400, y: 400 } } as any,
  },
];

describe('Layout-Bound Verification Core (Layer 4 - Audit Manifest)', () => {
  it('rejects manifest binding if review gate remains incomplete', () => {
    const state = initReviewState(1, mockResults);
    const verification = { passed: true, verifiedCount: 1, missingMarkerErrors: [], duplicateErrors: [], mismatchErrors: [], missingTextErrors: [] };
    expect(() => buildReviewAuditManifest(state, [validCallout], verification)).toThrow(/review commit gate requirements unsatisfied/);
  });

  it('rejects manifest binding if written page verification report failed', () => {
    let state = initReviewState(1, mockResults);
    state = suppressReviewItem(state, 'occ-200', 'Suppressed unplaceable');
    const committed = commitReviewState(state);

    const failedVerification = { passed: false, verifiedCount: 0, missingMarkerErrors: ['Missing marker'], duplicateErrors: [], mismatchErrors: [], missingTextErrors: [] };
    expect(() => buildReviewAuditManifest(state, committed, failedVerification)).toThrow(/verification core reported errors/);
  });

  it('binds review state, verified output, and v3 markers into an immutable audit manifest', () => {
    let state = initReviewState(1, mockResults);
    state = suppressReviewItem(state, 'occ-200', 'Suppressed');
    const committed = commitReviewState(state);

    const testMappingHash = `sha256:${'0'.repeat(64)}`;
    const marker = generateV3Marker(validCallout, testMappingHash);
    const visibleText = ['Tag: Remove Guide', 'ISO Note: :/PS-11168.8 Remove Guide (C=H)'];
    const verification = verifyWrittenPage(committed, [marker], visibleText, testMappingHash);

    const manifest = buildReviewAuditManifest(state, committed, verification, testMappingHash, 1722000000000);
    expect(manifest.manifestId).toMatch(/^MF-[a-f0-9]{8}-/);
    expect(manifest.pageNumber).toBe(1);
    expect(manifest.calloutCount).toBe(1);
    expect(manifest.unplaceableCount).toBe(1);
    expect(manifest.styleVersion).toBe('v1');
    expect(manifest.markers[0]).toBe(marker);
    expect(manifest.auditLog.length).toBeGreaterThanOrEqual(2); // init + suppress
  });
});
