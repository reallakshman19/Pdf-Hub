import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { admitZipArchive } from './zipAdmission';
import { inspectZipArchive } from './zipInventory';
import { buildRawZipFixture } from './__tests__/zipFixtureBuilder';

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
    const types = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/admission/zip/zipTypes.ts'),
      'utf8',
    );

    expect(source).not.toContain('MAX_PDF_SIZE_BYTES');
    expect(source).not.toContain('DEFAULT_MACRO_RESOURCE_LIMITS');
    expect(source).not.toContain('MAX_ARCHIVE_BYTES');
    expect(source).not.toContain('MAX_ZIP_ENTRIES');
    expect(source).not.toContain('MAX_UNCOMPRESSED_BYTES');
    expect(types).toContain('UNRESOLVED_POLICY');
    expect(types).toContain('TOTAL_COMPRESSED_BYTES_DECLARED');
    expect(types).toContain('TOTAL_UNCOMPRESSED_BYTES_DECLARED');
    expect(types).toContain('MAX_DECLARED_COMPRESSION_RATIO');
  });
});
