import { describe, expect, it } from 'vitest';
import {
  WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
} from './zipResourcePolicy';

describe('Writer project ZIP resource policy V1', () => {
  it('retains the exact owner-approved closed values', () => {
    expect(WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1).toEqual({
      profileId: 'WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1',
      authority: 'OWNER_APPROVED',
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
  });

  it('is deeply immutable', () => {
    expect(Object.isFrozen(WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1)).toBe(true);
    expect(Object.isFrozen(WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.limits)).toBe(true);
  });
});
