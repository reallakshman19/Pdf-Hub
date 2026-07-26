import { describe, expect, it, vi } from 'vitest';
import type { ProjectArchiveReader } from './projectArchiveReader';
import type { AdmittedWriterProjectMemberInventory } from './writerProjectMemberAdmission';
import {
  freezeWriterProjectMemberAdmissionEvidence,
  type WriterProjectMemberAdmissionRecord,
} from './writerProjectMemberEvidence';
import {
  admitWriterProjectJsonSourcesForTest,
} from './writerProjectJsonSourceAdmission';
import {
  createWriterProjectJsonSourcePolicyForTest,
  WRITER_PROJECT_JSON_SOURCE_POLICY_V1,
} from './writerProjectJsonSourcePolicy';
import { releaseAdmittedProjectJsonSources } from './writerProjectJsonSourceSet';
import {
  BoundedZipMemberSet,
  type BoundedZipMember,
} from './zipMemberSet';
import { freezeZipExtractionEvidence } from './zipExtractionEvidence';
import { WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1 } from './zipResourcePolicy';

const JSON_PATHS = [...WRITER_PROJECT_JSON_SOURCE_POLICY_V1.jsonSourceCatalog];

describe('Writer project JSON source admission', () => {
  it.each(JSON_PATHS)('enforces below/exact/over byte limits for %s', async (path) => {
    for (const [size, admitted] of [[3, true], [4, true], [5, false]] as const) {
      const fixture = makeFixture([{ path, bytes: spaces(size) }]);
      const policy = policyWith({
        pathByteLimits: {
          ...WRITER_PROJECT_JSON_SOURCE_POLICY_V1.pathByteLimits,
          [path]: 4,
        },
      });
      if (admitted) {
        const sources = await admitWriterProjectJsonSourcesForTest(
          fixture.memberSet,
          fixture.memberAdmission,
          fixture.reader,
          policy,
        );
        expect(sources.evidence.jsonSourceRecords[0].actualSourceBytes).toBe(size);
        expect(sources.evidence.admissionOutcome).toBe('ADMITTED');
        releaseAdmittedProjectJsonSources(sources);
      } else {
        await expect(
          admitWriterProjectJsonSourcesForTest(
            fixture.memberSet,
            fixture.memberAdmission,
            fixture.reader,
            policy,
          ),
        ).rejects.toMatchObject({ outcome: 'REJECTED_JSON_MEMBER_BYTES' });
        expect(fixture.readBytes).not.toHaveBeenCalled();
      }
    }
  });

  it.each([
    ['below', 3, 4, 8, true],
    ['exact', 4, 4, 8, true],
    ['over', 4, 5, 8, false],
  ] as const)('handles aggregate bytes %s the limit', async (_name, left, right, total, admitted) => {
    const fixture = makeFixture([
      { path: 'manifest.json', bytes: spaces(left) },
      { path: 'writer-elements.json', bytes: spaces(right) },
    ]);
    const policy = policyWith({
      pathByteLimits: {
        ...WRITER_PROJECT_JSON_SOURCE_POLICY_V1.pathByteLimits,
        'manifest.json': 8,
        'writer-elements.json': 8,
      },
      maxTotalJsonSourceBytes: total,
    });
    if (admitted) {
      const sources = await admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        policy,
      );
      expect(sources.evidence.aggregateJsonSourceBytes).toBe(left + right);
      releaseAdmittedProjectJsonSources(sources);
    } else {
      await expect(
        admitWriterProjectJsonSourcesForTest(
          fixture.memberSet,
          fixture.memberAdmission,
          fixture.reader,
          policy,
        ),
      ).rejects.toMatchObject({ outcome: 'REJECTED_TOTAL_JSON_BYTES' });
      expect(fixture.readBytes).not.toHaveBeenCalled();
    }
  });

  it('bounds JSON source count before any text read', async () => {
    const fixture = makeFixture([
      { path: 'manifest.json', bytes: spaces(1) },
      { path: 'writer-elements.json', bytes: spaces(1) },
    ]);
    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        policyWith({ maxJsonSourceCount: 1 }),
      ),
    ).rejects.toMatchObject({ outcome: 'REJECTED_JSON_SOURCE_COUNT' });
    expect(fixture.readBytes).not.toHaveBeenCalled();
  });

  it('ignores original PDF, assets, and directory markers', async () => {
    const fixture = makeFixture([
      { path: 'manifest.json', bytes: utf8('{}') },
      { path: 'original.pdf', bytes: Uint8Array.from([0x25, 0x50]), classification: 'OPTIONAL_ROOT_MEMBER' },
      { path: 'assets/', bytes: new Uint8Array(), classification: 'ASSET_DIRECTORY', directory: true },
      { path: 'assets/image.bin', bytes: Uint8Array.from([0xff]), classification: 'ASSET_MEMBER' },
      { path: 'ocr/', bytes: new Uint8Array(), classification: 'OCR_DIRECTORY', directory: true },
    ]);
    const sources = await admitWriterProjectJsonSourcesForTest(
      fixture.memberSet,
      fixture.memberAdmission,
      fixture.reader,
      policyWith({}),
    );
    expect(sources.sources.map((source) => source.path)).toEqual(['manifest.json']);
    expect(fixture.readBytes).toHaveBeenCalledTimes(1);
    expect(fixture.readBytes).toHaveBeenCalledWith('manifest.json');
    releaseAdmittedProjectJsonSources(sources);
  });

  it.each([
    ['ASCII', utf8('{"ok":true}'), true],
    ['multibyte', utf8('{"text":"مرحبا"}'), true],
    ['supplementary', utf8('{"emoji":"😀"}'), true],
    ['BOM', Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('{}')]), true],
    ['malformed continuation', Uint8Array.from([0x7b, 0x80, 0x7d]), false],
    ['truncated sequence', Uint8Array.from([0x7b, 0xe2, 0x82]), false],
    ['overlong encoding', Uint8Array.from([0xc0, 0xaf]), false],
    ['UTF-16LE', Uint8Array.from([0xff, 0xfe, 0x7b, 0x00, 0x7d, 0x00]), false],
    ['late invalid chunk', Uint8Array.from([0x7b, 0x20, 0x20, 0x20, 0x80, 0x7d]), false],
  ] as const)('performs fatal chunked UTF-8 admission for %s', async (name, bytes, admitted) => {
    const fixture = makeFixture([{ path: 'manifest.json', bytes }]);
    const policy = policyWith({ utf8DecodeChunkBytes: 2 });
    if (admitted) {
      const sources = await admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        policy,
      );
      expect(await sources.reader.readText('manifest.json')).toBe(
        new TextDecoder().decode(bytes),
      );
      expect(sources.evidence.utf8BomCount).toBe(name === 'BOM' ? 1 : 0);
      releaseAdmittedProjectJsonSources(sources);
    } else {
      await expect(
        admitWriterProjectJsonSourcesForTest(
          fixture.memberSet,
          fixture.memberAdmission,
          fixture.reader,
          policy,
        ),
      ).rejects.toMatchObject({ outcome: 'REJECTED_UTF8' });
    }
  });

  it('reads and decodes every JSON source exactly once and retains metadata-only evidence', async () => {
    const fixture = makeFixture([
      { path: 'manifest.json', bytes: utf8('{}') },
      { path: 'writer-elements.json', bytes: utf8('[]') },
      { path: 'writer-assets.json', bytes: utf8('[]') },
    ]);
    const decoderFactory = vi.fn(
      () => new TextDecoder('utf-8', { fatal: true }),
    );
    const sources = await admitWriterProjectJsonSourcesForTest(
      fixture.memberSet,
      fixture.memberAdmission,
      fixture.reader,
      policyWith({}),
      undefined,
      { createTextDecoder: decoderFactory },
    );

    expect(fixture.readBytes).toHaveBeenCalledTimes(3);
    expect(decoderFactory).toHaveBeenCalledTimes(3);
    expect(await sources.reader.readText('manifest.json')).toBe('{}');
    expect(await sources.reader.readText('manifest.json')).toBe('{}');
    expect(fixture.readBytes).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(sources.evidence)).not.toContain('{}');
    expect(Object.isFrozen(sources.evidence)).toBe(true);
    expect(Object.isFrozen(sources.evidence.jsonSourceRecords[0])).toBe(true);
    releaseAdmittedProjectJsonSources(sources);
  });

  it('rejects missing or inconsistent bounded metadata before reads', async () => {
    const fixture = makeFixture([{ path: 'manifest.json', bytes: utf8('{}') }]);
    const missing = {
      ...fixture.memberSet,
      members: Object.freeze([]),
    } as unknown as BoundedZipMemberSet;
    await expect(
      admitWriterProjectJsonSourcesForTest(
        missing,
        fixture.memberAdmission,
        fixture.reader,
        policyWith({}),
      ),
    ).rejects.toMatchObject({ outcome: 'REJECTED_MEMBER_METADATA_MISSING' });
    expect(fixture.readBytes).not.toHaveBeenCalled();
  });

  it('cancels before admission and clears completed strings when superseded between members', async () => {
    const fixture = makeFixture([
      { path: 'manifest.json', bytes: utf8('{}') },
      { path: 'writer-elements.json', bytes: utf8('[]') },
    ]);
    const controller = new AbortController();
    controller.abort('cancel before admission');
    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        policyWith({}),
        operation(controller.signal),
      ),
    ).rejects.toMatchObject({ outcome: 'CANCELLED' });
    expect(fixture.readBytes).not.toHaveBeenCalled();

    let reads = 0;
    const supersededReader: ProjectArchiveReader = {
      ...fixture.reader,
      readBytes: vi.fn(async (path) => {
        reads += 1;
        const value = await fixture.reader.readBytes(path);
        if (reads === 1) controllerForSupersession.abort('superseded by newer operation');
        return value;
      }),
    };
    const controllerForSupersession = new AbortController();
    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        supersededReader,
        policyWith({ utf8DecodeChunkBytes: 1 }),
        operation(controllerForSupersession.signal),
      ),
    ).rejects.toMatchObject({ outcome: 'STALE_OPERATION' });
  });

  it('cancels after decoding but before registration without exposing strings', async () => {
    const fixture = makeFixture([{ path: 'manifest.json', bytes: utf8('{}') }]);
    const controller = new AbortController();
    await expect(
      admitWriterProjectJsonSourcesForTest(
        fixture.memberSet,
        fixture.memberAdmission,
        fixture.reader,
        policyWith({}),
        operation(controller.signal),
        {
          beforeSourceSetRegistration: () => controller.abort('cancel before registration'),
        },
      ),
    ).rejects.toMatchObject({ outcome: 'CANCELLED' });
  });
});

