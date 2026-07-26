import { describe, expect, it, vi } from 'vitest';
import type { ProjectArchiveReader } from './projectArchiveReader';
import type {
  AdmittedWriterProjectMemberInventory,
  WriterProjectMemberAdmissionOperation,
} from './writerProjectMemberAdmission';
import {
  freezeWriterProjectMemberAdmissionEvidence,
  type WriterProjectMemberAdmissionRecord,
} from './writerProjectMemberEvidence';
import {
  admitWriterProjectJsonSourcesForTest,
} from './writerProjectJsonSourceAdmission';
import { WriterProjectJsonSourceAdmissionError } from './writerProjectJsonSourceEvidence';
import {
  createWriterProjectJsonSourcePolicyForTest,
  type WriterProjectJsonSourcePath,
} from './writerProjectJsonSourcePolicy';
import {
  BoundedZipMemberSet,
  type BoundedZipMember,
} from './zipMemberSet';
import { freezeZipExtractionEvidence } from './zipExtractionEvidence';
import { WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1 } from './zipResourcePolicy';

describe('Writer project JSON source cancellation and profile evidence', () => {
  it('stops during metadata preflight before any source read', async () => {
    const fixture = makeFixture([
      ['manifest.json', utf8('{}')],
      ['writer-elements.json', utf8('[]')],
    ]);
    let checks = 0;

    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        reducedPolicy(),
        operation(() => {
          checks += 1;
          return checks !== 3;
        }),
      ),
    ).rejects.toMatchObject({
      outcome: 'STALE_OPERATION',
      evidence: {
        cancellationStage: 'after JSON source metadata ordinal 0',
      },
    });
    expect(fixture.readBytes).not.toHaveBeenCalled();
  });

  it('stops before the first UTF-8 decode and performs no read', async () => {
    const fixture = makeFixture([['manifest.json', utf8('{}')]]);
    let checks = 0;

    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        reducedPolicy(),
        operation(() => {
          checks += 1;
          return checks !== 5;
        }),
      ),
    ).rejects.toMatchObject({
      outcome: 'STALE_OPERATION',
      evidence: {
        cancellationStage: 'before UTF-8 decoding JSON source ordinal 0',
      },
    });
    expect(fixture.readBytes).not.toHaveBeenCalled();
  });

  it('cancels between UTF-8 chunks and exposes no source-set capability', async () => {
    const fixture = makeFixture([['manifest.json', utf8('{   }')]]);
    const controller = new AbortController();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let chunks = 0;
    const cancellingDecoder = {
      encoding: decoder.encoding,
      fatal: decoder.fatal,
      ignoreBOM: decoder.ignoreBOM,
      decode(
        input?: AllowSharedBufferSource,
        options?: TextDecodeOptions,
      ): string {
        const decoded = decoder.decode(input, options);
        if (options?.stream && ++chunks === 1) {
          controller.abort('cancel between UTF-8 chunks');
        }
        return decoded;
      },
    } as unknown as TextDecoder;

    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        reducedPolicy({ utf8DecodeChunkBytes: 2 }),
        operation(() => !controller.signal.aborted, controller.signal),
        { createTextDecoder: () => cancellingDecoder },
      ),
    ).rejects.toMatchObject({
      outcome: 'CANCELLED',
      evidence: {
        cancellationStage: 'after UTF-8 chunk for JSON source ordinal 0',
      },
    });
    expect(fixture.readBytes).toHaveBeenCalledOnce();
  });

  it('stops between admitted JSON members after releasing completed strings', async () => {
    const fixture = makeFixture([
      ['manifest.json', utf8('{}')],
      ['writer-elements.json', utf8('[]')],
    ]);
    let checks = 0;

    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        reducedPolicy({ utf8DecodeChunkBytes: 16 }),
        operation(() => {
          checks += 1;
          return checks !== 13;
        }),
      ),
    ).rejects.toMatchObject({
      outcome: 'STALE_OPERATION',
      evidence: {
        cancellationStage: 'before UTF-8 decoding JSON source ordinal 1',
        aggregateDecodedCodeUnits: 2,
      },
    });
    expect(fixture.readBytes).toHaveBeenCalledTimes(1);
  });

  it('retains metadata-only evidence when a later source fails UTF-8 admission', async () => {
    const fixture = makeFixture([
      ['manifest.json', utf8('{"private":"discard-me"}')],
      ['writer-elements.json', Uint8Array.from([0x80])],
    ]);

    try {
      await admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        reducedPolicy(),
      );
      throw new Error('expected fatal UTF-8 rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(WriterProjectJsonSourceAdmissionError);
      const evidence = (error as WriterProjectJsonSourceAdmissionError).evidence;
      expect(evidence.admissionOutcome).toBe('REJECTED_UTF8');
      expect(evidence.jsonSourceRecords[0].decodedCodeUnits).toBeGreaterThan(0);
      expect(evidence.jsonSourceRecords[1].utf8AdmissionOutcome).toBe(
        'REJECTED',
      );
      expect(JSON.stringify(evidence)).not.toContain('discard-me');
      expect(Object.isFrozen(evidence)).toBe(true);
    }
    expect(fixture.readBytes).toHaveBeenCalledTimes(2);
  });

  it('rejects profile and member identity mismatches before source reads', async () => {
    const fixture = makeFixture([['manifest.json', utf8('{}')]]);
    const mismatchedProfile = {
      ...fixture.memberAdmission,
      profileId: 'WRITER_PROJECT_MEMBER_PROFILE_V2',
    } as unknown as AdmittedWriterProjectMemberInventory;

    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        mismatchedProfile,
        fixture.reader,
        reducedPolicy(),
      ),
    ).rejects.toMatchObject({ outcome: 'REJECTED_PROFILE_MISMATCH' });

    const mismatchedMemberSet = {
      ...fixture.memberSet,
      members: Object.freeze([
        Object.freeze({ ...fixture.memberSet.members[0], ordinal: 99 }),
      ]),
    } as unknown as BoundedZipMemberSet;
    await expect(
      admitWriterProjectJsonSourcesForTest(
        mismatchedMemberSet,
        fixture.memberAdmission,
        fixture.reader,
        reducedPolicy(),
      ),
    ).rejects.toMatchObject({
      outcome: 'REJECTED_MEMBER_IDENTITY_MISMATCH',
    });
    expect(fixture.readBytes).not.toHaveBeenCalled();
  });
});

