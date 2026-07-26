export const PS_ISONOTE_TEXT_ADMISSION_POLICY_PROFILE_ID =
  'PS_ISONOTE_TEXT_ADMISSION_POLICY_V1' as const;
export const PS_ISONOTE_TEXT_ADMISSION_POLICY_AUTHORITY = 'OWNER_APPROVED' as const;

export interface PsIsonoteTextAdmissionLimits {
  readonly maxSourceUtf8Bytes: number;
  readonly maxLogicalRows: number;
  readonly maxColumnsPerRow: number;
  readonly maxCellUtf8Bytes: number;
  readonly maxUniqueMappings: number;
  readonly maxRetainedWarnings: number;
}

export interface PsIsonoteTextAdmissionPolicyV1 {
  readonly profileId: typeof PS_ISONOTE_TEXT_ADMISSION_POLICY_PROFILE_ID;
  readonly authority: typeof PS_ISONOTE_TEXT_ADMISSION_POLICY_AUTHORITY;
  readonly limits: PsIsonoteTextAdmissionLimits;
}

const APPROVED_LIMITS: PsIsonoteTextAdmissionLimits = Object.freeze({
  maxSourceUtf8Bytes: 1_048_576,
  maxLogicalRows: 5_000,
  maxColumnsPerRow: 16,
  maxCellUtf8Bytes: 16_384,
  maxUniqueMappings: 2_000,
  maxRetainedWarnings: 200,
});

export const PS_ISONOTE_TEXT_ADMISSION_POLICY_V1: PsIsonoteTextAdmissionPolicyV1 =
  Object.freeze({
    profileId: PS_ISONOTE_TEXT_ADMISSION_POLICY_PROFILE_ID,
    authority: PS_ISONOTE_TEXT_ADMISSION_POLICY_AUTHORITY,
    limits: APPROVED_LIMITS,
  });

export function createPsIsonoteTextAdmissionPolicyForTest(
  limits: Partial<PsIsonoteTextAdmissionLimits>,
): PsIsonoteTextAdmissionPolicyV1 {
  return Object.freeze({
    profileId: PS_ISONOTE_TEXT_ADMISSION_POLICY_PROFILE_ID,
    authority: PS_ISONOTE_TEXT_ADMISSION_POLICY_AUTHORITY,
    limits: Object.freeze({
      ...APPROVED_LIMITS,
      ...limits,
    }),
  });
}
