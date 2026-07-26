import { describe, expect, it } from 'vitest';
import { buildRawZipFixture } from './__tests__/zipFixtureBuilder';
import { inspectZipArchive } from './zipInventory';
import { admitZipArchive } from './zipAdmission';
import type {
  ZipArchiveEntryInventory,
  ZipArchiveInventory,
  ZipArchiveMeasurements,
} from './zipTypes';
import {
  admitDeclaredZipResources,
  admitZipSourceBytes,
  admitZipSourceMetadata,
  declaredCompressionRatio,
  ZipResourceAdmissionError,
} from './zipDeclaredResourceAdmission';
import {
  WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
  type ZipResourceLimits,
  type ZipResourcePolicyV1,
} from './zipResourcePolicy';

describe('declared Writer project ZIP resource admission', () => {
  it('checks source metadata before byte reading contracts', () => {
    const policy = testPolicy({ MAX_SOURCE_ARCHIVE_BYTES: 4 });
    expect(() => admitZipSourceMetadata(4, policy)).not.toThrow();
    expect(() => admitZipSourceMetadata(5, policy)).toThrowError(
      expect.objectContaining({ outcome: 'REJECTED_SOURCE_BYTES' }),
    );
    expect(() => admitZipSourceBytes(4, 5, policy)).toThrowError(
      expect.objectContaining({ outcome: 'REJECTED_SOURCE_METADATA_MISMATCH' }),
    );
  });

  it('admits the exact entry-count limit and rejects limit plus one', () => {
    const inventory = inventoryFor([{ name: 'a', data: [1] }]);
    const policy = testPolicy({ MAX_RAW_ENTRY_COUNT: 2 });

    expect(
      admitDeclaredZipResources(
        withMeasurements(inventory, { RAW_ENTRY_COUNT: 2 }),
        inventory.sourceBytes,
        policy,
      ).outcome,
    ).toBe('ADMITTED');

    expect(() =>
      admitDeclaredZipResources(
        withMeasurements(inventory, { RAW_ENTRY_COUNT: 3 }),
        inventory.sourceBytes,
        policy,
      ),
    ).toThrowError(expect.objectContaining({ outcome: 'REJECTED_ENTRY_COUNT' }));
  });

  it('enforces compressed and declared expanded member boundaries', () => {
    const inventory = inventoryFor([{ name: 'a', data: [1] }]);
    const policy = testPolicy({
      MAX_ENTRY_COMPRESSED_BYTES: 4,
      MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: 8,
      MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: 100,
      MAX_DECLARED_ENTRY_COMPRESSION_RATIO: 100,
      MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO: 100,
    });

    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 4, uncompressedSize: 8 }),
        inventory.sourceBytes,
        policy,
      ),
    ).not.toThrow();

    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 5, uncompressedSize: 5 }),
        inventory.sourceBytes,
        policy,
      ),
    ).toThrowError(expect.objectContaining({
      outcome: 'REJECTED_DECLARED_MEMBER_COMPRESSED_BYTES',
    }));

    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 4, uncompressedSize: 9 }),
        inventory.sourceBytes,
        policy,
      ),
    ).toThrowError(expect.objectContaining({
      outcome: 'REJECTED_DECLARED_MEMBER_EXPANDED_BYTES',
    }));
  });

  it('uses exact ratio semantics without rounding', () => {
    expect(declaredCompressionRatio(1, 200)).toBe(200);
    expect(declaredCompressionRatio(3, 601)).toBeCloseTo(200.33333333333334);
    expect(declaredCompressionRatio(0, 0)).toBe(0);
    expect(declaredCompressionRatio(0, 1)).toBe(Number.POSITIVE_INFINITY);

    const inventory = inventoryFor([{ name: 'a', data: [1] }]);
    const policy = testPolicy({
      MAX_ENTRY_COMPRESSED_BYTES: 1_000,
      MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: 1_000,
      MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: 1_000,
      MAX_DECLARED_ENTRY_COMPRESSION_RATIO: 200,
      MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO: 1_000,
    });

    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 1, uncompressedSize: 200 }),
        inventory.sourceBytes,
        policy,
      ),
    ).not.toThrow();

    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 3, uncompressedSize: 601 }),
        inventory.sourceBytes,
        policy,
      ),
    ).toThrowError(expect.objectContaining({
      outcome: 'REJECTED_DECLARED_MEMBER_RATIO',
    }));

    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 0, uncompressedSize: 0 }),
        inventory.sourceBytes,
        policy,
      ),
    ).not.toThrow();

    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 0, uncompressedSize: 1 }),
        inventory.sourceBytes,
        policy,
      ),
    ).toThrowError(expect.objectContaining({
      outcome: 'REJECTED_DECLARED_MEMBER_RATIO',
    }));
  });

  it('enforces aggregate declared expansion and archive ratio after entries', () => {
    const inventory = inventoryFor([{ name: 'a', data: [1] }]);
    const policy = testPolicy({
      MAX_ENTRY_COMPRESSED_BYTES: 100,
      MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: 100,
      MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: 10,
      MAX_DECLARED_ENTRY_COMPRESSION_RATIO: 100,
      MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO: 100,
    });

    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 1, uncompressedSize: 11 }),
        inventory.sourceBytes,
        policy,
      ),
    ).toThrowError(expect.objectContaining({
      outcome: 'REJECTED_DECLARED_ARCHIVE_EXPANDED_BYTES',
    }));

    const ratioPolicy = testPolicy({
      MAX_ENTRY_COMPRESSED_BYTES: 1_000,
      MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: 1_000,
      MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: 1_000,
      MAX_DECLARED_ENTRY_COMPRESSION_RATIO: 1_000,
      MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO: 100,
    });
    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 2, uncompressedSize: 200 }),
        inventory.sourceBytes,
        ratioPolicy,
      ),
    ).not.toThrow();
    expect(() =>
      admitDeclaredZipResources(
        withSingleEntry(inventory, { compressedSize: 2, uncompressedSize: 201 }),
        inventory.sourceBytes,
        ratioPolicy,
      ),
    ).toThrowError(expect.objectContaining({
      outcome: 'REJECTED_DECLARED_ARCHIVE_RATIO',
    }));
  });

  it('fails closed when source and inventory measurements disagree', () => {
    const inventory = inventoryFor([{ name: 'a', data: [1] }]);
    expect(() =>
      admitDeclaredZipResources(inventory, inventory.sourceBytes + 1),
    ).toThrowError(expect.objectContaining({
      outcome: 'REJECTED_SOURCE_METADATA_MISMATCH',
    }));
  });

  it('reports deterministic entry-ordinal diagnostics', () => {
    const inventory = inventoryFor([
      { name: 'a', data: [1] },
      { name: 'b', data: [2] },
    ]);
    const modified = withEntries(inventory, [
      { compressedSize: 6, uncompressedSize: 6 },
      { compressedSize: 7, uncompressedSize: 7 },
    ]);
    const policy = testPolicy({
      MAX_ENTRY_COMPRESSED_BYTES: 5,
      MAX_ENTRY_DECLARED_UNCOMPRESSED_BYTES: 100,
      MAX_TOTAL_DECLARED_UNCOMPRESSED_BYTES: 100,
      MAX_DECLARED_ENTRY_COMPRESSION_RATIO: 100,
      MAX_DECLARED_ARCHIVE_COMPRESSION_RATIO: 100,
    });

    try {
      admitDeclaredZipResources(modified, modified.sourceBytes, policy);
      throw new Error('Expected declared admission rejection.');
    } catch (error) {
      expect(error).toBeInstanceOf(ZipResourceAdmissionError);
      expect((error as ZipResourceAdmissionError).diagnostic.entryOrdinals).toEqual([0]);
    }
  });
});

