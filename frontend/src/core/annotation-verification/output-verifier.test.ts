import { describe, expect, it, vi } from 'vitest';
import { verifyProfessionalCalloutOutput } from './output-verifier';
import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import { buildVectorCalloutPlan } from '../macro/psIsonote/professional/vectorCalloutPlan';
import { generateV3Marker } from '../macro/psIsonote/professional/verificationCore';

describe('Output Verifier (Phase D - Verification Hardening)', () => {
  it('verifies callouts by acquiring document and parsing visible text and markers (AD-07)', async () => {
    const plan = buildVectorCalloutPlan(
      'occ-99',
      'PS-555',
      'Valve Check',
      ':/PS-555 Valve Check',
      'HIGH',
      { x: 10, y: 10 },
      { x: 50, y: 50, width: 150 }
    );

    const testHash = `sha256:${'a'.repeat(64)}`;
    const validMarker = generateV3Marker(plan, testHash);

    const mockDoc = {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        cleanup: vi.fn(),
      }),
    };

    vi.spyOn(PdfRendererAdapter, 'acquireDocument').mockResolvedValue({
      doc: mockDoc as any,
      release: vi.fn().mockResolvedValue(undefined),
      cacheKey: 'mock',
    });

    vi.spyOn(PdfRendererAdapter, 'getPageTextItems').mockResolvedValue([
      { id: '1', text: validMarker, x: 0, y: 0, width: 0, height: 0, fontSize: 0 },
      { id: '2', text: 'Tag: Valve Check', x: 50, y: 50, width: 100, height: 10, fontSize: 10 },
      { id: '3', text: 'ISO Note: :/PS-555 Valve Check (C=H)', x: 50, y: 60, width: 100, height: 10, fontSize: 10 },
    ]);

    const dummyBytes = new Uint8Array([1, 2, 3]);
    const report = await verifyProfessionalCalloutOutput(dummyBytes, [plan], testHash);

    expect(report.passed).toBe(true);
    expect(report.verifiedCount).toBe(1);
    expect(report.missingMarkerErrors).toHaveLength(0);
    expect(report.missingTextErrors).toHaveLength(0);

    vi.restoreAllMocks();
  });
});
