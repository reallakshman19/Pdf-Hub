import { describe, expect, it } from 'vitest';
import type { PsIsonoteAuditIdentity } from './psIsonoteIdentity';
import {
  buildPsIsonoteAuditReport,
  scorePsIsonoteReference,
  serializePsIsonoteAuditManifest,
  serializePsIsonoteSummaryCsv,
} from './psIsonoteAudit';
import type { PsIsonoteScanResult, PsIsonoteTextReference } from './psIsonoteRecipe';
import type { PsIsonoteMapping } from './psIsonoteTable';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

const identity: PsIsonoteAuditIdentity = {
  runId: 'psiso-test-run',
  documentName: 'drawing.pdf',
  inputDocumentKey: HASH_A,
  inputSha256: HASH_A,
  mappingSha256: HASH_B,
  recipeSha256: HASH_C,
  scopeSha256: HASH_A,
  auditSchemaVersion: '2',
  markerSchemaVersion: 'v2',
};

const guideMapping: PsIsonoteMapping = {
  psNo: 'PS-1234.5',
  family: 'Guide',
  isonote: 'REST(6kN), GUIDE [Gap=10mm] (8kN)',
  sourceRow: 2,
};

const restMapping: PsIsonoteMapping = {
  psNo: 'PS-5678.1',
  family: 'Rest',
  isonote: 'REST (12kN)',
  sourceRow: 3,
};

function reference(
  mapping: PsIsonoteMapping,
  overrides: Partial<PsIsonoteTextReference> = {},
): PsIsonoteTextReference {
  return {
    psNo: mapping.psNo,
    pageNumber: 1,
    rect: { x: 100, y: 200, width: 60, height: 10 },
    mapping,
    mappingHash: HASH_B,
    occurrenceId: HASH_C,
    existingMarkerState: 'none',
    rawMatchedText: mapping.psNo,
    matchMethod: 'exact',
    textItemCount: 1,
    ...overrides,
  };
}

function scan(references: PsIsonoteTextReference[]): PsIsonoteScanResult {
  return {
    inputSha256: HASH_A,
    references,
    detectedReferences: references,
    missingPsNumbers: [restMapping.psNo],
    skippedExisting: [],
    staleExisting: [],
    legacyExisting: [],
    scannedPages: [1],
    pageDimensions: { 1: { width: 595, height: 842 } },
  };
}

describe('psIsonoteAudit', () => {
  it('scores exact matches above joined text-item matches', () => {
    const exact = reference(guideMapping);
    const joined = reference(guideMapping, {
      rawMatchedText: 'PS - 1234 .5',
      matchMethod: 'joined-text-items',
      textItemCount: 4,
    });

    expect(scorePsIsonoteReference(exact).matchConfidence).toBe(100);
    expect(scorePsIsonoteReference(joined).matchConfidence).toBeLessThan(90);
  });

  it('builds one summary row per PS number and retains immutable identity', () => {
    const report = buildPsIsonoteAuditReport(
      [guideMapping, restMapping],
      scan([reference(guideMapping)]),
      { identity, phase: 'annotated', createdAt: '2026-07-24T00:00:00.000Z' },
    );

    expect(report.identity).toEqual(identity);
    expect(report.summaryRows).toEqual([
      {
        psNo: 'PS-1234.5',
        family: 'Guide',
        mappings: 1,
        foundPs: 1,
        occurrences: 1,
        annotated: 1,
        review: 0,
        missing: 0,
        averageConfidence: 100,
        minimumConfidence: 100,
        errors: 0,
      },
      {
        psNo: 'PS-5678.1',
        family: 'Rest',
        mappings: 1,
        foundPs: 0,
        occurrences: 0,
        annotated: 0,
        review: 0,
        missing: 1,
        averageConfidence: null,
        minimumConfidence: null,
        errors: 0,
      },
    ]);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PS_ISONOTE_NOT_FOUND', psNo: 'PS-5678.1' }),
    ]));
  });

  it('marks joined matches for review and records conflicts as errors', () => {
    const joined = reference(guideMapping, {
      rawMatchedText: 'PS - 1234 .5',
      matchMethod: 'joined-text-items',
      textItemCount: 4,
    });
    const report = buildPsIsonoteAuditReport(
      [guideMapping],
      { ...scan([joined]), missingPsNumbers: [] },
      {
        identity,
        parseWarnings: ['Row 8: conflicting ISONOTE for PS-1234.5; kept row 2.'],
      },
    );

    expect(report.summaryRows[0]).toMatchObject({
      psNo: 'PS-1234.5',
      review: 1,
      errors: 1,
    });
    expect(report.occurrences[0].status).toBe('review');
  });

  it('holds stale and legacy markers for review rather than accepting them', () => {
    const stale = reference(guideMapping, {
      existingMarkerState: 'stale',
      foundMappingHash: HASH_A,
    });
    const legacy = reference(guideMapping, {
      occurrenceId: HASH_A,
      existingMarkerState: 'legacy',
    });
    const result = scan([]);
    result.detectedReferences = [stale, legacy];
    result.missingPsNumbers = [];
    result.staleExisting = [{
      psNo: stale.psNo,
      pageNumber: stale.pageNumber,
      occurrenceId: stale.occurrenceId,
      expectedMappingHash: stale.mappingHash,
      foundMappingHash: stale.foundMappingHash,
    }];
    result.legacyExisting = [{
      psNo: legacy.psNo,
      pageNumber: legacy.pageNumber,
      occurrenceId: legacy.occurrenceId,
      expectedMappingHash: legacy.mappingHash,
    }];

    const report = buildPsIsonoteAuditReport([guideMapping], result, { identity });

    expect(report.summaryRows[0].review).toBe(2);
    expect(report.occurrences.map((item) => item.status)).toEqual([
      'stale-existing',
      'legacy-existing',
    ]);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PS_ISONOTE_STALE_EXISTING' }),
      expect.objectContaining({ code: 'PS_ISONOTE_LEGACY_EXISTING' }),
    ]));
  });

  it('serializes the requested PS-wise CSV columns and an identity manifest', () => {
    const report = buildPsIsonoteAuditReport(
      [guideMapping, restMapping],
      scan([reference(guideMapping)]),
      { identity },
    );
    const csv = serializePsIsonoteSummaryCsv(report);
    const manifest = JSON.parse(serializePsIsonoteAuditManifest(report)) as {
      identity: PsIsonoteAuditIdentity;
    };

    expect(csv.split('\n')[0]).toBe(
      'PS No.,Family,Mappings,Found PS,Occurrences,Annotated,Review,Missing,Average Confidence,Minimum Confidence,Errors',
    );
    expect(csv).toContain('PS-1234.5,Guide,1,1,1,0,0,0,100,100,0');
    expect(csv).toContain('PS-5678.1,Rest,1,0,0,0,0,1,,,0');
    expect(manifest.identity.runId).toBe(identity.runId);
    expect(manifest.identity.mappingSha256).toBe(identity.mappingSha256);
  });
});
