import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { FileAdapter } from '@/adapters/file/FileAdapter';
import type { PsIsonoteAuditReport } from './psIsonoteAudit';
import {
  createPsIsonoteEvidencePackage,
  serializePsIsonoteDiagnosticsCsv,
  serializePsIsonoteMappingSnapshotCsv,
  serializePsIsonoteOccurrenceCsv,
  serializePsIsonoteOccurrenceJsonl,
} from './psIsonoteEvidencePackage';
import { hashText } from './psIsonoteIdentity';
import type { PsIsonoteMapping } from './psIsonoteTable';

const documentBytes = new TextEncoder().encode('%PDF-1.7\nPS ISONOTE evidence fixture');
const sourceText = 'PS No.,Family,ISONOTE\nPS-1234.5,Guide,"REST(6kN), GUIDE [Gap=10mm] (8kN)"';
const mapping: PsIsonoteMapping = {
  psNo: 'PS-1234.5',
  family: 'Guide',
  isonote: 'REST(6kN), GUIDE [Gap=10mm] (8kN)',
  sourceRow: 2,
};
const mappingHash = `sha256:${'b'.repeat(64)}`;
const occurrenceId = `sha256:${'c'.repeat(64)}`;

async function verifiedReport(): Promise<PsIsonoteAuditReport> {
  const [outputSha256, mappingSha256] = await Promise.all([
    FileAdapter.hashBytes(documentBytes),
    hashText(sourceText),
  ]);

  return {
    identity: {
      runId: 'psiso-evidence-test',
      documentName: 'drawing.pdf',
      inputDocumentKey: `sha256:${'a'.repeat(64)}`,
      outputDocumentKey: outputSha256,
      inputSha256: `sha256:${'a'.repeat(64)}`,
      outputSha256,
      mappingSha256,
      recipeSha256: `sha256:${'d'.repeat(64)}`,
      scopeSha256: `sha256:${'e'.repeat(64)}`,
      auditSchemaVersion: '3',
      markerSchemaVersion: 'v2',
    },
    phase: 'verified',
    createdAt: '2026-07-24T08:45:00.000Z',
    summaryRows: [{
      psNo: mapping.psNo,
      family: mapping.family ?? '',
      mappings: 1,
      foundPs: 1,
      occurrences: 1,
      annotated: 1,
      verified: 1,
      review: 0,
      missing: 0,
      averageConfidence: 100,
      minimumConfidence: 100,
      errors: 0,
    }],
    occurrences: [{
      psNo: mapping.psNo,
      family: mapping.family,
      isonote: mapping.isonote,
      sourceRow: mapping.sourceRow,
      mappingHash,
      occurrenceId,
      pageNumber: 1,
      occurrenceIndex: 1,
      rawMatchedText: mapping.psNo,
      normalizedMatchedText: mapping.psNo,
      matchMethod: 'exact',
      textItemCount: 1,
      rect: { x: 100, y: 200, width: 60, height: 10 },
      existingMarkerState: 'none',
      status: 'verified',
      confidence: {
        identity: 100,
        geometry: 100,
        mappingIntegrity: 100,
        matchConfidence: 100,
      },
      diagnosticCodes: [],
    }],
    diagnostics: [{
      code: 'PS_ISONOTE_MATCH_NORMALIZED',
      severity: 'info',
      psNo: mapping.psNo,
      pageNumber: 1,
      occurrenceId,
      message: 'Fixture diagnostic, with comma.',
    }],
    verification: {
      verified: true,
      outputSha256,
      outputDocumentKey: outputSha256,
      outputDocumentKeyMatchesHash: true,
      expectedPageCount: 1,
      actualPageCount: 1,
      expectedMarkerCount: 1,
      verifiedMarkerCount: 1,
      markerResults: [{
        psNo: mapping.psNo,
        mappingHash,
        occurrenceId,
        pageNumber: 1,
        foundCount: 1,
        status: 'verified',
      }],
      diagnostics: [],
    },
  };
}

