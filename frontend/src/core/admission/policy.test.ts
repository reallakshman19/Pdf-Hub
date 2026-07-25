import { describe, expect, it } from 'vitest';
import {
  createAdmissionPolicy,
  evaluateAdmissionMetric,
  requireAdmissionLimit,
} from './policy';

function policy() {
  return createAdmissionPolicy({
    profileId: 'OPEN_PDF',
    policyVersion: 'file-adapter-compat-v1',
    authority: {
      kind: 'EXISTING_SOURCE_POLICY',
      sourceId: 'frontend/src/adapters/file/FileAdapter.ts#MAX_SIZE_MB',
    },
    limits: {
      SOURCE_BYTES: 100,
    },
    archivePath: {
      caseMode: 'sensitive',
      unicodeMode: 'preserve',
    },
  });
}

describe('admission policy', () => {
  it('preserves the authority classification', () => {
    expect(policy().authority).toEqual({
      kind: 'EXISTING_SOURCE_POLICY',
      sourceId: 'frontend/src/adapters/file/FileAdapter.ts#MAX_SIZE_MB',
    });
  });

  it('does not invent a missing limit', () => {
    const result = requireAdmissionLimit(policy(), 'PDF_PAGE_COUNT', 'count');

    expect(result).toMatchObject({
      code: 'POLICY_LIMIT_UNCONFIGURED',
      severity: 'error',
    });
  });

  it('accepts a value equal to the configured limit', () => {
    expect(evaluateAdmissionMetric(
      policy(),
      'SOURCE_BYTES',
      100,
      'bytes',
    )).toBeNull();
  });

  it('returns measured evidence when a configured limit is exceeded', () => {
    expect(evaluateAdmissionMetric(
      policy(),
      'SOURCE_BYTES',
      101,
      'bytes',
    )).toMatchObject({
      code: 'POLICY_LIMIT_EXCEEDED',
      measured: {
        actual: 101,
        limit: 100,
      },
    });
  });

  it('rejects invalid measurements', () => {
    expect(evaluateAdmissionMetric(
      policy(),
      'SOURCE_BYTES',
      Number.NaN,
      'bytes',
    )).toMatchObject({
      code: 'ADMISSION_MEASUREMENT_INVALID',
    });
  });

  it('rejects invalid configured limits', () => {
    expect(() => createAdmissionPolicy({
      profileId: 'OPEN_PDF',
      policyVersion: 'invalid',
      authority: {
        kind: 'OWNER_APPROVED_GLOBAL_POLICY',
        authorityId: 'test-owner',
      },
      limits: {
        SOURCE_BYTES: Number.NaN,
      },
      archivePath: {
        caseMode: 'sensitive',
        unicodeMode: 'preserve',
      },
    })).toThrow('must be a finite non-negative number');
  });

  it('rejects an empty authority reference', () => {
    expect(() => createAdmissionPolicy({
      profileId: 'OPEN_PDF',
      policyVersion: 'invalid-authority',
      authority: {
        kind: 'UNRESOLVED_POLICY',
        reason: ' ',
      },
      archivePath: {
        caseMode: 'sensitive',
        unicodeMode: 'preserve',
      },
    })).toThrow('requires a non-empty reference');
  });
});
