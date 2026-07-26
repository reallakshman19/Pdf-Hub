export const WRITER_PROJECT_ZIP_RESOURCE_POLICY_PROFILE_ID =
  'WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1' as const;

export const WRITER_PROJECT_ZIP_RESOURCE_POLICY_AUTHORITY = 'OWNER_APPROVED' as const;

export interface ZipResourceLimits {
  readonly MAX_SOURCE_ARCHIVE_BYTES: number;
  readonly MAX_RAW_ENTRY_COUNT: number;
  readonly MAX_ENTRY_COMPRESSED_BYTES: number;
  readonly MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: number;
  readonly MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: number;
  readonly MAX_DECLARED_ENTRY_COMPRESSION_RATIO: number;
  readonly MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO: number;
  readonly MAX_ACTUAL_EXPANDED_MEMBER_BYTES: number;
  readonly MAX_ACTUAL_EXPANDED_ARCHIVE_BYTES: number;
  readonly MAX_ACTIVE_EXTRACTION_BYTES: number;
  readonly MAX_INFLATE_OUTPUT_CHUNK_BYTES: number;
  readonly COMPRESSED_INPUT_CHUNK_BYTES: number;
}

export interface ZipResourcePolicyV1 {
  readonly profileId: typeof WRITER_PROJECT_ZIP_RESOURCE_POLICY_PROFILE_ID;
  readonly authority: typeof WRITER_PROJECT_ZIP_RESOURCE_POLICY_AUTHORITY;
  readonly limits: ZipResourceLimits;
}

export const WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1: ZipResourcePolicyV1 = deepFreeze({
  profileId: WRITER_PROJECT_ZIP_RESOURCE_POLICY_PROFILE_ID,
  authority: WRITER_PROJECT_ZIP_RESOURCE_POLICY_AUTHORITY,
  limits: {
    MAX_SOURCE_ARCHIVE_BYTES: 167_772_160,
    MAX_RAW_ENTRY_COUNT: 2_048,
    MAX_ENTRY_COMPRESSED_BYTES: 134_217_728,
    MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: 134_217_728,
    MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: 268_435_456,
    MAX_DECLARED_ENTRY_COMPRESSION_RATIO: 200,
    MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO: 100,
    MAX_ACTUAL_EXPANDED_MEMBER_BYTES: 134_217_728,
    MAX_ACTUAL_EXPANDED_ARCHIVE_BYTES: 268_435_456,
    MAX_ACTIVE_EXTRACTION_BYTES: 150_994_944,
    MAX_INFLATE_OUTPUT_CHUNK_BYTES: 1_048_576,
    COMPRESSED_INPUT_CHUNK_BYTES: 262_144,
  },
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