function policyWith(
  overrides: Parameters<typeof createWriterProjectJsonSourcePolicyForTest>[0],
) {
  return createWriterProjectJsonSourcePolicyForTest(overrides);
}

function makeFixture(
  inputs: readonly {
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly classification?: WriterProjectMemberAdmissionRecord['classification'];
    readonly directory?: boolean;
  }[],
) {
  const ownedMembers: BoundedZipMember[] = inputs
    .filter((input) => !input.directory)
    .map((input, ordinal) => ({
      ordinal,
      path: input.path,
      compressionMethod: 0,
      declaredCompressedBytes: input.bytes.byteLength,
      declaredUncompressedBytes: input.bytes.byteLength,
      actualExpandedBytes: input.bytes.byteLength,
      declaredCrc32: 0,
      actualCrc32: 0,
      bytes: input.bytes,
    }));
  const extractionEvidence = freezeZipExtractionEvidence({
    profileId: 'ZIP_BOUNDED_EXTRACTION_EVIDENCE_V1',
    policyProfileId: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.profileId,
    policyAuthority: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.authority,
    policyLimits: WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.limits,
    sourceBytes: ownedMembers.reduce((total, member) => total + member.bytes.byteLength, 0),
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
    skippedDirectoryCount: inputs.filter((input) => input.directory).length,
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
  const records: WriterProjectMemberAdmissionRecord[] = inputs.map((input, ordinal) => ({
    ordinal,
    normalizedPath: input.path,
    decodedPath: input.path,
    directory: Boolean(input.directory),
    classification: input.classification ?? classificationFor(input.path),
    role: input.path,
    admissionOutcome: 'ADMITTED',
  }));
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
        REQUIRED_ROOT_MEMBER: records.filter((record) => record.classification === 'REQUIRED_ROOT_MEMBER').length,
        OPTIONAL_ROOT_MEMBER: records.filter((record) => record.classification === 'OPTIONAL_ROOT_MEMBER').length,
        ASSET_DIRECTORY: records.filter((record) => record.classification === 'ASSET_DIRECTORY').length,
        ASSET_MEMBER: records.filter((record) => record.classification === 'ASSET_MEMBER').length,
        OCR_DIRECTORY: records.filter((record) => record.classification === 'OCR_DIRECTORY').length,
        OCR_COMPATIBILITY_MEMBER: records.filter((record) => record.classification === 'OCR_COMPATIBILITY_MEMBER').length,
        UNKNOWN_MEMBER: 0,
      },
      requiredRoleStatus: [],
      optionalRoleStatus: [],
      assetMemberCount: records.filter((record) => record.classification === 'ASSET_MEMBER').length,
      ocrCompatibilityMemberCount: records.filter((record) => record.classification === 'OCR_COMPATIBILITY_MEMBER').length,
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
      throw new Error('text reads must be owned by Phase 3B.3B');
    }),
    listPaths: () => Object.freeze(inputs.map((input) => input.path)),
  };
  return { memberSet, memberAdmission, reader, readBytes };
}

function classificationFor(path: string): WriterProjectMemberAdmissionRecord['classification'] {
  if (path.startsWith('ocr/')) return 'OCR_COMPATIBILITY_MEMBER';
  if (path === 'writer-document-meta.json' || path === 'original.pdf') {
    return 'OPTIONAL_ROOT_MEMBER';
  }
  if (path.startsWith('assets/')) return 'ASSET_MEMBER';
  return 'REQUIRED_ROOT_MEMBER';
}

function operation(signal?: AbortSignal) {
  return {
    operationId: 'phase3b3b-test',
    generation: 1,
    ...(signal ? { signal } : {}),
    isCurrent: () => !signal?.aborted,
    isMounted: () => true,
  };
}

function spaces(length: number): Uint8Array {
  return Uint8Array.from({ length }, () => 0x20);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
