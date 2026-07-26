import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { admitZipArchive } from './zipAdmission';
import { inspectZipArchive } from './zipInventory';
import { ZipStructuralAdmissionError } from './zipTypes';
import {
  buildRawZipFixture,
  type RawZipFixture,
} from './__tests__/zipFixtureBuilder';

function rejectedInventory(bytes: Uint8Array) {
  const inspected = inspectZipArchive(bytes);
  try {
    admitZipArchive(inspected);
  } catch (error) {
    if (error instanceof ZipStructuralAdmissionError) return error.inventory;
    throw error;
  }
  throw new Error('Expected ZIP structural admission to reject the fixture.');
}

function insertGapBeforeCentralDirectory(
  fixture: RawZipFixture,
  gap: readonly number[],
): Uint8Array {
  const result = new Uint8Array(fixture.bytes.byteLength + gap.length);
  result.set(fixture.bytes.slice(0, fixture.centralDirectoryOffset), 0);
  result.set(gap, fixture.centralDirectoryOffset);
  result.set(
    fixture.bytes.slice(fixture.centralDirectoryOffset),
    fixture.centralDirectoryOffset + gap.length,
  );
  const shiftedEocdOffset = fixture.eocdOffset + gap.length;
  new DataView(result.buffer).setUint32(
    shiftedEocdOffset + 16,
    fixture.centralDirectoryOffset + gap.length,
    true,
  );
  return result;
}

describe('ZIP structural admission boundary', () => {
  it('admits only an inventory with an explicit ADMITTED outcome', () => {
    const admitted = inspectZipArchive(
      buildRawZipFixture([{ name: 'manifest.json' }]).bytes,
    );
    const rejected = inspectZipArchive(
      buildRawZipFixture([
        { name: 'manifest.json' },
        { name: 'manifest.json' },
      ]).bytes,
    );

    expect(admitZipArchive(admitted)).toBe(admitted);
    expect(rejected.collisionGroups[0]?.key).toBe('6d616e69666573742e6a736f6e');
    expect(() => admitZipArchive(rejected)).toThrow(
      'Writer project archive contains duplicate entry "manifest.json".',
    );
  });

  it('rejects data descriptors and unsupported general-purpose flag layouts', () => {
    const descriptor = buildRawZipFixture([
      {
        name: 'manifest.json',
        data: [1],
        flags: 8,
        localFlags: 8,
        localCrc32: 0,
        localCompressedSize: 0,
        localUncompressedSize: 0,
      },
    ]);
    const patchedData = buildRawZipFixture([
      { name: 'manifest.json', flags: 32, localFlags: 32 },
    ]);
    const storedOptions = buildRawZipFixture([
      { name: 'manifest.json', flags: 2, localFlags: 2 },
    ]);

    expect(inspectZipArchive(descriptor.bytes).outcome).toBe('ADMITTED');
    expect(rejectedInventory(descriptor.bytes)).toMatchObject({
      outcome: 'REJECTED_UNSUPPORTED',
      diagnostics: [expect.objectContaining({ code: 'ZIP_DATA_DESCRIPTOR_UNSUPPORTED' })],
    });
    expect(rejectedInventory(patchedData.bytes).diagnostics[0]?.code).toBe(
      'ZIP_GENERAL_PURPOSE_FLAG_UNSUPPORTED',
    );
    expect(rejectedInventory(storedOptions.bytes).diagnostics[0]?.code).toBe(
      'ZIP_STORED_COMPRESSION_OPTIONS_UNSUPPORTED',
    );
  });

  it('rejects empty-archive preambles and unaccounted local-region gaps', () => {
    const emptyPreamble = buildRawZipFixture([], { prepend: [1, 2, 3] });
    const ordinary = buildRawZipFixture([{ name: 'manifest.json', data: [1] }]);
    const gapped = insertGapBeforeCentralDirectory(ordinary, [0xaa, 0xbb]);

    expect(inspectZipArchive(emptyPreamble.bytes).outcome).toBe('ADMITTED');
    expect(rejectedInventory(emptyPreamble.bytes).diagnostics[0]?.code).toBe(
      'ZIP_EMPTY_ARCHIVE_PREAMBLE_UNSUPPORTED',
    );
    expect(inspectZipArchive(gapped).outcome).toBe('ADMITTED');
    expect(rejectedInventory(gapped).diagnostics[0]?.code).toBe(
      'ZIP_LOCAL_CENTRAL_DIRECTORY_GAP',
    );
  });

  it('keeps raw inspection independent of JSZip, decompression, JSON, and stores', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/admission/zip/zipInventory.ts'),
      'utf8',
    );

    expect(source).not.toContain("from 'jszip'");
    expect(source).not.toContain('JSZip');
    expect(source).not.toContain('loadAsync');
    expect(source).not.toContain("async('uint8array')");
    expect(source).not.toContain('JSON.parse');
    expect(source).not.toContain('useWriterV2Store');
    expect(source).not.toContain('useSessionStore');
    expect(source).not.toContain('useEditorStore');
    expect(source).not.toContain('useOcrStore');
  });

  it('contains no application-defined numerical archive thresholds', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/admission/zip/zipInventory.ts'),
      'utf8',
    );
    const admission = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/admission/zip/zipAdmission.ts'),
      'utf8',
    );
    const types = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/admission/zip/zipTypes.ts'),
      'utf8',
    );

    expect(`${source}\n${admission}`).not.toContain('MAX_PDF_SIZE_BYTES');
    expect(`${source}\n${admission}`).not.toContain('DEFAULT_MACRO_RESOURCE_LIMITS');
    expect(`${source}\n${admission}`).not.toContain('MAX_ARCHIVE_BYTES');
    expect(`${source}\n${admission}`).not.toContain('MAX_ZIP_ENTRIES');
    expect(`${source}\n${admission}`).not.toContain('MAX_UNCOMPRESSED_BYTES');
    expect(types).toContain('UNRESOLVED_POLICY');
    expect(types).toContain('TOTAL_COMPRESSED_BYTES_DECLARED');
    expect(types).toContain('TOTAL_UNCOMPRESSED_BYTES_DECLARED');
    expect(types).toContain('MAX_DECLARED_COMPRESSION_RATIO');
  });
});
