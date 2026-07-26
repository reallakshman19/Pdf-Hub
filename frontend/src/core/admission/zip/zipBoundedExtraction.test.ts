import { describe, expect, it, vi } from 'vitest';
import { Inflate, deflateSync } from 'fflate';
import { buildRawZipFixture } from './__tests__/zipFixtureBuilder';
import { inspectZipArchive } from './zipInventory';
import { admitZipArchive } from './zipAdmission';
import { admitDeclaredZipResources } from './zipDeclaredResourceAdmission';
import {
  extractZipMembersBounded,
  type ZipExtractionOperation,
  type ZipInflaterFactory,
} from './zipBoundedExtraction';
import { computeZipCrc32 } from './zipCrc32';
import {
  BoundedZipMemberSetArchiveReader,
  releaseBoundedZipMemberSet,
} from './zipMemberSet';
import { ZipBoundedExtractionError } from './zipExtractionEvidence';
import {
  WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
  type ZipResourceLimits,
  type ZipResourcePolicyV1,
} from './zipResourcePolicy';

describe('sequential bounded ZIP extraction', () => {
  it('extracts stored and DEFLATE members with actual byte and CRC evidence', async () => {
    const stored = Uint8Array.from([1, 2, 3, 4]);
    const deflated = new TextEncoder().encode('bounded deflate output');
    const compressed = deflateSync(deflated);
    const fixture = buildRawZipFixture([
      {
        name: 'stored.bin',
        method: 0,
        data: stored,
        crc32: computeZipCrc32(stored),
      },
      {
        name: 'deflated.bin',
        method: 8,
        data: compressed,
        uncompressedSize: deflated.byteLength,
        crc32: computeZipCrc32(deflated),
      },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy();
    const result = await extractZipMembersBounded(
      fixture.bytes,
      inventory,
      admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
      currentOperation(),
      { policy },
    );
    const reader = new BoundedZipMemberSetArchiveReader(result.memberSet);

    expect(await reader.readBytes('stored.bin')).toEqual(stored);
    expect(await reader.readBytes('deflated.bin')).toEqual(deflated);
    expect(result.evidence.archiveOutcome).toBe('ADMITTED');
    expect(result.evidence.actualExpandedArchiveBytes).toBe(
      stored.byteLength + deflated.byteLength,
    );
    expect(result.evidence.memberEvidence.map((member) => member.outcome)).toEqual([
      'EXTRACTED',
      'EXTRACTED',
    ]);
    expect(result.evidence.memberEvidence.map((member) => member.actualCrc32)).toEqual([
      computeZipCrc32(stored),
      computeZipCrc32(deflated),
    ]);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.evidence.memberEvidence[0])).toBe(true);

    const mutableCopy = await reader.readBytes('stored.bin');
    mutableCopy[0] = 99;
    expect(await reader.readBytes('stored.bin')).toEqual(stored);
    releaseBoundedZipMemberSet(result.memberSet);
  });

  it('skips directories and extracts unknown regular members under aggregate limits', async () => {
    const unknown = Uint8Array.from([7, 8]);
    const fixture = buildRawZipFixture([
      { name: 'folder/', method: 0, data: [], crc32: 0 },
      { name: 'folder/unknown.bin', method: 0, data: unknown, crc32: computeZipCrc32(unknown) },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy();
    const result = await extractZipMembersBounded(
      fixture.bytes,
      inventory,
      admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
      currentOperation(),
      { policy },
    );

    expect(result.evidence.skippedDirectoryCount).toBe(1);
    expect(result.evidence.extractedMemberCount).toBe(1);
    expect(result.evidence.memberEvidence[1]?.classification).toBe(
      'UNCLASSIFIED_MEMBER_POLICY_DEFERRED',
    );
    releaseBoundedZipMemberSet(result.memberSet);
  });

  it('terminates when actual expansion exceeds a truthful policy despite a false ZIP declaration', async () => {
    const actual = new TextEncoder().encode('A'.repeat(64));
    const compressed = deflateSync(actual);
    const fixture = buildRawZipFixture([
      {
        name: 'bomb.bin',
        method: 8,
        data: compressed,
        uncompressedSize: 32,
        crc32: computeZipCrc32(actual),
      },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy({
      MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: 32,
      MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: 32,
      MAX_ACTUAL_EXPANDED_MEMBER_BYTES: 32,
      MAX_ACTUAL_EXPANDED_ARCHIVE_BYTES: 64,
      MAX_ACTIVE_EXTRACTION_BYTES: 96,
    });

    await expect(
      extractZipMembersBounded(
        fixture.bytes,
        inventory,
        admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
        currentOperation(),
        { policy },
      ),
    ).rejects.toMatchObject({
      outcome: 'REJECTED_ACTUAL_MEMBER_BYTES',
    });
  });

  it('rejects aggregate actual expansion before finalizing the failing member', async () => {
    const first = Uint8Array.from([1, 2, 3, 4]);
    const second = Uint8Array.from([5, 6, 7, 8]);
    const fixture = buildRawZipFixture([
      { name: 'first.bin', data: first, crc32: computeZipCrc32(first) },
      { name: 'second.bin', data: second, crc32: computeZipCrc32(second) },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy({
      MAX_ACTUAL_EXPANDED_ARCHIVE_BYTES: 6,
    });

    try {
      await extractZipMembersBounded(
        fixture.bytes,
        inventory,
        admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
        currentOperation(),
        { policy },
      );
      throw new Error('Expected actual archive rejection.');
    } catch (error) {
      expect(error).toBeInstanceOf(ZipBoundedExtractionError);
      const evidence = (error as ZipBoundedExtractionError).evidence;
      expect(evidence.archiveOutcome).toBe('REJECTED_ACTUAL_ARCHIVE_BYTES');
      expect(evidence.extractedMemberCount).toBe(1);
      expect(evidence.memberEvidence.at(-1)?.outcome).toBe(
        'REJECTED_ACTUAL_ARCHIVE_BYTES',
      );
      expect(evidence.memberEvidence.at(-1)?.actualExpandedBytes).toBe(0);
    }
  });

  it('rejects an oversized inflater output chunk before retention', async () => {
    const compressed = Uint8Array.from([1]);
    const declared = new Uint8Array(5);
    const fixture = buildRawZipFixture([
      {
        name: 'chunk.bin',
        method: 8,
        data: compressed,
        uncompressedSize: declared.byteLength,
        crc32: computeZipCrc32(declared),
      },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy({ MAX_INFLATE_OUTPUT_CHUNK_BYTES: 4 });
    const inflaterFactory: ZipInflaterFactory = (onData) => ({
      push: () => onData(new Uint8Array(5), true),
      release: vi.fn(),
    });

    await expect(
      extractZipMembersBounded(
        fixture.bytes,
        inventory,
        admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
        currentOperation(),
        { policy, inflaterFactory },
      ),
    ).rejects.toMatchObject({ outcome: 'REJECTED_OUTPUT_CHUNK_BYTES' });
  });

  it.each([
    { method: 0 as const, label: 'stored' },
    { method: 8 as const, label: 'DEFLATE' },
  ])('rejects incorrect $label CRC before member finalization', async ({ method }) => {
    const actual = new TextEncoder().encode('crc payload');
    const data = method === 8 ? deflateSync(actual) : actual;
    const fixture = buildRawZipFixture([
      {
        name: 'crc.bin',
        method,
        data,
        uncompressedSize: actual.byteLength,
        crc32: (computeZipCrc32(actual) + 1) >>> 0,
      },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy();

    await expect(
      extractZipMembersBounded(
        fixture.bytes,
        inventory,
        admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
        currentOperation(),
        { policy },
      ),
    ).rejects.toMatchObject({ outcome: 'REJECTED_CRC_MISMATCH' });
  });

  it('checks cancellation before the first member', async () => {
    const data = Uint8Array.from([1]);
    const fixture = buildRawZipFixture([
      { name: 'a', data, crc32: computeZipCrc32(data) },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy();
    const controller = new AbortController();
    controller.abort('cancel before extraction');

    await expect(
      extractZipMembersBounded(
        fixture.bytes,
        inventory,
        admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
        currentOperation({ signal: controller.signal }),
        { policy },
      ),
    ).rejects.toMatchObject({ outcome: 'CANCELLED' });
  });

  it('stops during compressed input feeding and releases the inflater', async () => {
    const actual = new TextEncoder().encode('B'.repeat(100));
    const compressed = deflateSync(actual);
    const fixture = buildRawZipFixture([
      {
        name: 'cancel.bin',
        method: 8,
        data: compressed,
        uncompressedSize: actual.byteLength,
        crc32: computeZipCrc32(actual),
      },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy({ COMPRESSED_INPUT_CHUNK_BYTES: 1 });
    const controller = new AbortController();
    const release = vi.fn();
    const inflaterFactory: ZipInflaterFactory = (onData) => {
      const inflater = new Inflate(onData);
      let pushes = 0;
      return {
        push(chunk, final) {
          pushes += 1;
          inflater.push(chunk, final);
          if (pushes === 1) controller.abort('cancel during input');
        },
        release,
      };
    };

    await expect(
      extractZipMembersBounded(
        fixture.bytes,
        inventory,
        admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
        currentOperation({ signal: controller.signal }),
        { policy, inflaterFactory },
      ),
    ).rejects.toMatchObject({ outcome: 'CANCELLED' });
    expect(release).toHaveBeenCalledOnce();
  });

  it('classifies supersession as stale and emits no late success', async () => {
    const actual = new TextEncoder().encode('stale');
    const compressed = deflateSync(actual);
    const fixture = buildRawZipFixture([
      {
        name: 'stale.bin',
        method: 8,
        data: compressed,
        uncompressedSize: actual.byteLength,
        crc32: computeZipCrc32(actual),
      },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy();
    let current = true;
    const inflaterFactory: ZipInflaterFactory = (onData) => ({
      push() {
        current = false;
        onData(actual, true);
      },
      release() {},
    });

    await expect(
      extractZipMembersBounded(
        fixture.bytes,
        inventory,
        admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
        currentOperation({ isCurrent: () => current }),
        { policy, inflaterFactory },
      ),
    ).rejects.toMatchObject({ outcome: 'STALE_OPERATION' });
  });

  it('proves only one unfinished member exists at a time', async () => {
    const a = new TextEncoder().encode('first');
    const b = new TextEncoder().encode('second');
    const fixture = buildRawZipFixture([
      {
        name: 'a',
        method: 8,
        data: deflateSync(a),
        uncompressedSize: a.byteLength,
        crc32: computeZipCrc32(a),
      },
      {
        name: 'b',
        method: 8,
        data: deflateSync(b),
        uncompressedSize: b.byteLength,
        crc32: computeZipCrc32(b),
      },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy();
    let active = 0;
    let peak = 0;
    const inflaterFactory: ZipInflaterFactory = (onData) => {
      active += 1;
      peak = Math.max(peak, active);
      const inflater = new Inflate(onData);
      return {
        push: (chunk, final) => inflater.push(chunk, final),
        release: () => {
          active -= 1;
        },
      };
    };
    const result = await extractZipMembersBounded(
      fixture.bytes,
      inventory,
      admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
      currentOperation(),
      { policy, inflaterFactory },
    );

    expect(peak).toBe(1);
    expect(active).toBe(0);
    releaseBoundedZipMemberSet(result.memberSet);
  });

  it('produces deterministic evidence for repeated extraction', async () => {
    const data = Uint8Array.from([1, 2, 3]);
    const fixture = buildRawZipFixture([
      { name: 'a', data, crc32: computeZipCrc32(data) },
    ]);
    const inventory = admittedInventory(fixture.bytes);
    const policy = testPolicy();

    const first = await extractZipMembersBounded(
      fixture.bytes,
      inventory,
      admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
      currentOperation(),
      { policy },
    );
    const second = await extractZipMembersBounded(
      fixture.bytes,
      inventory,
      admitDeclaredZipResources(inventory, fixture.bytes.byteLength, policy),
      currentOperation(),
      { policy },
    );

    expect(JSON.stringify(first.evidence)).toBe(JSON.stringify(second.evidence));
    releaseBoundedZipMemberSet(first.memberSet);
    releaseBoundedZipMemberSet(second.memberSet);
  });
});

function admittedInventory(bytes: Uint8Array) {
  return admitZipArchive(inspectZipArchive(bytes));
}

function testPolicy(
  overrides: Partial<ZipResourceLimits> = {},
): ZipResourcePolicyV1 {
  return Object.freeze({
    ...WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
    limits: Object.freeze({
      ...WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.limits,
      MAX_SOURCE_ARCHIVE_BYTES: 16_384,
      MAX_RAW_ENTRY_COUNT: 32,
      MAX_ENTRY_COMPRESSED_BYTES: 4_096,
      MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: 4_096,
      MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: 8_192,
      MAX_DECLARED_ENTRY_COMPRESSION_RATIO: 1_000,
      MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO: 1_000,
      MAX_ACTUAL_EXPANDED_MEMBER_BYTES: 4_096,
      MAX_ACTUAL_EXPANDED_ARCHIVE_BYTES: 8_192,
      MAX_ACTIVE_EXTRACTION_BYTES: 8_192,
      MAX_INFLATE_OUTPUT_CHUNK_BYTES: 1_024,
      COMPRESSED_INPUT_CHUNK_BYTES: 16,
      ...overrides,
    }),
  });
}

function currentOperation(
  overrides: Partial<ZipExtractionOperation> = {},
): ZipExtractionOperation {
  return {
    operationId: 'test-operation',
    generation: 1,
    isCurrent: () => true,
    isMounted: () => true,
    ...overrides,
  };
}
