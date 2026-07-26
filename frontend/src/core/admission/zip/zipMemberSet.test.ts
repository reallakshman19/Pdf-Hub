import { describe, expect, it } from 'vitest';
import {
  ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID,
  freezeZipExtractionEvidence,
} from './zipExtractionEvidence';
import {
  BoundedZipMemberSet,
  BoundedZipMemberSetArchiveReader,
  releaseBoundedZipMemberSet,
} from './zipMemberSet';
import { WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1 } from './zipResourcePolicy';
import type { ZipArchiveMeasurements } from './zipTypes';

describe('bounded ZIP member-set archive reader', () => {
  it('does not expose mutable internal byte ownership', async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const memberSet = BoundedZipMemberSet.create([
      {
        ordinal: 0,
        path: 'member.bin',
        compressionMethod: 0,
        declaredCompressedBytes: 3,
        declaredUncompressedBytes: 3,
        actualExpandedBytes: 3,
        declaredCrc32: 0,
        actualCrc32: 0,
        bytes,
      },
    ], evidence());
    const reader = new BoundedZipMemberSetArchiveReader(memberSet);

    const first = await reader.readBytes('member.bin');
    first[0] = 99;
    expect(await reader.readBytes('member.bin')).toEqual(Uint8Array.from([1, 2, 3]));
    expect(reader.listPaths()).toEqual(['member.bin']);

    releaseBoundedZipMemberSet(memberSet);
    await expect(reader.readBytes('member.bin')).rejects.toThrow('no longer available');
  });

  it('fails closed on malformed UTF-8 with explicit extraction evidence', async () => {
    const memberSet = BoundedZipMemberSet.create([
      {
        ordinal: 4,
        path: 'manifest.json',
        compressionMethod: 0,
        declaredCompressedBytes: 2,
        declaredUncompressedBytes: 2,
        actualExpandedBytes: 2,
        declaredCrc32: 0,
        actualCrc32: 0,
        bytes: Uint8Array.from([0xc3, 0x28]),
      },
    ], evidence());
    const reader = new BoundedZipMemberSetArchiveReader(memberSet);

    await expect(reader.readText('manifest.json')).rejects.toMatchObject({
      outcome: 'REJECTED_UTF8',
      evidence: expect.objectContaining({
        archiveOutcome: 'REJECTED_UTF8',
        diagnostics: [expect.objectContaining({
          code: 'ZIP_MEMBER_UTF8_INVALID',
          entryOrdinals: [4],
        })],
      }),
    });
    releaseBoundedZipMemberSet(memberSet);
  });
});

function evidence() {
  const measurements: ZipArchiveMeasurements = {
    SOURCE_BYTES: 0,
    RAW_ENTRY_COUNT: 1,
    CENTRAL_DIRECTORY_BYTES: 0,
    TOTAL_COMPRESSED_BYTES_DECLARED: 0,
    TOTAL_UNCOMPRESSED_BYTES_DECLARED: 0,
    MAX_ENTRY_COMPRESSED_BYTES: 0,
    MAX_ENTRY_UNCOMPRESSED_BYTES: 0,
    MAX_DECLARED_COMPRESSION_RATIO: 0,
    FILENAME_BYTES_TOTAL: 0,
    EXTRA_FIELD_BYTES_TOTAL: 0,
    COMMENT_BYTES_TOTAL: 0,
  };
  return freezeZipExtractionEvidence({
    profileId: ZIP_BOUNDED_EXTRACTION_EVIDENCE_PROFILE_ID,
    policyProfileId: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.profileId,
    policyAuthority: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.authority,
    policyLimits: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.limits,
    sourceBytes: 0,
    rawEntryCount: 1,
    declaredArchiveMeasurements: measurements,
    declaredAdmissionOutcome: 'ADMITTED',
    memberEvidence: [],
    actualExpandedArchiveBytes: 0,
    peakActiveExtractionBytes: 0,
    largestOutputChunkBytes: 0,
    extractedMemberCount: 1,
    skippedDirectoryCount: 0,
    classifiedMemberCounts: {
      KNOWN_PROJECT_MEMBER: 1,
      ASSET_MEMBER: 0,
      OCR_COMPATIBILITY_MEMBER: 0,
      UNCLASSIFIED_MEMBER_POLICY_DEFERRED: 0,
    },
    diagnostics: [],
    archiveOutcome: 'ADMITTED',
  });
}