function checksumMap(value: string): Map<string, string> {
  return new Map(value.split('\n').filter(Boolean).map((line) => {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum line: ${line}`);
    return [match[2], match[1]];
  }));
}

describe('psIsonoteEvidencePackage', () => {
  it('creates a self-contained ZIP with occurrence evidence and valid checksums', async () => {
    const report = await verifiedReport();
    const result = await createPsIsonoteEvidencePackage({
      report,
      mappings: [mapping],
      sourceText,
      documentBytes,
      documentName: 'Drawing 001.pdf',
    });
    const zip = await JSZip.loadAsync(result.bytes);
    const names = Object.keys(zip.files).sort();

    expect(result.fileName).toBe('Drawing-001-ps-isonote-evidence-psiso-evidence-test.zip');
    expect(names).toEqual([
      'README.txt',
      'annotated.pdf',
      'audit-report.json',
      'checksums.sha256',
      'diagnostics.csv',
      'mapping-snapshot.csv',
      'mapping-source.txt',
      'occurrence-audit.csv',
      'occurrence-audit.jsonl',
      'ps-summary.csv',
      'run-manifest.json',
    ]);
    expect(await zip.file('annotated.pdf')?.async('uint8array')).toEqual(documentBytes);
    expect(await zip.file('mapping-source.txt')?.async('string')).toBe(sourceText);

    const occurrenceCsv = await zip.file('occurrence-audit.csv')?.async('string');
    expect(occurrenceCsv).toContain('Mapping SHA-256,Occurrence ID,Page');
    expect(occurrenceCsv).toContain('PS-1234.5,Guide,"REST(6kN), GUIDE [Gap=10mm] (8kN)"');

    const jsonl = await zip.file('occurrence-audit.jsonl')?.async('string');
    const jsonRecord = JSON.parse(jsonl ?? '') as { runId: string; occurrence: { status: string } };
    expect(jsonRecord).toMatchObject({
      runId: report.identity.runId,
      occurrence: { status: 'verified' },
    });

    const checksums = checksumMap(await zip.file('checksums.sha256')?.async('string') ?? '');
    expect(checksums.has('checksums.sha256')).toBe(false);
    expect(checksums.size).toBe(names.length - 1);

    for (const [name, expectedHash] of checksums) {
      const bytes = await zip.file(name)?.async('uint8array');
      expect(bytes, `missing package file ${name}`).toBeDefined();
      expect((await FileAdapter.hashBytes(bytes ?? new Uint8Array())).replace(/^sha256:/, ''))
        .toBe(expectedHash);
    }
  });

  it('serializes detailed occurrence, diagnostics, mapping, and JSONL evidence', async () => {
    const report = await verifiedReport();
    const occurrenceCsv = serializePsIsonoteOccurrenceCsv(report);
    const diagnosticsCsv = serializePsIsonoteDiagnosticsCsv(report);
    const mappingCsv = await serializePsIsonoteMappingSnapshotCsv([mapping]);
    const jsonl = serializePsIsonoteOccurrenceJsonl(report);

    expect(occurrenceCsv.split('\n')[0]).toContain('Match Confidence');
    expect(occurrenceCsv).toContain(occurrenceId);
    expect(diagnosticsCsv).toContain('"Fixture diagnostic, with comma."');
    expect(mappingCsv).toContain('PS No.,Family,ISONOTE,Source Row,Mapping SHA-256');
    expect(mappingCsv).toMatch(/sha256:[a-f0-9]{64}/);
    expect(JSON.parse(jsonl)).toMatchObject({ runId: report.identity.runId });
  });

  it('rejects a PDF that is not bound to the report identity', async () => {
    const report = await verifiedReport();

    await expect(createPsIsonoteEvidencePackage({
      report,
      mappings: [mapping],
      sourceText,
      documentBytes: new TextEncoder().encode('wrong PDF'),
      documentName: 'drawing.pdf',
    })).rejects.toThrow('Evidence PDF hash mismatch');
  });

  it('rejects a mapping source that is not bound to the report identity', async () => {
    const report = await verifiedReport();

    await expect(createPsIsonoteEvidencePackage({
      report,
      mappings: [mapping],
      sourceText: `${sourceText}\nPS-9999.1,Rest,REST (2kN)`,
      documentBytes,
      documentName: 'drawing.pdf',
    })).rejects.toThrow('Evidence mapping source hash mismatch');
  });
});
