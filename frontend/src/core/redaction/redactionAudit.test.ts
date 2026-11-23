import { describe, expect, it } from 'vitest';
import {
  computeSha256Hex,
  generateRedactionAuditManifest,
  serializeAuditManifestToBytes,
  serializeAuditManifestToJson,
} from './redactionAudit';
import type { RedactionSanitizationResult } from './types';

describe('redactionAudit', () => {
  describe('computeSha256Hex', () => {
    it('produces known SHA-256 digest for empty buffer', async () => {
      const empty = new Uint8Array(0);
      const hash = await computeSha256Hex(empty);
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('produces distinct 64-char hex digests for distinct content', async () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);

      const hashA = await computeSha256Hex(a);
      const hashB = await computeSha256Hex(b);

      expect(hashA).toHaveLength(64);
      expect(hashB).toHaveLength(64);
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('generateRedactionAuditManifest', () => {
    it('constructs a compliant audit manifest matching schemaVersion 1', async () => {
      const originalBytes = new Uint8Array([10, 20, 30]);
      const mockResult: RedactionSanitizationResult = {
        sanitizedBytes: new Uint8Array([10, 20, 99]),
        purgedTextCharacterCount: 42,
        purgedAnnotationsCount: 3,
        appliedRedactionCount: 2,
        redactedPages: [0, 1],
        records: [
          {
            regionId: 'r1',
            pageIndex: 0,
            pageNumber: 1,
            rect: { x: 50, y: 50, width: 100, height: 20 },
            reason: 'PII Removal',
            purgedTextCharacters: 22,
            purgedAnnotationsCount: 2,
            timestamp: '2026-11-23T11:00:00.000Z',
          },
          {
            regionId: 'r2',
            pageIndex: 1,
            pageNumber: 2,
            rect: { x: 100, y: 200, width: 80, height: 15 },
            reason: 'HIPAA Health Info',
            purgedTextCharacters: 20,
            purgedAnnotationsCount: 1,
            timestamp: '2026-11-23T11:00:00.000Z',
          },
        ],
      };

      const manifest = await generateRedactionAuditManifest(
        originalBytes,
        mockResult,
        {
          documentKey: 'doc:legal-report',
          originalFileName: 'confidential_report.pdf',
        },
      );

      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.documentKey).toBe('doc:legal-report');
      expect(manifest.originalFileName).toBe('confidential_report.pdf');
      expect(manifest.originalSha256).toHaveLength(64);
      expect(manifest.redactedSha256).toHaveLength(64);
      expect(manifest.originalSha256).not.toBe(manifest.redactedSha256);
      expect(manifest.totalRedactionsApplied).toBe(2);
      expect(manifest.purgedTextCharacterCount).toBe(42);
      expect(manifest.purgedAnnotationsCount).toBe(3);
      expect(manifest.redactedPages).toEqual([0, 1]);
      expect(manifest.records).toHaveLength(2);
      expect(manifest.records[0].reason).toBe('PII Removal');
      expect(manifest.records[1].reason).toBe('HIPAA Health Info');
    });

    it('serializes manifest to JSON and UTF-8 byte stream', async () => {
      const mockResult: RedactionSanitizationResult = {
        sanitizedBytes: new Uint8Array([5, 6, 7]),
        purgedTextCharacterCount: 5,
        purgedAnnotationsCount: 0,
        appliedRedactionCount: 1,
        redactedPages: [0],
        records: [],
      };

      const manifest = await generateRedactionAuditManifest(
        new Uint8Array([1, 2, 3]),
        mockResult,
        {
          documentKey: 'doc:test',
          originalFileName: 'sample.pdf',
        },
      );

      const json = serializeAuditManifestToJson(manifest);
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.originalFileName).toBe('sample.pdf');

      const bytes = serializeAuditManifestToBytes(manifest);
      expect(ArrayBuffer.isView(bytes)).toBe(true);
      expect(bytes.length).toBeGreaterThan(0);
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toBe(json);
    });
  });
});