function inventoryFor(
  entries: Parameters<typeof buildRawZipFixture>[0],
): ZipArchiveInventory {
  return admitZipArchive(inspectZipArchive(buildRawZipFixture(entries).bytes));
}

function testPolicy(
  overrides: Partial<ZipResourceLimits>,
): ZipResourcePolicyV1 {
  return Object.freeze({
    ...WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1,
    limits: Object.freeze({
      ...WRITER_PROJECT_ZIP_RESOURCE_POLICY_V1.limits,
      ...overrides,
    }),
  });
}

function withSingleEntry(
  inventory: ZipArchiveInventory,
  patch: Partial<ZipArchiveEntryInventory>,
): ZipArchiveInventory {
  return withEntries(inventory, [patch]);
}

function withEntries(
  inventory: ZipArchiveInventory,
  patches: readonly Partial<ZipArchiveEntryInventory>[],
): ZipArchiveInventory {
  const entries = inventory.entries.map((entry, index) => ({
    ...entry,
    ...(patches[index] ?? {}),
  }));
  const totalCompressed = entries.reduce((sum, entry) => sum + entry.compressedSize, 0);
  const totalUncompressed = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  return {
    ...inventory,
    entries,
    measurements: {
      ...inventory.measurements,
      RAW_ENTRY_COUNT: entries.length,
      TOTAL_COMPRESSED_BYTES_DECLARED: totalCompressed,
      TOTAL_UNCOMPRESSED_BYTES_DECLARED: totalUncompressed,
      MAX_ENTRY_COMPRESSED_BYTES: Math.max(0, ...entries.map((entry) => entry.compressedSize)),
      MAX_ENTRY_UNCOMPRESSED_BYTES: Math.max(0, ...entries.map((entry) => entry.uncompressedSize)),
      MAX_DECLARED_COMPRESSION_RATIO: Math.max(
        0,
        ...entries.map((entry) => declaredCompressionRatio(
          entry.compressedSize,
          entry.uncompressedSize,
        )),
      ),
    },
  };
}

function withMeasurements(
  inventory: ZipArchiveInventory,
  patch: Partial<ZipArchiveMeasurements>,
): ZipArchiveInventory {
  return {
    ...inventory,
    measurements: {
      ...inventory.measurements,
      ...patch,
    },
  };
}
