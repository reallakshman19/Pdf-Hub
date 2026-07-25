import type {
  AdmissionDiagnostic,
  AdmissionMetric,
  AdmissionPolicy,
  AdmissionPolicyAuthority,
  AdmissionProfileId,
  ArchivePathPolicy,
} from './types';

export interface CreateAdmissionPolicyInput {
  readonly profileId: AdmissionProfileId;
  readonly policyVersion: string;
  readonly authority: AdmissionPolicyAuthority;
  readonly limits?: Readonly<Partial<Record<AdmissionMetric, number>>>;
  readonly archivePath: ArchivePathPolicy;
}

export function createAdmissionPolicy(
  input: CreateAdmissionPolicyInput,
): AdmissionPolicy {
  const policy: AdmissionPolicy = {
    profileId: input.profileId,
    policyVersion: input.policyVersion.trim(),
    authority: { ...input.authority },
    limits: { ...(input.limits ?? {}) },
    archivePath: { ...input.archivePath },
  };

  const diagnostics = validateAdmissionPolicy(policy);
  const firstError = diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (firstError) {
    throw new Error(firstError.message);
  }

  return Object.freeze({
    ...policy,
    authority: Object.freeze({ ...policy.authority }),
    limits: Object.freeze({ ...policy.limits }),
    archivePath: Object.freeze({ ...policy.archivePath }),
  });
}

export function validateAdmissionPolicy(
  policy: AdmissionPolicy,
): AdmissionDiagnostic[] {
  const diagnostics: AdmissionDiagnostic[] = [];

  if (policy.policyVersion.trim().length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'POLICY_LIMIT_INVALID',
      phase: 'VALIDATION',
      message: `Admission profile ${policy.profileId} has no policy version.`,
    });
  }

  const authorityError = validatePolicyAuthority(policy.authority);
  if (authorityError) diagnostics.push(authorityError);

  for (const [metric, limit] of Object.entries(policy.limits)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    if (!Number.isFinite(limit) || limit < 0) {
      diagnostics.push({
        severity: 'error',
        code: 'POLICY_LIMIT_INVALID',
        phase: 'VALIDATION',
        message: `Admission limit ${metric} must be a finite non-negative number.`,
      });
    }
  }

  return diagnostics;
}

export function requireAdmissionLimit(
  policy: AdmissionPolicy,
  metric: AdmissionMetric,
  unit: 'bytes' | 'count' | 'pixels' | 'ratio' | 'points' | 'nodes',
): number | AdmissionDiagnostic {
  const limit = policy.limits[metric];
  if (limit === undefined) {
    return {
      severity: 'error',
      code: 'POLICY_LIMIT_UNCONFIGURED',
      phase: 'VALIDATION',
      message: `Admission profile ${policy.profileId} does not configure ${metric} in ${unit}.`,
    };
  }
  return limit;
}

export function evaluateAdmissionMetric(
  policy: AdmissionPolicy,
  metric: AdmissionMetric,
  actual: number,
  unit: 'bytes' | 'count' | 'pixels' | 'ratio' | 'points' | 'nodes',
): AdmissionDiagnostic | null {
  if (!Number.isFinite(actual) || actual < 0) {
    return {
      severity: 'error',
      code: 'ADMISSION_MEASUREMENT_INVALID',
      phase: 'CONTENT_MEASUREMENT',
      message: `${metric} must be a finite non-negative measurement.`,
      measured: {
        metric,
        actual,
        unit,
      },
    };
  }

  const configured = requireAdmissionLimit(policy, metric, unit);
  if (typeof configured !== 'number') return configured;
  if (actual <= configured) return null;

  return {
    severity: 'error',
    code: 'POLICY_LIMIT_EXCEEDED',
    phase: 'CONTENT_MEASUREMENT',
    message: `${metric} measured ${actual} ${unit}; limit is ${configured}.`,
    measured: {
      metric,
      actual,
      limit: configured,
      unit,
    },
  };
}

function validatePolicyAuthority(
  authority: AdmissionPolicyAuthority,
): AdmissionDiagnostic | null {
  const value = authority.kind === 'EXISTING_SOURCE_POLICY'
    ? authority.sourceId
    : authority.kind === 'OWNER_APPROVED_GLOBAL_POLICY'
      ? authority.authorityId
      : authority.reason;

  if (value.trim().length > 0) return null;

  return {
    severity: 'error',
    code: 'POLICY_AUTHORITY_INVALID',
    phase: 'VALIDATION',
    message: `Admission policy authority ${authority.kind} requires a non-empty reference.`,
  };
}