function makeFixture(
  inputs: readonly (readonly [WriterProjectJsonSourcePath, Uint8Array])[],
) {
  const ownedMembers: BoundedZipMember[] = inputs.map(
    ([path, bytes], ordinal) => ({
      ordinal,
      path,
      compressionMethod: 0,
      declaredCompressedBytes: bytes.byteLength,
      declaredUncompressedBytes: bytes.byteLength,
      actualExpandedBytes: bytes.byteLength,
      declaredCrc32: 0,
      actualCrc32: 0,
      bytes,
    }),
  );
  const extractionEvidence = freezeZipExtractionEvidence({
    profileId: 'ZIP_BOUNDED_EXTRACTION_EVIDENCE_V1',
    policyProfileId: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.profileId,
    policyAuthority: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.authority,
    policyLimits: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.limits,
    sourceBytes: ownedMembers.reduce(
      (total, member) => total + member.bytes.byteLength,
      0,
    ),
    rawEntryCount: inputs.length,
    declaredArchiveMeasurements: {
      SOURCE_BYTES: 0,
      RAW_ENTRY_COUNT: inputs.length,
      CENTRAL_DIRECTORY_BYTES: 0,
      TOTAL_COMPRESSED_BYTES_DECLARED: 0,
      TOTAL_UNCOMPRESSED_BYTES_DECLARED: 0,
      MAX_ENTRY_COMPRESSED_BYTES: 0,
      MAX_ENTRY_UNCOMPRESSED_BYTES: 0,
      MAX_DECLARED_COMPRESSION_RATIO: 0,
      FILENAME_BYTES_TOTAL: 0,
      EXTRA_FIELD_BYTES_TOTAL: 0,
      COMMENT_BYTES_TOTAL: 0,
    },
    declaredAdmissionOutcome: 'ADMITTED',
    memberEvidence: [],
    actualExpandedArchiveBytes: ownedMembers.reduce(
      (total, member) => total + member.actualExpandedBytes,
      0,
    ),
    peakActiveExtractionBytes: 0,
    largestOutputChunkBytes: 0,
    extractedMemberCount: ownedMembers.length,
    skippedDirectoryCount: 0,
    classifiedMemberCounts: {
      KNOWN_PROJECT_MEMBER: 0,
      ASSET_MEMBER: 0,
      OCR_COMPATIBILITY_MEMBER: 0,
      UNCLASSIFIED_MEMBER_POLICY_DEFERRED: 0,
    },
    diagnostics: [],
    archiveOutcome: 'ADMITTED',
  });
  const memberSet = BoundedZipMemberSet.create(ownedMembers, extractionEvidence);
  const records: WriterProjectMemberAdmissionRecord[] = inputs.map(
    ([path], ordinal) => ({
      ordinal,
      normalizedPath: path,
      decodedPath: path,
      directory: false,
      classification: path.startsWith('ocr/')
        ? 'OCR_COMPATIBILITY_MEMBER'
        : path === 'writer-document-meta.json'
          ? 'OPTIONAL_ROOT_MEMBER'
          : 'REQUIRED_ROOT_MEMBER',
      role: path,
      admissionOutcome: 'ADMITTED',
    }),
  );
  const memberAdmission: AdmittedWriterProjectMemberInventory = Object.freeze({
    profileId: 'WRITER_PROJECT_MEMBER_PROFILE_V1',
    members: Object.freeze(records.map((record) => Object.freeze(record))),
    evidence: freezeWriterProjectMemberAdmissionEvidence({
      evidenceProfileId: 'WRITER_PROJECT_MEMBER_ADMISSION_EVIDENCE_V1',
      profileId: 'WRITER_PROJECT_MEMBER_PROFILE_V1',
      profileAuthority: 'OWNER_APPROVED',
      sourceStructuralProfileId: 'ZIP_STRUCTURAL_ADMISSION_V1',
      sourceStructuralOutcome: 'ADMITTED',
      sourceExtractionPolicyProfileId:
        WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.profileId,
      rawEntryCount: records.length,
      memberRecords: records,
      classificationCounts: {
        REQUIRED_ROOT_MEMBER: records.filter(
          (record) => record.classification === 'REQUIRED_ROOT_MEMBER',
        ).length,
        OPTIONAL_ROOT_MEMBER: records.filter(
          (record) => record.classification === 'OPTIONAL_ROOT_MEMBER',
        ).length,
        ASSET_DIRECTORY: 0,
        ASSET_MEMBER: 0,
        OCR_DIRECTORY: 0,
        OCR_COMPATIBILITY_MEMBER: records.filter(
          (record) => record.classification === 'OCR_COMPATIBILITY_MEMBER',
        ).length,
        UNKNOWN_MEMBER: 0,
      },
      requiredRoleStatus: [],
      optionalRoleStatus: [],
      assetMemberCount: 0,
      ocrCompatibilityMemberCount: records.filter(
        (record) => record.classification === 'OCR_COMPATIBILITY_MEMBER',
      ).length,
      unknownMemberCount: 0,
      diagnostics: [],
      admissionOutcome: 'ADMITTED',
    }),
  });
  const byPath = new Map(ownedMembers.map((member) => [member.path, member.bytes]));
  const readBytes = vi.fn(async (path: string) => {
    const bytes = byPath.get(path);
    if (!bytes) throw new Error(`Archive missing file: ${path}`);
    return Uint8Array.from(bytes);
  });
  const reader: ProjectArchiveReader = {
    has: (path) => byPath.has(path),
    readBytes,
    readText: vi.fn(async () => {
      throw new Error('Phase 3B.3B owns JSON text decoding');
    }),
    listPaths: () => Object.freeze(inputs.map(([path]) => path)),
  };
  return { memberSet, memberAdmission, reader, readBytes };
}

function reducedPolicy(
  overrides: Parameters<
    typeof createWriterProjectJsonSourcePolicyForTest
  >[0] = {},
) {
  return createWriterProjectJsonSourcePolicyForTest({
    pathByteLimits: {
      'manifest.json': 1_024,
      'writer-elements.json': 1_024,
      'writer-assets.json': 1_024,
      'writer-document-meta.json': 1_024,
      'ocr/manifest.json': 1_024,
      'ocr/result.json': 1_024,
      'ocr/corrections.json': 1_024,
      'ocr/regions.json': 1_024,
      'ocr/writer-insertion-queue.json': 1_024,
    },
    maxTotalJsonSourceBytes: 8_192,
    utf8DecodeChunkBytes: 4,
    maxJsonSourceCount: 9,
    ...overrides,
  });
}

function operation(
  isCurrent: () => boolean,
  signal?: AbortSignal,
): WriterProjectMemberAdmissionOperation {
  return {
    operationId: 'phase3b3b-cancellation',
    generation: 1,
    ...(signal ? { signal } : {}),
    isCurrent,
    isMounted: () => true,
  };
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
