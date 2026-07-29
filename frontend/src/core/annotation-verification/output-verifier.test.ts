import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyProfessionalCalloutOutput } from './output-verifier';
import { PdfRendererAdapter } from '../../adapters/pdf-renderer/PdfRendererAdapter';
import { buildVectorCalloutPlan } from '../macro/psIsonote/professional/vectorCalloutPlan';

function installDocument(textItems: string[]) {
  const cleanup = vi.fn();
  const release = vi.fn().mockResolvedValue(undefined);

  vi.spyOn(PdfRendererAdapter, 'acquireDocument').mockResolvedValue({
    doc: {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({ cleanup }),
    } as never,
    release,
    cacheKey: 'mock',
  });

  vi.spyOn(PdfRendererAdapter, 'getPageTextItems').mockResolvedValue(
    textItems.map((text, index) => ({
      id: String(index),
      text,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fontSize: 10,
    })),
  );

  return { cleanup, release };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Output Verifier (professional callout write boundary)', () => {
  it('verifies visible callout text without requiring a marker written by a later recipe step', async () => {
    const plan = buildVectorCalloutPlan(
      'occ-99',
      'PS-555',
      'Valve Check',
      ':/PS-555 Valve Check',
      'HIGH',
      { x: 10, y: 10 },
      { x: 50, y: 50, width: 150 },
    );
    const { cleanup, release } = installDocument([
      'Tag: Valve Check',
      'ISO Note: :/PS-555 Valve Check',
    ]);

    const report = await verifyProfessionalCalloutOutput(
      new Uint8Array([1, 2, 3]),
      [plan],
      `sha256:${'a'.repeat(64)}`,
    );

    expect(report.passed).toBe(true);
    expect(report.verifiedCount).toBe(1);
    expect(report.missingMarkerErrors).toEqual([]);
    expect(report.missingTextErrors).toEqual([]);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('fails when the written callout is missing searchable visible text', async () => {
    const plan = buildVectorCalloutPlan(
      'occ-100',
      'PS-556',
      'Guide Check',
      ':/PS-556 Guide Check',
      'HIGH',
      { x: 10, y: 10 },
      { x: 50, y: 50, width: 150 },
    );
    installDocument(['Unrelated page text']);

    const report = await verifyProfessionalCalloutOutput(
      new Uint8Array([4, 5, 6]),
      [plan],
      `sha256:${'b'.repeat(64)}`,
    );

    expect(report.passed).toBe(false);
    expect(report.verifiedCount).toBe(0);
    expect(report.missingTextErrors).toHaveLength(1);
  });
});
