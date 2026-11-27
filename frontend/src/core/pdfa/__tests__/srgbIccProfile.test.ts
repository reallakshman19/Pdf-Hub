import { describe, expect, it } from 'vitest';
import { buildSrgbIccProfile, inspectIccProfileHeader } from '../srgbIccProfile';

describe('srgbIccProfile', () => {
  it('builds a spec-valid ICC v2.1.0 sRGB profile with 4-byte aligned tags', () => {
    const icc = buildSrgbIccProfile();
    expect(icc.length % 4).toBe(0);
    expect(icc.length).toBeGreaterThan(2000);

    const summary = inspectIccProfileHeader(icc);
    expect(summary.valid).toBe(true);
    expect(summary.declaredSize).toBe(icc.length);
    expect(summary.versionMajor).toBe(2);
    expect(summary.versionMinor).toBe(1);
    expect(summary.deviceClass).toBe('mntr');
    expect(summary.colorSpace).toBe('RGB ');
    expect(summary.pcs).toBe('XYZ ');
    expect(summary.magic).toBe('acsp');
    expect(summary.componentCount).toBe(3);
    expect(summary.tags).toEqual(
      expect.arrayContaining(['desc', 'cprt', 'wtpt', 'bkpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC', 'chad']),
    );
  });

  it('rejects truncated or malformed ICC headers in inspectIccProfileHeader', () => {
    expect(inspectIccProfileHeader(new Uint8Array([1, 2, 3])).valid).toBe(false);
    const bad = buildSrgbIccProfile();
    bad[36] = 0x58; // corrupt 'acsp' magic
    expect(inspectIccProfileHeader(bad).valid).toBe(false);
  });
});
