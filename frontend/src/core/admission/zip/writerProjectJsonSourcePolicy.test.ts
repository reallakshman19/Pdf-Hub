import { describe, expect, it } from 'vitest';
import { WRITER_PROJECT_MEMBER_PROFILE_V1 } from './writerProjectMemberProfile';
import { WRITER_PROJECT_JSON_SOURCE_POLICY_V1 } from './writerProjectJsonSourcePolicy';

// Temporary certification transition marker.
describe('WRITER_PROJECT_JSON_SOURCE_POLICY_V1', () => {
  it('freezes the exact owner-approved V1 limits', () => {
    const policy = WRITER_PROJECT_JSON_SOURCE_POLICY_V1;
    expect(policy.profileId).toBe('WRITER_PROJECT_JSON_SOURCE_POLICY_V1');
    expect(policy.authority).toBe('OWNER_APPROVED');
    expect(policy.pathByteLimits).toEqual({
      'manifest.json': 1_048_576,
      'writer-elements.json': 33_554_432,
      'writer-assets.json': 16_777_216,
      'writer-document-meta.json': 2_097_152,
      'ocr/manifest.json': 1_048_576,
      'ocr/result.json': 67_108_864,
      'ocr/corrections.json': 16_777_216,
      'ocr/regions.json': 16_777_216,
      'ocr/writer-insertion-queue.json': 33_554_432,
    });
    expect(policy.maxTotalJsonSourceBytes).toBe(100_663_296);
    expect(policy.utf8DecodeChunkBytes).toBe(262_144);
    expect(policy.maxJsonSourceCount).toBe(9);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.jsonSourceCatalog)).toBe(true);
    expect(Object.isFrozen(policy.pathByteLimits)).toBe(true);
  });

  it('keeps the JSON catalog consistent with the static member profile', () => {
    const expected = [
      ...WRITER_PROJECT_MEMBER_PROFILE_V1.requiredRootFiles,
      'writer-document-meta.json',
      ...WRITER_PROJECT_MEMBER_PROFILE_V1.ocrCompatibilityFiles,
    ];
    expect(WRITER_PROJECT_JSON_SOURCE_POLICY_V1.jsonSourceCatalog).toEqual(
      expected,
    );
    expect(WRITER_PROJECT_JSON_SOURCE_POLICY_V1.jsonSourceCatalog).not.toContain(
      'original.pdf',
    );
    expect(WRITER_PROJECT_JSON_SOURCE_POLICY_V1.jsonSourceCatalog).not.toContain(
      'assets/',
    );
  });
});
