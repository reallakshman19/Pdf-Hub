import { describe, expect, it } from 'vitest';
import { computeLayoutHash, generateV3Marker, parseV3Marker, verifyWrittenPage } from './verificationCore';
import { buildVectorCalloutPlan } from './vectorCalloutPlan';

const basePlan = buildVectorCalloutPlan(
  'occ-10',
  'PS-11168.8',
  'Remove Guide',
  ':/PS-11168.8 Remove Guide',
  'HIGH',
  { x: 100, y: 100 },
  { x: 150, y: 80, width: 200 },
);

describe('Layout-Bound Verification Core (Layer 4 - Verification)', () => {
  it('includes geometry, text, quality, and style within the layout hash', () => {
    const hashOriginal = computeLayoutHash(basePlan);

    // Change geometry
    const planGeom = { ...basePlan, box: { ...basePlan.box, x: 999 } };
    expect(computeLayoutHash(planGeom)).not.toBe(hashOriginal);

    // Change text
    const planText = { ...basePlan, note: 'Modified note text' };
    expect(computeLayoutHash(planText)).not.toBe(hashOriginal);

    // Change quality (confidence)
    const planConf = { ...basePlan, confidence: 'LOW' };
    expect(computeLayoutHash(planConf)).not.toBe(hashOriginal);

    // Change style
    const planStyle = { ...basePlan, style: { ...basePlan.style, isReview: true } };
    expect(computeLayoutHash(planStyle)).not.toBe(hashOriginal);
  });

  it('generates and parses v3 marker strictly matching identity contract', () => {
    const testHash = `sha256:${'a'.repeat(64)}`;
    const marker = generateV3Marker(basePlan, testHash);
    expect(marker).toMatch(new RegExp(`^PDFHUBISONOTE\\[v3\\|11168\\.8\\|${testHash}\\|occ-10\\|sha256:[a-f0-9]{64}\\|v1\\]$`));

    const parsed = parseV3Marker(marker);
    expect(parsed).toBeDefined();
    expect(parsed?.version).toBe('v3');
    expect(parsed?.psSuffix).toBe('11168.8');
    expect(parsed?.mappingHash).toBe(testHash);
    expect(parsed?.occurrenceId).toBe('occ-10');
    expect(parsed?.styleVersion).toBe('v1');
  });

  it('enforces that exactly one matching marker is required (detects duplicates and omissions)', () => {
    const validMarker = generateV3Marker(basePlan);
    const visibleText = ['Tag: Remove Guide', 'ISO Note: :/PS-11168.8 Remove Guide (C=H)'];

    // Missing marker
    const resMissing = verifyWrittenPage([basePlan], [], visibleText);
    expect(resMissing.passed).toBe(false);
    expect(resMissing.missingMarkerErrors).toHaveLength(1);

    // Duplicate markers
    const resDup = verifyWrittenPage([basePlan], [validMarker, validMarker], visibleText);
    expect(resDup.passed).toBe(false);
    expect(resDup.duplicateErrors).toHaveLength(1);

    // Exactly one
    const resValid = verifyWrittenPage([basePlan], [validMarker], visibleText);
    expect(resValid.passed).toBe(true);
  });

  it('enforces that marker success alone is insufficient when visible searchable text is absent', () => {
    const validMarker = generateV3Marker(basePlan);
    
    // Pass valid marker, but simulated PDF text extraction lacks the readable ISONOTE content!
    const resAbsentText = verifyWrittenPage([basePlan], [validMarker], ['Some unrelated background CAD drawing text']);
    
    expect(resAbsentText.passed).toBe(false);
    expect(resAbsentText.missingTextErrors).toHaveLength(1);
    expect(resAbsentText.missingTextErrors[0]).toContain('Marker verified for occ-10, but expected visible searchable text');
  });
});
