import { describe, expect, it } from 'vitest';
import {
  createPsIsonoteTextAdmissionPolicyForTest,
  PS_ISONOTE_TEXT_ADMISSION_POLICY_V1,
} from './psIsonoteTextAdmissionPolicy';

describe('PS ISONOTE text admission policy', () => {
  it('freezes the exact owner-approved V1 limits', () => {
    expect(PS_ISONOTE_TEXT_ADMISSION_POLICY_V1).toEqual({
      profileId: 'PS_ISONOTE_TEXT_ADMISSION_POLICY_V1',
      authority: 'OWNER_APPROVED',
      limits: {
        maxSourceUtf8Bytes: 1_048_576,
        maxLogicalRows: 5_000,
        maxColumnsPerRow: 16,
        maxCellUtf8Bytes: 16_384,
        maxUniqueMappings: 2_000,
        maxRetainedWarnings: 200,
      },
    });
    expect(Object.isFrozen(PS_ISONOTE_TEXT_ADMISSION_POLICY_V1)).toBe(true);
    expect(Object.isFrozen(PS_ISONOTE_TEXT_ADMISSION_POLICY_V1.limits)).toBe(true);
    expect(() => {
      (PS_ISONOTE_TEXT_ADMISSION_POLICY_V1.limits as { maxLogicalRows: number })
        .maxLogicalRows = 1;
    }).toThrow();
  });

  it('keeps reduced policies isolated to the test factory', () => {
    const reduced = createPsIsonoteTextAdmissionPolicyForTest({ maxLogicalRows: 2 });
    expect(reduced.limits.maxLogicalRows).toBe(2);
    expect(PS_ISONOTE_TEXT_ADMISSION_POLICY_V1.limits.maxLogicalRows).toBe(5_000);
    expect(Object.isFrozen(reduced)).toBe(true);
    expect(Object.isFrozen(reduced.limits)).toBe(true);
  });
});
