import { describe, expect, it } from 'vitest';
import { admitZipArchive } from './zipAdmission';
import { inspectZipArchive } from './zipInventory';
import {
  buildRawZipFixture,
  patchUint16,
  patchUint32,
  truncateBytes,
} from './__tests__/zipFixtureBuilder';

function codes(bytes: Uint8Array): readonly string[] {
  return inspectZipArchive(bytes).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('raw ZIP structural inventory', () => {
  it('inventories a deterministic immutable stored archive without decoding payloads', () => {
    const fixture = buildRawZipFixture([
      { name: 'assets/', externalAttributes: 0x10 },
      { name: 'manifest.json', data: [1, 2, 3] },
      { name: 'assets/image.png', data: [9, 8] },
    ]);

    const inventory = inspectZipArchive(fixture.bytes);

    expect(inventory.outcome).toBe('ADMITTED');
    expect(inventory.profileId).toBe('ZIP_STRUCTURAL_ADMISSION_V1');
    expect(inventory.entries.map((entry) => entry.decodedFilename)).toEqual([
      'assets/',
      'manifest.json',
      'assets/image.png',
    ]);
    expect(inventory.entries[0]?.directory).toBe(true);
    expect(inventory.measurements.RAW_ENTRY_COUNT).toBe(3);
    expect(inventory.measurements.TOTAL_COMPRESSED_BYTES_DECLARED).toBe(5);
    expect(inventory.measurements.TOTAL_UNCOMPRESSED_BYTES_DECLARED).toBe(5);
    expect(inventory.regions.some((region) => region.kind === 'COMPRESSED_PAYLOAD')).toBe(true);
    expect(Object.isFrozen(inventory)).toBe(true);
    expect(Object.isFrozen(inventory.entries)).toBe(true);
    expect(Object.isFrozen(inventory.entries[0]?.rawFilenameBytes)).toBe(true);
    expect(Object.isFrozen(inventory.measurements)).toBe(true);
    expect(() => admitZipArchive(inventory)).not.toThrow();
  });

  it('fails closed for absent, truncated, and contradictory EOCD structures', () => {
    const valid = buildRawZipFixture([{ name: 'manifest.json' }]);
    const missing = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const truncated = truncateBytes(valid.bytes, valid.bytes.byteLength - 8);
    const invalidOffset = patchUint32(valid.bytes, valid.eocdOffset + 16, 0xffffffff - 1);
    const invalidSize = patchUint32(valid.bytes, valid.eocdOffset + 12, 0xffffffff - 1);
    const countMismatch = patchUint16(valid.bytes, valid.eocdOffset + 8, 0);

    expect(codes(missing)).toContain('ZIP_EOCD_TRUNCATED');
    expect(inspectZipArchive(truncated).outcome).toBe('REJECTED_MALFORMED');
    expect(inspectZipArchive(invalidOffset).outcome).toBe('REJECTED_RANGE_CONFLICT');
    expect(inspectZipArchive(invalidSize).outcome).toBe('REJECTED_RANGE_CONFLICT');
    expect(codes(countMismatch)).toContain('ZIP_MULTI_DISK_RECORD_COUNT');
  });

  it('rejects multi-disk and ZIP64 declarations as unsupported', () => {
    const multiDisk = buildRawZipFixture([{ name: 'manifest.json' }], {
      diskNumber: 1,
    });
    const splitCounts = buildRawZipFixture([{ name: 'manifest.json' }], {
      recordsOnDisk: 0,
      totalRecords: 1,
    });
    const zip64Sentinel = buildRawZipFixture([{ name: 'manifest.json' }], {
      recordsOnDisk: 0xffff,
      totalRecords: 0xffff,
    });
    const zip64Extra = buildRawZipFixture([
      { name: 'manifest.json', centralExtra: [1, 0, 0, 0] },
    ]);

    expect(inspectZipArchive(multiDisk.bytes).outcome).toBe('REJECTED_UNSUPPORTED');
    expect(inspectZipArchive(splitCounts.bytes).outcome).toBe('REJECTED_UNSUPPORTED');
    expect(codes(zip64Sentinel.bytes)).toContain('ZIP64_UNSUPPORTED');
    expect(codes(zip64Extra.bytes)).toContain('ZIP64_ENTRY_UNSUPPORTED');
  });

  it('preserves every duplicate raw record and all collision ordinals before rejection', () => {
    const fixture = buildRawZipFixture([
      { name: 'manifest.json' },
      { name: 'manifest.json' },
      { name: './writer-elements.json' },
      { name: 'writer-elements.json' },
      { name: 'assets' },
      { name: 'assets/' },
    ]);

    const inventory = inspectZipArchive(fixture.bytes);

    expect(inventory.outcome).toBe('REJECTED_DUPLICATE');
    expect(inventory.entries).toHaveLength(6);
    expect(inventory.entries.filter((entry) => entry.decodedFilename === 'manifest.json')).toHaveLength(2);
    expect(inventory.collisionGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'EXACT_RAW_NAME',
          entryOrdinals: [0, 1],
        }),
        expect.objectContaining({
          kind: 'NORMALIZED_PATH',
          key: 'writer-elements.json',
          entryOrdinals: [2, 3],
        }),
        expect.objectContaining({
          kind: 'FILE_DIRECTORY',
          key: 'assets',
          entryOrdinals: [4, 5],
        }),
      ]),
    );
    expect(() => admitZipArchive(inventory)).toThrow('duplicate entry');
  });

  it.each([
    '../manifest.json',
    'folder/../../manifest.json',
    '/manifest.json',
    'C:\\manifest.json',
    '\\\\server\\share\\manifest.json',
    'manifest.json\u0000suffix',
    '/',
  ])('rejects unsafe archive member path %s', (name) => {
    const inventory = inspectZipArchive(buildRawZipFixture([{ name }]).bytes);

    expect(inventory.outcome).toBe('REJECTED_UNSAFE_PATH');
    expect(inventory.diagnostics[0]?.entryOrdinals).toEqual([0]);
  });

  it('rejects encryption and unsupported compression methods with observed metadata', () => {
    const encrypted = inspectZipArchive(
      buildRawZipFixture([{ name: 'manifest.json', flags: 1 }]).bytes,
    );
    const unsupported = inspectZipArchive(
      buildRawZipFixture([{ name: 'manifest.json', method: 12 }]).bytes,
    );

    expect(encrypted.outcome).toBe('REJECTED_ENCRYPTED');
    expect(encrypted.entries[0]?.generalPurposeFlags).toBe(1);
    expect(unsupported.outcome).toBe('REJECTED_UNSUPPORTED');
    expect(unsupported.entries[0]?.compressionMethod).toBe(12);
    expect(unsupported.diagnostics[0]?.message).toContain('method 12');
  });

  it('rejects invalid local-header references and local/central inconsistencies', () => {
    const invalidSignature = inspectZipArchive(
      buildRawZipFixture([{ name: 'manifest.json', localSignature: 0 }]).bytes,
    );
    const filenameMismatch = inspectZipArchive(
      buildRawZipFixture([
        { name: 'manifest.json', localName: 'different.json' },
      ]).bytes,
    );
    const methodMismatch = inspectZipArchive(
      buildRawZipFixture([
        { name: 'manifest.json', method: 8, localMethod: 0 },
      ]).bytes,
    );
    const flagMismatch = inspectZipArchive(
      buildRawZipFixture([
        { name: 'manifest.json', flags: 0, localFlags: 8 },
      ]).bytes,
    );
    const outOfRange = inspectZipArchive(
      buildRawZipFixture([
        { name: 'manifest.json', localHeaderOffsetOverride: 0xffffff00 },
      ]).bytes,
    );

    expect(codes(invalidSignature.inventory?.bytes ?? new Uint8Array())).toBeDefined();
    expect(invalidSignature.diagnostics.map((item) => item.code)).toContain('ZIP_LOCAL_HEADER_SIGNATURE_INVALID');
    expect(filenameMismatch.diagnostics.map((item) => item.code)).toContain('ZIP_LOCAL_CENTRAL_FILENAME_MISMATCH');
    expect(methodMismatch.diagnostics.map((item) => item.code)).toContain('ZIP_LOCAL_CENTRAL_METHOD_MISMATCH');
    expect(flagMismatch.diagnostics.map((item) => item.code)).toContain('ZIP_LOCAL_CENTRAL_FLAGS_MISMATCH');
    expect(outOfRange.outcome).toBe('REJECTED_RANGE_CONFLICT');
  });

  it('rejects repeated local ownership, overlapping payloads, and prepended structures', () => {
    const sharedOffset = buildRawZipFixture([
      { name: 'first.txt' },
      { name: 'second.txt', localHeaderOffsetOverride: 0 },
    ]);
    const crossingPayload = buildRawZipFixture([
      {
        name: 'manifest.json',
        method: 8,
        data: [1],
        compressedSize: 1000,
        localCompressedSize: 1000,
        uncompressedSize: 1,
        localUncompressedSize: 1,
      },
    ]);
    const prepended = buildRawZipFixture([{ name: 'manifest.json' }], {
      prepend: [1, 2, 3],
    });

    expect(codes(sharedOffset.bytes)).toContain('ZIP_REPEATED_LOCAL_HEADER_OWNERSHIP');
    expect(codes(crossingPayload.bytes)).toContain('ZIP_COMPRESSED_DATA_OUT_OF_RANGE');
    expect(codes(prepended.bytes)).toContain('ZIP_PREPENDED_STRUCTURE_UNSUPPORTED');
  });

  it('measures large declared ratios without inventing a rejection threshold', () => {
    const fixture = buildRawZipFixture([
      {
        name: 'large-ratio.bin',
        method: 8,
        data: [0],
        compressedSize: 1,
        localCompressedSize: 1,
        uncompressedSize: 0xffffffff,
        localUncompressedSize: 0xffffffff,
      },
    ]);

    const inventory = inspectZipArchive(fixture.bytes);

    expect(inventory.outcome).toBe('ADMITTED');
    expect(inventory.measurements.MAX_DECLARED_COMPRESSION_RATIO).toBe(0xffffffff);
    expect(inventory.unresolvedPolicy.authority).toBe('UNRESOLVED_POLICY');
    expect(inventory.unresolvedPolicy.dimensions).toContain('MAX_DECLARED_COMPRESSION_RATIO');
  });
});
